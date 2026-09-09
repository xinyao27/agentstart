use std::path::{Path, PathBuf};

use reqwest::Response;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

use super::model::{PreparedUpdate, ReleaseDownload};
use super::{UpdateError, ensure_https};

const MAX_CHECKSUM_BYTES: u64 = 1024 * 1024;
const MAX_UPDATE_BINARY_BYTES: u64 = 256 * 1024 * 1024;

pub(super) async fn prepare(
    client: &reqwest::Client,
    executable: &Path,
    download: ReleaseDownload,
    mut on_progress: impl FnMut(u8),
) -> Result<PreparedUpdate, UpdateError> {
    ensure_https(&download.binary_url)?;
    ensure_https(&download.checksums_url)?;
    let (binary_response, checksums_response) = tokio::try_join!(
        send(client, &download.binary_url, super::DOWNLOAD_TIMEOUT),
        send(client, &download.checksums_url, super::CHECKSUM_TIMEOUT)
    )?;
    if !binary_response.status().is_success() || !checksums_response.status().is_success() {
        return Err(UpdateError::ArtifactUnavailable);
    }
    let expected = expected_checksum(
        read_bounded(checksums_response, MAX_CHECKSUM_BYTES).await?,
        super::target::release_asset_name()?,
    )?;
    let staging = StagingFile::new(staging_path(executable)?);
    let actual = write_binary(
        binary_response,
        executable,
        staging.path(),
        &mut on_progress,
    )
    .await?;
    if actual != expected {
        return Err(UpdateError::ChecksumMismatch);
    }
    #[cfg(target_os = "macos")]
    super::signature::verify(staging.path()).await?;
    let staging = staging.persist();
    Ok(PreparedUpdate::new(
        executable.to_owned(),
        download.release_url,
        staging,
        download.version,
    ))
}

struct StagingFile {
    path: Option<PathBuf>,
}

impl StagingFile {
    fn new(path: PathBuf) -> Self {
        Self { path: Some(path) }
    }

    fn path(&self) -> &Path {
        self.path
            .as_deref()
            .expect("staging path exists until it is persisted")
    }

    fn persist(mut self) -> PathBuf {
        self.path
            .take()
            .expect("staging path exists until it is persisted")
    }
}

impl Drop for StagingFile {
    fn drop(&mut self) {
        if let Some(path) = self.path.take() {
            let _ = std::fs::remove_file(path);
        }
    }
}

async fn send(
    client: &reqwest::Client,
    url: &str,
    timeout: std::time::Duration,
) -> Result<Response, UpdateError> {
    client
        .get(url)
        .timeout(timeout)
        .send()
        .await
        .map_err(UpdateError::DownloadRequest)
}

async fn read_bounded(mut response: Response, maximum: u64) -> Result<Vec<u8>, UpdateError> {
    ensure_declared_size(&response, maximum)?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(UpdateError::DownloadRequest)?
    {
        let next_length = u64::try_from(bytes.len())
            .unwrap_or(u64::MAX)
            .saturating_add(u64::try_from(chunk.len()).unwrap_or(u64::MAX));
        if next_length > maximum {
            return Err(UpdateError::ArtifactTooLarge);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

async fn write_binary(
    mut response: Response,
    executable: &Path,
    staging: &Path,
    on_progress: &mut impl FnMut(u8),
) -> Result<String, UpdateError> {
    ensure_declared_size(&response, MAX_UPDATE_BINARY_BYTES)?;
    let declared = response.content_length().filter(|length| *length > 0);
    let mut options = tokio::fs::OpenOptions::new();
    options.create_new(true).write(true);
    let mut file = options.open(staging).await.map_err(UpdateError::Io)?;
    let mut digest = Sha256::new();
    let mut received = 0_u64;
    let mut last_percent = None;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(UpdateError::DownloadRequest)?
    {
        received = received
            .checked_add(u64::try_from(chunk.len()).unwrap_or(u64::MAX))
            .ok_or(UpdateError::ArtifactTooLarge)?;
        if received > MAX_UPDATE_BINARY_BYTES {
            return Err(UpdateError::ArtifactTooLarge);
        }
        file.write_all(&chunk).await.map_err(UpdateError::Io)?;
        digest.update(&chunk);
        if let Some(total) = declared {
            let percent = ((received.saturating_mul(100) / total).min(100)) as u8;
            if last_percent != Some(percent) {
                last_percent = Some(percent);
                on_progress(percent);
            }
        }
    }
    file.flush().await.map_err(UpdateError::Io)?;
    file.sync_all().await.map_err(UpdateError::Io)?;
    let permissions = tokio::fs::metadata(executable)
        .await
        .map_err(UpdateError::Io)?
        .permissions();
    tokio::fs::set_permissions(staging, permissions)
        .await
        .map_err(UpdateError::Io)?;
    on_progress(100);
    Ok(format!("{:x}", digest.finalize()))
}

fn ensure_declared_size(response: &Response, maximum: u64) -> Result<(), UpdateError> {
    if response
        .content_length()
        .is_some_and(|length| length > maximum)
    {
        return Err(UpdateError::ArtifactTooLarge);
    }
    Ok(())
}

fn expected_checksum(bytes: Vec<u8>, asset_name: &str) -> Result<String, UpdateError> {
    let text = String::from_utf8(bytes).map_err(|_| UpdateError::ChecksumMissing)?;
    let mut expected = None;
    let mut found_target = false;
    for line in text.lines() {
        let mut fields = line.split_whitespace();
        let Some(checksum) = fields.next() else {
            continue;
        };
        let Some(name) = fields.next() else {
            continue;
        };
        let name = name.strip_prefix('*').unwrap_or(name);
        if name != asset_name {
            continue;
        }
        if found_target {
            return Err(UpdateError::ChecksumAmbiguous);
        }
        found_target = true;
        if checksum.len() != 64 || !checksum.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(UpdateError::ChecksumMissing);
        }
        expected = Some(checksum.to_ascii_lowercase());
    }
    expected.ok_or(UpdateError::ChecksumMissing)
}

fn staging_path(executable: &Path) -> Result<PathBuf, UpdateError> {
    let directory = executable
        .parent()
        .ok_or(UpdateError::ExecutableDirectory)?;
    let name = executable
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(UpdateError::ExecutableName)?;
    let mut entropy = [0_u8; 8];
    getrandom::fill(&mut entropy)?;
    Ok(directory.join(format!(
        ".{name}.update-{}-{}",
        std::process::id(),
        u64::from_le_bytes(entropy)
    )))
}

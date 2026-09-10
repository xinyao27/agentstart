use std::env;
use std::io;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::Duration;

use reqwest::redirect::Policy;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

use super::ComputerUseInstallError;

const RELEASE_ROOT: &str = "https://github.com/xinyao27/agentstart/releases/download";
pub(super) const HELPER_ASSET_NAME: &str = "agentstart-computer-use-macos.zip";
const HELPER_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(60);
const CHECKSUM_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_HELPER_ARCHIVE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_CHECKSUM_BYTES: u64 = 1024 * 1024;

pub(super) async fn prepare(version: &str) -> Result<PathBuf, ComputerUseInstallError> {
    if !is_release_version(version) {
        return Err(ComputerUseInstallError::ReleaseVersionUnavailable);
    }
    let release_root = format!("{RELEASE_ROOT}/v{version}");
    let client = reqwest::Client::builder()
        .user_agent("agentstart-daemon")
        .redirect(Policy::custom(|attempt| {
            if attempt.url().scheme() == "https" && attempt.previous().len() < 10 {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()?;
    let archive_url = format!("{release_root}/{HELPER_ASSET_NAME}");
    let checksums_url = format!("{release_root}/agentstart-checksums.txt");
    let (archive_response, checksums_response) = tokio::try_join!(
        send(&client, &archive_url, HELPER_DOWNLOAD_TIMEOUT),
        send(&client, &checksums_url, CHECKSUM_DOWNLOAD_TIMEOUT)
    )?;
    if !archive_response.status().is_success() || !checksums_response.status().is_success() {
        return Err(ComputerUseInstallError::ReleaseUnavailable);
    }
    let staging_directory = create_staging_directory().await?;
    let result = prepare_archive(&staging_directory, archive_response, checksums_response).await;
    match result {
        Ok(()) => Ok(staging_directory),
        Err(error) => match cleanup(&staging_directory).await {
            Ok(()) => Err(error),
            Err(cleanup) => Err(ComputerUseInstallError::Rollback {
                install: error.to_string(),
                rollback: cleanup.to_string(),
            }),
        },
    }
}

pub(super) async fn cleanup(staging_directory: &Path) -> Result<(), io::Error> {
    match tokio::fs::remove_dir_all(staging_directory).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

async fn send(
    client: &reqwest::Client,
    url: &str,
    timeout: Duration,
) -> Result<reqwest::Response, reqwest::Error> {
    client.get(url).timeout(timeout).send().await
}

async fn prepare_archive(
    staging_directory: &Path,
    archive_response: reqwest::Response,
    checksums_response: reqwest::Response,
) -> Result<(), ComputerUseInstallError> {
    let archive_path = staging_directory.join(HELPER_ASSET_NAME);
    let (actual, checksums) = tokio::try_join!(
        write_response(archive_response, &archive_path),
        read_checksums(checksums_response)
    )?;
    let checksums = std::str::from_utf8(&checksums)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    if actual != release_checksum(checksums)? {
        return Err(ComputerUseInstallError::ChecksumMismatch);
    }
    Ok(())
}

async fn write_response(
    mut response: reqwest::Response,
    path: &Path,
) -> Result<String, ComputerUseInstallError> {
    ensure_declared_size(&response, MAX_HELPER_ARCHIVE_BYTES)?;
    let mut options = tokio::fs::OpenOptions::new();
    options.write(true).create_new(true).mode(0o600);
    let mut file = options.open(path).await?;
    let mut digest = Sha256::new();
    let mut received = 0_u64;
    while let Some(chunk) = response.chunk().await? {
        received = received
            .checked_add(u64::try_from(chunk.len()).unwrap_or(u64::MAX))
            .ok_or(ComputerUseInstallError::ArtifactTooLarge)?;
        if received > MAX_HELPER_ARCHIVE_BYTES {
            return Err(ComputerUseInstallError::ArtifactTooLarge);
        }
        file.write_all(&chunk).await?;
        digest.update(&chunk);
    }
    file.flush().await?;
    file.sync_all().await?;
    Ok(format!("{:x}", digest.finalize()))
}

async fn read_checksums(
    mut response: reqwest::Response,
) -> Result<Vec<u8>, ComputerUseInstallError> {
    ensure_declared_size(&response, MAX_CHECKSUM_BYTES)?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        let next_length = u64::try_from(bytes.len())
            .unwrap_or(u64::MAX)
            .saturating_add(u64::try_from(chunk.len()).unwrap_or(u64::MAX));
        if next_length > MAX_CHECKSUM_BYTES {
            return Err(ComputerUseInstallError::ArtifactTooLarge);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn ensure_declared_size(
    response: &reqwest::Response,
    maximum: u64,
) -> Result<(), ComputerUseInstallError> {
    if response
        .content_length()
        .is_some_and(|length| length > maximum)
    {
        Err(ComputerUseInstallError::ArtifactTooLarge)
    } else {
        Ok(())
    }
}

fn release_checksum(checksums: &str) -> Result<String, ComputerUseInstallError> {
    checksums
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>())
        .find(|fields| fields.get(1).copied() == Some(HELPER_ASSET_NAME))
        .and_then(|fields| fields.first().copied())
        .filter(|checksum| {
            checksum.len() == 64 && checksum.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
        .map(str::to_ascii_lowercase)
        .ok_or(ComputerUseInstallError::ChecksumMissing)
}

fn is_release_version(version: &str) -> bool {
    let delimiter = version.find(['-', '+']);
    let core = delimiter.map_or(version, |index| &version[..index]);
    let suffix_is_valid = delimiter.is_none_or(|index| {
        let suffix = &version[index + 1..];
        !suffix.is_empty()
            && suffix
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b'-'))
    });
    suffix_is_valid
        && core.split('.').count() == 3
        && core
            .split('.')
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
}

async fn create_staging_directory() -> Result<PathBuf, ComputerUseInstallError> {
    for _ in 0..8 {
        let mut random = [0_u8; 16];
        getrandom::fill(&mut random)
            .map_err(|error| io::Error::other(format!("OS random source failed: {error}")))?;
        let suffix = random
            .into_iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let path = env::temp_dir().join(format!("agentstart-computer-use-{suffix}"));
        match tokio::fs::create_dir(&path).await {
            Ok(()) => {
                if let Err(error) =
                    tokio::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).await
                {
                    let _ = cleanup(&path).await;
                    return Err(error.into());
                }
                return Ok(path);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not allocate computer use helper staging directory",
    )
    .into())
}

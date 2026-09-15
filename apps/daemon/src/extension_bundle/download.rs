use std::env;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

use reqwest::redirect::Policy;
use sha2::{Digest, Sha256};
use thiserror::Error;
use tokio::io::AsyncWriteExt;

const RELEASE_ROOT: &str = "https://github.com/xinyao27/agentstart/releases/download";
const CHECKSUM_ASSET_NAME: &str = "agentstart-checksums.txt";
const ARCHIVE_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(120);
const CHECKSUM_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_ARCHIVE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_CHECKSUM_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Error)]
pub(crate) enum BundleDownloadError {
    #[error("extension_bundle_release_version_unavailable")]
    ReleaseVersionUnavailable,
    #[error("extension_bundle_release_unavailable")]
    ReleaseUnavailable,
    #[error("extension_bundle_checksum_missing")]
    ChecksumMissing,
    #[error("extension_bundle_checksum_mismatch")]
    ChecksumMismatch,
    #[error("extension_bundle_artifact_too_large")]
    ArtifactTooLarge,
    #[error("extension bundle download transport failed: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("extension bundle download io failed: {0}")]
    Io(#[from] io::Error),
}

pub(super) fn archive_name(version: &str) -> String {
    format!("agentstart-extension-{version}.zip")
}

pub(super) async fn fetch(version: &str) -> Result<PathBuf, BundleDownloadError> {
    if !crate::update::is_release_version(version) {
        return Err(BundleDownloadError::ReleaseVersionUnavailable);
    }
    let release_root = format!("{RELEASE_ROOT}/v{version}");
    let asset = archive_name(version);
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
    let archive_url = format!("{release_root}/{asset}");
    let checksums_url = format!("{release_root}/{CHECKSUM_ASSET_NAME}");
    let (archive_response, checksums_response) = tokio::try_join!(
        send(&client, &archive_url, ARCHIVE_DOWNLOAD_TIMEOUT),
        send(&client, &checksums_url, CHECKSUM_DOWNLOAD_TIMEOUT)
    )?;
    if !archive_response.status().is_success() || !checksums_response.status().is_success() {
        return Err(BundleDownloadError::ReleaseUnavailable);
    }
    let destination = staging_path()?;
    let result =
        write_verified_archive(&asset, archive_response, checksums_response, &destination).await;
    if result.is_err() {
        discard(&destination).await;
    }
    result?;
    Ok(destination)
}

pub(super) async fn discard(path: &Path) {
    let _ = tokio::fs::remove_file(path).await;
}

async fn send(
    client: &reqwest::Client,
    url: &str,
    timeout: Duration,
) -> Result<reqwest::Response, reqwest::Error> {
    client.get(url).timeout(timeout).send().await
}

async fn write_verified_archive(
    asset: &str,
    archive_response: reqwest::Response,
    checksums_response: reqwest::Response,
    destination: &Path,
) -> Result<(), BundleDownloadError> {
    let (actual, checksums) = tokio::try_join!(
        write_response(archive_response, destination),
        read_checksums(checksums_response)
    )?;
    let checksums = std::str::from_utf8(&checksums)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    if actual != release_checksum(checksums, asset)? {
        return Err(BundleDownloadError::ChecksumMismatch);
    }
    Ok(())
}

async fn write_response(
    mut response: reqwest::Response,
    path: &Path,
) -> Result<String, BundleDownloadError> {
    ensure_declared_size(&response, MAX_ARCHIVE_BYTES)?;
    let mut file = tokio::fs::File::create(path).await?;
    let mut digest = Sha256::new();
    let mut received = 0_u64;
    while let Some(chunk) = response.chunk().await? {
        received = received
            .checked_add(u64::try_from(chunk.len()).unwrap_or(u64::MAX))
            .ok_or(BundleDownloadError::ArtifactTooLarge)?;
        if received > MAX_ARCHIVE_BYTES {
            return Err(BundleDownloadError::ArtifactTooLarge);
        }
        file.write_all(&chunk).await?;
        digest.update(&chunk);
    }
    file.flush().await?;
    Ok(format!("{:x}", digest.finalize()))
}

async fn read_checksums(mut response: reqwest::Response) -> Result<Vec<u8>, BundleDownloadError> {
    ensure_declared_size(&response, MAX_CHECKSUM_BYTES)?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        let next_length = u64::try_from(bytes.len())
            .unwrap_or(u64::MAX)
            .saturating_add(u64::try_from(chunk.len()).unwrap_or(u64::MAX));
        if next_length > MAX_CHECKSUM_BYTES {
            return Err(BundleDownloadError::ArtifactTooLarge);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn ensure_declared_size(
    response: &reqwest::Response,
    maximum: u64,
) -> Result<(), BundleDownloadError> {
    if response
        .content_length()
        .is_some_and(|length| length > maximum)
    {
        Err(BundleDownloadError::ArtifactTooLarge)
    } else {
        Ok(())
    }
}

fn release_checksum(checksums: &str, asset: &str) -> Result<String, BundleDownloadError> {
    checksums
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>())
        .find(|fields| fields.get(1).copied() == Some(asset))
        .and_then(|fields| fields.first().copied())
        .filter(|checksum| {
            checksum.len() == 64 && checksum.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
        .map(str::to_ascii_lowercase)
        .ok_or(BundleDownloadError::ChecksumMissing)
}

fn staging_path() -> Result<PathBuf, BundleDownloadError> {
    let mut random = [0_u8; 16];
    getrandom::fill(&mut random)
        .map_err(|error| io::Error::other(format!("OS random source failed: {error}")))?;
    let suffix = random
        .into_iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Ok(env::temp_dir().join(format!("agentstart-extension-{suffix}.zip")))
}

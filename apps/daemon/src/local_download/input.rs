use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use super::{LocalDownloadError, filename};

const MAX_FILE_CHUNK_BYTES: usize = 512 * 1024;
const MAX_FOLDER_CHUNK_BYTES: usize = 512 * 1024;
const MAX_FOLDER_PATH_UTF8_BYTES: usize = 256 * 1024;
const MAX_FOLDER_PATH_SEGMENTS: usize = 1_024;
const MAX_SUGGESTED_NAME_UTF8_BYTES: usize = 1_024;
const MAX_TRANSFER_ID_UTF8_BYTES: usize = 128;

pub(super) fn validate_owner(owner_id: &str) -> Result<(), LocalDownloadError> {
    if owner_id.is_empty() {
        Err(LocalDownloadError::InvalidInput("owner is required"))
    } else {
        Ok(())
    }
}

pub(super) fn validate_suggested_name(suggested_name: &str) -> Result<(), LocalDownloadError> {
    if suggested_name.trim().is_empty() || suggested_name.len() > MAX_SUGGESTED_NAME_UTF8_BYTES {
        Err(LocalDownloadError::InvalidInput(
            "suggested name is required",
        ))
    } else {
        Ok(())
    }
}

pub(super) fn validate_transfer_id(transfer_id: &str) -> Result<(), LocalDownloadError> {
    if transfer_id.is_empty() || transfer_id.len() > MAX_TRANSFER_ID_UTF8_BYTES {
        Err(LocalDownloadError::InvalidInput("transfer ID is invalid"))
    } else {
        Ok(())
    }
}

pub(super) fn validate_file_chunk(content: &[u8]) -> Result<(), LocalDownloadError> {
    if content.len() > MAX_FILE_CHUNK_BYTES {
        Err(LocalDownloadError::InvalidInput(
            "download chunk is too large",
        ))
    } else {
        Ok(())
    }
}

pub(super) fn validate_folder_chunk(content: &[u8]) -> Result<(), LocalDownloadError> {
    if content.len() > MAX_FOLDER_CHUNK_BYTES {
        Err(LocalDownloadError::InvalidInput(
            "folder download chunk is too large",
        ))
    } else {
        Ok(())
    }
}

pub(super) fn validate_path_segments(
    segments: &[String],
) -> Result<Vec<String>, LocalDownloadError> {
    if segments.is_empty()
        || segments.len() > MAX_FOLDER_PATH_SEGMENTS
        || segments
            .iter()
            .try_fold(0_usize, |length, segment| length.checked_add(segment.len()))
            .is_none_or(|length| length > MAX_FOLDER_PATH_UTF8_BYTES)
    {
        return Err(LocalDownloadError::InvalidInput(
            "path segments must identify a folder entry",
        ));
    }
    segments
        .iter()
        .map(|segment| {
            if segment.is_empty()
                || matches!(segment.as_str(), "." | "..")
                || segment.contains('/')
                || segment.contains('\\')
                || segment.contains('\0')
            {
                return Err(LocalDownloadError::InvalidInput(
                    "path segment contains an invalid entry name",
                ));
            }
            Ok(filename::sanitize(segment))
        })
        .collect()
}

pub(super) async fn path_exists(path: &Path) -> Result<bool, LocalDownloadError> {
    match tokio::fs::symlink_metadata(path).await {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(LocalDownloadError::Io(error)),
    }
}

pub(super) fn ensure_not_cancelled(cancelled: &AtomicBool) -> Result<(), LocalDownloadError> {
    if cancelled.load(Ordering::Acquire) {
        Err(LocalDownloadError::Cancelled)
    } else {
        Ok(())
    }
}

pub(super) fn destination_exists_error() -> LocalDownloadError {
    LocalDownloadError::Io(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "destination folder already exists",
    ))
}

pub(super) fn sibling_transfer_path(destination: &Path, transfer_id: &str) -> PathBuf {
    destination.with_file_name(format!(".{transfer_id}.download"))
}

pub(super) fn path_string(path: &Path) -> Result<String, LocalDownloadError> {
    path.to_str()
        .map(str::to_owned)
        .ok_or(LocalDownloadError::PathEncoding)
}

pub(super) fn random_uuid() -> Result<String, LocalDownloadError> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(|error| LocalDownloadError::Io(io::Error::other(error)))?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    ))
}

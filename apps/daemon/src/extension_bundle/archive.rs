use std::fs;
use std::io;
use std::path::Path;
use std::time::Duration;

use thiserror::Error;

const MANIFEST_FILE_NAME: &str = "manifest.json";
const STAGING_PREFIX: &str = ".ChromeExtension-staging-";
const BACKUP_PREFIX: &str = ".ChromeExtension-backup-";
const REPLACE_ATTEMPTS: u32 = 5;
const REPLACE_RETRY_DELAY: Duration = Duration::from_millis(200);

#[derive(Debug, Error)]
pub(crate) enum BundleArchiveError {
    #[error("extension_bundle_directory_unavailable")]
    DirectoryUnavailable,
    #[error("extension_bundle_archive_entry_unsafe")]
    UnsafeEntry,
    #[error("extension_bundle_archive_missing_manifest")]
    MissingManifest,
    #[error("extension bundle archive is unreadable: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("extension bundle staging failed: {0}")]
    Io(#[from] io::Error),
    #[error(
        "extension bundle staging failed: {install}; the previous bundle could not be restored: {rollback}"
    )]
    Rollback { install: String, rollback: String },
}

pub(super) async fn replace(
    archive_path: &Path,
    directory: &Path,
) -> Result<(), BundleArchiveError> {
    let archive_path = archive_path.to_owned();
    let directory = directory.to_owned();
    // Why: ZIP entry decoding and the directory swap are blocking filesystem work, and the install
    // command runs on the shared executor, where stalling would stall every other command.
    tokio::task::spawn_blocking(move || replace_blocking(&archive_path, &directory))
        .await
        .map_err(io::Error::other)??;
    Ok(())
}

fn replace_blocking(archive_path: &Path, directory: &Path) -> Result<(), BundleArchiveError> {
    let parent = directory
        .parent()
        .ok_or(BundleArchiveError::DirectoryUnavailable)?;
    fs::create_dir_all(parent)?;
    let staging = parent.join(format!("{STAGING_PREFIX}{}", random_suffix()?));
    extract(archive_path, &staging)?;
    if !staging.join(MANIFEST_FILE_NAME).is_file() {
        let _ = fs::remove_dir_all(&staging);
        return Err(BundleArchiveError::MissingManifest);
    }
    swap(&staging, directory, parent)
}

fn swap(staging: &Path, directory: &Path, parent: &Path) -> Result<(), BundleArchiveError> {
    let backup = if directory.is_dir() {
        let backup = parent.join(format!("{BACKUP_PREFIX}{}", random_suffix()?));
        // Why: Windows refuses to rename a directory a running Chrome still holds open, so the swap
        // retries before giving up and reports the failure instead of leaving a partial bundle.
        rename_with_retry(directory, &backup)?;
        Some(backup)
    } else {
        None
    };
    if let Err(error) = rename_with_retry(staging, directory) {
        if let Some(backup) = backup.as_deref()
            && let Err(rollback) = rename_with_retry(backup, directory)
        {
            return Err(BundleArchiveError::Rollback {
                install: error.to_string(),
                rollback: rollback.to_string(),
            });
        }
        let _ = fs::remove_dir_all(staging);
        return Err(error.into());
    }
    if let Some(backup) = backup.as_deref() {
        let _ = fs::remove_dir_all(backup);
    }
    Ok(())
}

fn extract(archive_path: &Path, staging: &Path) -> Result<(), BundleArchiveError> {
    let mut archive = zip::ZipArchive::new(fs::File::open(archive_path)?)?;
    fs::create_dir_all(staging)?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        // Why: an archive is untrusted input even once it is checksum-verified, and `enclosed_name`
        // is what stops a crafted ".." entry from writing outside the staging directory.
        let relative = entry
            .enclosed_name()
            .ok_or(BundleArchiveError::UnsafeEntry)?;
        let destination = staging.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&destination)?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        io::copy(&mut entry, &mut fs::File::create(&destination)?)?;
    }
    Ok(())
}

fn rename_with_retry(from: &Path, to: &Path) -> io::Result<()> {
    let mut delay = REPLACE_RETRY_DELAY;
    for _ in 1..REPLACE_ATTEMPTS {
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(_) => {
                std::thread::sleep(delay);
                delay *= 2;
            }
        }
    }
    fs::rename(from, to)
}

fn random_suffix() -> Result<String, BundleArchiveError> {
    let mut random = [0_u8; 16];
    getrandom::fill(&mut random).map_err(|error| {
        BundleArchiveError::Io(io::Error::other(format!(
            "OS random source failed: {error}"
        )))
    })?;
    Ok(random
        .into_iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

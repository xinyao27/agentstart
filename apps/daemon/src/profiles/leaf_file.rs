use std::fs::{File, OpenOptions};
use std::io::{self, Read};
use std::path::Path;

use super::index::ProfileError;

pub(super) fn read(path: &Path, maximum_bytes: u64) -> Result<Option<Vec<u8>>, ProfileError> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => metadata,
        Ok(_) => return Err(ProfileError::MigrationConflict(path.to_owned())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if metadata.len() > maximum_bytes {
        return Err(ProfileError::MigrationCapacity);
    }
    let file = open_without_following(path).map_err(|error| {
        if is_symlink_error(&error) {
            ProfileError::MigrationConflict(path.to_owned())
        } else {
            error.into()
        }
    })?;
    let opened = file.metadata()?;
    if !opened.file_type().is_file() || opened.len() > maximum_bytes {
        return Err(if opened.file_type().is_file() {
            ProfileError::MigrationCapacity
        } else {
            ProfileError::MigrationConflict(path.to_owned())
        });
    }
    let capacity = usize::try_from(opened.len()).unwrap_or(0);
    let mut bytes = Vec::with_capacity(capacity);
    file.take(maximum_bytes.saturating_add(1))
        .read_to_end(&mut bytes)?;
    if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > maximum_bytes {
        return Err(ProfileError::MigrationCapacity);
    }
    Ok(Some(bytes))
}

pub(super) fn exists(path: &Path) -> Result<bool, ProfileError> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(true),
        Ok(_) => Err(ProfileError::MigrationConflict(path.to_owned())),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

pub(super) fn write(path: &Path, contents: &[u8]) -> Result<(), ProfileError> {
    let _ = exists(path)?;
    crate::transport::secure_file::write_bytes(path, contents)?;
    Ok(())
}

fn open_without_following(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    configure_no_follow(&mut options);
    options.open(path)
}

#[cfg(unix)]
fn configure_no_follow(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt as _;

    options.custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_NONBLOCK);
}

#[cfg(windows)]
fn configure_no_follow(options: &mut OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt as _;

    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(not(any(unix, windows)))]
fn configure_no_follow(_options: &mut OpenOptions) {}

#[cfg(unix)]
fn is_symlink_error(error: &io::Error) -> bool {
    error.raw_os_error() == Some(nix::libc::ELOOP)
}

#[cfg(not(unix))]
fn is_symlink_error(_error: &io::Error) -> bool {
    false
}

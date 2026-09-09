use std::fs::{self, File, OpenOptions};
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use super::ComputerError;

#[cfg(not(windows))]
const SCRIPT_BYTES: &[u8] = include_bytes!("../../resources/computer-use-linux/runtime.py");
#[cfg(windows)]
const SCRIPT_BYTES: &[u8] = include_bytes!("../../resources/computer-use-windows/runtime.ps1");
#[cfg(not(windows))]
const SCRIPT_FILE_NAME: &str = "runtime.py";
#[cfg(windows)]
const SCRIPT_FILE_NAME: &str = "runtime.ps1";

pub(super) fn materialize(user_data_path: &Path) -> Result<PathBuf, ComputerError> {
    validate_directory(user_data_path).map_err(resource_io)?;
    crate::transport::secure_file::ensure_secure_directory(user_data_path)
        .map_err(|error| resource_io(io::Error::other(error)))?;
    validate_directory(user_data_path).map_err(resource_io)?;
    let resource_root = ensure_private_child(user_data_path, "native")?;
    let computer_use_root = ensure_private_child(&resource_root, "computer-use")?;
    let script_root = ensure_private_child(&computer_use_root, "scripts")?;
    let digest = content_digest(SCRIPT_BYTES);
    let version_root = ensure_private_child(&script_root, &digest)?;
    let target = version_root.join(SCRIPT_FILE_NAME);

    match read_private_file(&target) {
        Ok(existing) if existing == SCRIPT_BYTES => return Ok(target),
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(resource_io(error)),
    }

    crate::transport::secure_file::write_bytes(&target, SCRIPT_BYTES)
        .map_err(|error| resource_io(io::Error::other(error)))?;
    let written = read_private_file(&target).map_err(resource_io)?;
    if written != SCRIPT_BYTES {
        return Err(ComputerError::domain(
            "accessibility_error",
            "embedded computer-use resource changed while being materialized",
        ));
    }
    Ok(target)
}

fn ensure_private_child(parent: &Path, name: &str) -> Result<PathBuf, ComputerError> {
    validate_directory(parent).map_err(resource_io)?;
    let path = parent.join(name);
    match fs::create_dir(&path) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(resource_io(error)),
    }
    validate_directory(&path).map_err(resource_io)?;
    crate::transport::secure_file::ensure_secure_directory(&path)
        .map_err(|error| resource_io(io::Error::other(error)))?;
    validate_directory(&path).map_err(resource_io)?;
    Ok(path)
}

fn validate_directory(path: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink()
        || !metadata.file_type().is_dir()
        || has_reparse_attribute(&metadata)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!(
                "computer-use resource directory is not a private real directory: {}",
                path.display()
            ),
        ));
    }
    Ok(())
}

fn read_private_file(path: &Path) -> io::Result<Vec<u8>> {
    let path_metadata = fs::symlink_metadata(path)?;
    if path_metadata.file_type().is_symlink()
        || !path_metadata.file_type().is_file()
        || has_reparse_attribute(&path_metadata)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!(
                "computer-use resource is not a private regular file: {}",
                path.display()
            ),
        ));
    }
    let mut options = OpenOptions::new();
    options.read(true);
    configure_no_follow(&mut options);
    let mut file = options.open(path)?;
    validate_open_file(path, &file, &path_metadata)?;
    let mut bytes = Vec::with_capacity(SCRIPT_BYTES.len());
    file.by_ref()
        .take(u64::try_from(SCRIPT_BYTES.len()).unwrap_or(u64::MAX) + 1)
        .read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn validate_open_file(path: &Path, file: &File, path_metadata: &fs::Metadata) -> io::Result<()> {
    let metadata = file.metadata()?;
    if !metadata.file_type().is_file() || has_reparse_attribute(&metadata) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "computer-use resource handle is not a private regular file",
        ));
    }
    if !same_file(path, file, path_metadata, &metadata)? {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "computer-use resource changed while its handle was opened",
        ));
    }
    Ok(())
}

#[cfg(unix)]
fn same_file(
    _path: &Path,
    _file: &File,
    left: &fs::Metadata,
    right: &fs::Metadata,
) -> io::Result<bool> {
    use std::os::unix::fs::MetadataExt;

    Ok(left.dev() == right.dev() && left.ino() == right.ino())
}

#[cfg(windows)]
fn same_file(
    path: &Path,
    file: &File,
    _left: &fs::Metadata,
    _right: &fs::Metadata,
) -> io::Result<bool> {
    Ok(same_file::Handle::from_file(file.try_clone()?)? == same_file::Handle::from_path(path)?)
}

#[cfg(not(any(unix, windows)))]
fn same_file(
    _path: &Path,
    _file: &File,
    _left: &fs::Metadata,
    _right: &fs::Metadata,
) -> io::Result<bool> {
    Ok(false)
}

#[cfg(unix)]
fn configure_no_follow(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;

    options.custom_flags(rustix::fs::OFlags::NOFOLLOW.bits() as i32);
}

#[cfg(windows)]
fn configure_no_follow(options: &mut OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt;
    use windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT;

    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(not(any(unix, windows)))]
fn configure_no_follow(_options: &mut OpenOptions) {}

#[cfg(windows)]
fn has_reparse_attribute(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;

    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn has_reparse_attribute(_metadata: &fs::Metadata) -> bool {
    false
}

fn content_digest(contents: &[u8]) -> String {
    Sha256::digest(contents)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn resource_io(error: io::Error) -> ComputerError {
    ComputerError::domain(
        "accessibility_error",
        format!("computer-use embedded resource failed: {error}"),
    )
}

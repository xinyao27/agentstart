use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use thiserror::Error;

use crate::atomic_file_replace;

#[derive(Debug, Error)]
pub(crate) enum SecureFileError {
    #[error("secure file I/O failed: {0}")]
    Io(#[from] io::Error),
    #[error("secure JSON serialization failed: {0}")]
    Json(#[from] serde_json::Error),
    #[cfg(windows)]
    #[error("daemon_secure_file_acl_failed")]
    WindowsAcl,
}

#[derive(Debug, Error)]
pub(crate) enum SecureFileCommitError {
    #[error("secure file write failed before replacement: {0}")]
    BeforeCommit(SecureFileError),
    #[error("secure file replacement committed but durability confirmation failed: {0}")]
    Committed(SecureFileError),
}

pub(crate) fn write_json(target: &Path, value: &impl Serialize) -> Result<(), SecureFileError> {
    let mut contents = serde_json::to_string_pretty(value)?;
    contents.push('\n');
    write_bytes(target, contents.as_bytes())
}

pub(crate) fn write_bytes(target: &Path, contents: &[u8]) -> Result<(), SecureFileError> {
    write_bytes_committing(target, contents).map_err(|error| match error {
        SecureFileCommitError::BeforeCommit(error) | SecureFileCommitError::Committed(error) => {
            error
        }
    })
}

pub(crate) fn write_bytes_committing(
    target: &Path,
    contents: &[u8],
) -> Result<(), SecureFileCommitError> {
    let directory = target.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "secure file has no parent directory",
        )
    });
    let directory = directory
        .map_err(SecureFileError::from)
        .map_err(SecureFileCommitError::BeforeCommit)?;
    ensure_secure_directory(directory).map_err(SecureFileCommitError::BeforeCommit)?;
    let temporary = temporary_path(target).map_err(SecureFileCommitError::BeforeCommit)?;
    let prepared = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        configure_secure_create(&mut options);
        let mut file = options.open(&temporary)?;
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);
        harden_path(&temporary, false)?;
        Ok::<_, SecureFileError>(())
    })();
    if let Err(error) = prepared {
        let _ = fs::remove_file(&temporary);
        return Err(SecureFileCommitError::BeforeCommit(error));
    }
    if let Err(error) = atomic_file_replace::replace(&temporary, target) {
        let _ = fs::remove_file(&temporary);
        return Err(SecureFileCommitError::BeforeCommit(error.into()));
    }
    sync_directory(directory).map_err(SecureFileCommitError::Committed)
}

pub(crate) fn harden_existing_file(path: &Path) -> Result<(), SecureFileError> {
    harden_path(path, false)
}

/// A directory that was hardened and fingerprinted once, so repeated writes into
/// it cost no permission work.
///
/// Why: `write_bytes` hardens the directory and the staging file on every call,
/// which on Windows means two `icacls` subprocesses per write. A debounced
/// writer does that on a timer forever. Hardening once and recording the
/// directory's identity keeps the same restriction while reducing each later
/// write to plain filesystem syscalls, and the recorded identity is what lets a
/// write refuse a directory that was replaced or re-owned in the meantime.
#[derive(Clone)]
pub(crate) struct HardenedDirectory {
    identity: DirectoryIdentity,
    identity_handle: Arc<same_file::Handle>,
    path: PathBuf,
}

impl HardenedDirectory {
    /// Creates the directory when missing, hardens it, and records its identity.
    /// This is the only place that performs permission work.
    pub(crate) fn open(path: &Path) -> Result<Self, SecureFileError> {
        ensure_secure_directory(path)?;
        let identity = DirectoryIdentity::capture(path)?;
        let identity_handle = Arc::new(same_file::Handle::from_path(path)?);
        if DirectoryIdentity::capture(path)? != identity {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "secure directory changed while it was opened",
            )
            .into());
        }
        Ok(Self {
            identity,
            identity_handle,
            path: path.to_owned(),
        })
    }

    /// Stages `contents` beside `target` and atomically replaces it.
    ///
    /// Why: identical to `write_bytes_committing` except that the directory is
    /// already hardened and the staging file inherits its permissions, so no
    /// permission work runs here.
    pub(crate) fn write_bytes(
        &self,
        target: &Path,
        contents: &[u8],
    ) -> Result<(), SecureFileCommitError> {
        self.admit(target)
            .map_err(SecureFileCommitError::BeforeCommit)?;
        let temporary = temporary_path(target).map_err(SecureFileCommitError::BeforeCommit)?;
        let prepared = (|| {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            configure_secure_create(&mut options);
            let mut file = options.open(&temporary)?;
            file.write_all(contents)?;
            file.sync_all()?;
            drop(file);
            Ok::<_, SecureFileError>(())
        })();
        if let Err(error) = prepared {
            let _ = fs::remove_file(&temporary);
            return Err(SecureFileCommitError::BeforeCommit(error));
        }
        if let Err(error) = atomic_file_replace::replace(&temporary, target) {
            let _ = fs::remove_file(&temporary);
            return Err(SecureFileCommitError::BeforeCommit(error.into()));
        }
        sync_directory(&self.path).map_err(SecureFileCommitError::Committed)
    }

    /// Why: a stale handle must not write through a directory that is no longer
    /// the one that was hardened, and `target` must sit directly inside it so the
    /// staging file shares its inherited permissions.
    fn admit(&self, target: &Path) -> Result<(), SecureFileError> {
        if target.parent() != Some(self.path.as_path()) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "secure file is not inside its hardened directory",
            )
            .into());
        }
        if DirectoryIdentity::capture(&self.path)? != self.identity {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "secure directory changed since it was hardened",
            )
            .into());
        }
        if same_file::Handle::from_path(&self.path)? != *self.identity_handle {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "secure directory identity changed since it was hardened",
            )
            .into());
        }
        Ok(())
    }
}

/// Fields chosen so a replacement is detectable without opening the directory.
#[derive(Clone, Copy, PartialEq, Eq)]
struct DirectoryIdentity {
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    group: u32,
    #[cfg(unix)]
    inode: u64,
    #[cfg(unix)]
    mode: u32,
    #[cfg(unix)]
    owner: u32,
    #[cfg(windows)]
    attributes: u32,
    #[cfg(windows)]
    created: u64,
}

impl DirectoryIdentity {
    /// Why: `symlink_metadata` never traverses, so a directory swapped for a link
    /// is reported as the link it now is and fails the directory check.
    fn capture(path: &Path) -> Result<Self, SecureFileError> {
        let metadata = fs::symlink_metadata(path)?;
        if !metadata.file_type().is_dir() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "secure directory path is not a directory",
            )
            .into());
        }
        Self::from_metadata(&metadata)
    }

    /// Why: `device`/`inode` catch a replaced directory, `owner`/`group` catch
    /// ownership drift, and `mode` catches a widened directory.
    #[cfg(unix)]
    fn from_metadata(metadata: &fs::Metadata) -> Result<Self, SecureFileError> {
        use std::os::unix::fs::MetadataExt;

        Ok(Self {
            device: metadata.dev(),
            group: metadata.gid(),
            inode: metadata.ino(),
            mode: metadata.mode() & 0o7777,
            owner: metadata.uid(),
        })
    }

    /// Why: Windows exposes no stable inode, so the creation timestamp stands in
    /// for identity and the attributes reject a directory that became a reparse
    /// point after it was hardened.
    #[cfg(windows)]
    fn from_metadata(metadata: &fs::Metadata) -> Result<Self, SecureFileError> {
        use std::os::windows::fs::MetadataExt;

        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
        let attributes = metadata.file_attributes();
        if attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "secure directory is a reparse point",
            )
            .into());
        }
        Ok(Self {
            attributes,
            created: metadata.creation_time(),
        })
    }

    #[cfg(not(any(unix, windows)))]
    fn from_metadata(_metadata: &fs::Metadata) -> Result<Self, SecureFileError> {
        Ok(Self {})
    }
}

#[cfg(unix)]
fn sync_directory(directory: &Path) -> Result<(), SecureFileError> {
    fs::File::open(directory)?.sync_all()?;
    Ok(())
}

#[cfg(not(unix))]
fn sync_directory(_directory: &Path) -> Result<(), SecureFileError> {
    Ok(())
}

pub(crate) fn ensure_secure_directory(directory: &Path) -> Result<(), SecureFileError> {
    match fs::symlink_metadata(directory) {
        Ok(metadata) if metadata.file_type().is_dir() => {}
        Ok(_) => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "secure directory path is not a directory",
            )
            .into());
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => create_directories(directory)?,
        Err(error) => return Err(error.into()),
    }
    if !fs::symlink_metadata(directory)?.file_type().is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "secure directory path was replaced",
        )
        .into());
    }
    harden_path(directory, true)
}

#[cfg(unix)]
fn create_directories(directory: &Path) -> Result<(), io::Error> {
    use std::os::unix::fs::DirBuilderExt;

    let mut builder = fs::DirBuilder::new();
    builder.recursive(true).mode(0o700).create(directory)
}

#[cfg(not(unix))]
fn create_directories(directory: &Path) -> Result<(), io::Error> {
    fs::create_dir_all(directory)
}

fn temporary_path(target: &Path) -> Result<PathBuf, SecureFileError> {
    let mut random = [0_u8; 16];
    getrandom::fill(&mut random)
        .map_err(|error| io::Error::other(format!("OS random source failed: {error}")))?;
    let suffix = random
        .into_iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let file_name = target
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "secure file has no name"))?
        .to_string_lossy();
    Ok(target.with_file_name(format!("{file_name}.{}.{suffix}.tmp", std::process::id())))
}

/// Why: `create_new` already refuses a pre-created staging path, so `O_NOFOLLOW`
/// is belt-and-braces — it keeps the guarantee on this handle if the exclusive
/// create is ever relaxed, and states at the open site that the write must never
/// traverse a symlink planted by another user.
#[cfg(unix)]
fn configure_secure_create(options: &mut OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt;

    options.mode(0o600).custom_flags(nix::libc::O_NOFOLLOW);
}

/// Why: the Windows counterpart — without this flag an exclusive create can
/// still be satisfied through a reparse point.
#[cfg(windows)]
fn configure_secure_create(options: &mut OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt;

    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(not(any(unix, windows)))]
fn configure_secure_create(_options: &mut OpenOptions) {}

#[cfg(unix)]
fn harden_path(path: &Path, is_directory: bool) -> Result<(), SecureFileError> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(
        path,
        fs::Permissions::from_mode(if is_directory { 0o700 } else { 0o600 }),
    )?;
    Ok(())
}

#[cfg(windows)]
fn harden_path(path: &Path, is_directory: bool) -> Result<(), SecureFileError> {
    use std::process::Command;

    let sid_output = Command::new(windows_system_executable("whoami.exe"))
        .args(["/user", "/fo", "csv", "/nh"])
        .output()?;
    let output = String::from_utf8_lossy(&sid_output.stdout);
    let sid = output
        .split('"')
        .find(|field| field.starts_with("S-") && field[2..].split('-').all(is_decimal))
        .ok_or(SecureFileError::WindowsAcl)?;
    // Why: object and container inheritance on a directory is what lets a
    // `create_new` file receive this same owner-only entry without another
    // `icacls` run. The grant stays owner-only, so children end up narrower than
    // the token default they would otherwise get, never wider. `/inheritance:r`
    // below still drops everything inherited from the parent.
    let grant = if is_directory {
        format!("*{sid}:(OI)(CI)F")
    } else {
        format!("*{sid}:(F)")
    };
    let status = Command::new(windows_system_executable("icacls.exe"))
        .arg(path)
        .args(["/inheritance:r", "/grant:r", &grant, "/c", "/q"])
        .status()?;
    if !status.success() {
        return Err(SecureFileError::WindowsAcl);
    }
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn harden_path(_path: &Path, _is_directory: bool) -> Result<(), SecureFileError> {
    Ok(())
}

#[cfg(windows)]
fn is_decimal(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit())
}

#[cfg(windows)]
fn windows_system_executable(name: &str) -> PathBuf {
    std::env::var("SystemRoot")
        .ok()
        .map(|root| root.trim().to_owned())
        .filter(|root| !root.is_empty())
        .map(|root| PathBuf::from(root).join("System32").join(name))
        .unwrap_or_else(|| PathBuf::from(name))
}

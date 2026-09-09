use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

use super::AgentStatusHooksError;

pub(super) fn write_json(
    path: &Path,
    document: &Map<String, Value>,
) -> Result<(), AgentStatusHooksError> {
    let serialized = format!("{}\n", serde_json::to_string_pretty(document)?);
    write_atomic(path, serialized.as_bytes(), None, true)
}

pub(super) fn write_text(path: &Path, content: &str) -> Result<(), AgentStatusHooksError> {
    write_atomic(path, content.as_bytes(), existing_mode(path), true)
}

pub(super) fn write_script(path: &Path, content: &str) -> Result<(), AgentStatusHooksError> {
    if fs::read(path).ok().as_deref() == Some(content.as_bytes()) {
        set_executable(path)?;
        return Ok(());
    }
    write_atomic(path, content.as_bytes(), script_mode(), false)
}

pub(super) fn remove_file(path: &Path) -> Result<(), AgentStatusHooksError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn write_atomic(
    lexical_path: &Path,
    content: &[u8],
    mode: Option<u32>,
    backup: bool,
) -> Result<(), AgentStatusHooksError> {
    let path = write_path(lexical_path)?;
    if fs::read(&path).ok().as_deref() == Some(content) {
        return Ok(());
    }
    let directory = path.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "hook path has no parent directory",
        )
    })?;
    fs::create_dir_all(directory)?;
    let temporary = temporary_path(&path)?;
    let result = (|| {
        write_temporary(&temporary, content, mode)?;
        if backup && path.exists() {
            write_backup(&path)?;
        }
        crate::atomic_file_replace::replace(&temporary, &path)?;
        Ok::<_, AgentStatusHooksError>(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn write_path(path: &Path) -> Result<PathBuf, AgentStatusHooksError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Ok(fs::canonicalize(path)?),
        Ok(_) => Ok(path.to_owned()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(path.to_owned()),
        Err(error) => Err(error.into()),
    }
}

fn write_temporary(
    path: &Path,
    content: &[u8],
    mode: Option<u32>,
) -> Result<(), AgentStatusHooksError> {
    match open_temporary(path, mode).and_then(|mut file| file.write_all(content)) {
        Ok(()) => Ok(()),
        Err(error) if is_permission_error(&error) && cfg!(windows) => {
            let _ = fs::remove_file(path);
            grant_directory_acl(path.parent().unwrap_or(path));
            let mut file = open_temporary(path, mode)?;
            file.write_all(content)?;
            Ok(())
        }
        Err(error) => Err(error.into()),
    }
}

fn open_temporary(path: &Path, mode: Option<u32>) -> io::Result<fs::File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(mode.unwrap_or(0o666));
    }
    #[cfg(not(unix))]
    let _ = mode;
    options.open(path)
}

fn write_backup(source: &Path) -> Result<(), AgentStatusHooksError> {
    let backup = suffixed(source, ".bak");
    if fs::symlink_metadata(&backup).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        return Err(io::Error::other(format!(
            "refusing to overwrite symlinked backup {}",
            backup.display()
        ))
        .into());
    }
    let temporary = temporary_path(&backup)?;
    let result = (|| {
        fs::copy(source, &temporary)?;
        crate::atomic_file_replace::replace(&temporary, &backup)?;
        Ok::<_, AgentStatusHooksError>(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn temporary_path(path: &Path) -> Result<PathBuf, AgentStatusHooksError> {
    let mut random = [0_u8; 8];
    getrandom::fill(&mut random)?;
    Ok(suffixed(
        path,
        &format!(
            ".{}.{:016x}.tmp",
            std::process::id(),
            u64::from_le_bytes(random)
        ),
    ))
}

fn suffixed(path: &Path, suffix: &str) -> PathBuf {
    let mut value = path.as_os_str().to_owned();
    value.push(suffix);
    value.into()
}

#[cfg(unix)]
fn existing_mode(path: &Path) -> Option<u32> {
    use std::os::unix::fs::MetadataExt;
    fs::metadata(path).ok().map(|metadata| metadata.mode())
}

#[cfg(not(unix))]
fn existing_mode(_path: &Path) -> Option<u32> {
    None
}

#[cfg(unix)]
fn script_mode() -> Option<u32> {
    Some(0o755)
}

#[cfg(not(unix))]
fn script_mode() -> Option<u32> {
    None
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<(), AgentStatusHooksError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o755))?;
    Ok(())
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<(), AgentStatusHooksError> {
    Ok(())
}

fn is_permission_error(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::PermissionDenied | io::ErrorKind::ReadOnlyFilesystem
    )
}

#[cfg(windows)]
fn grant_directory_acl(directory: &Path) {
    use std::process::{Command, Stdio};

    let Some(identity) = windows_identity() else {
        return;
    };
    let root = std::env::var_os("SystemRoot").unwrap_or_else(|| r"C:\Windows".into());
    let executable = PathBuf::from(root).join("System32").join("icacls.exe");
    let _ = Command::new(executable)
        .arg(directory)
        .arg("/grant:r")
        .arg(format!("{identity}:(OI)(CI)(F)"))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(windows))]
fn grant_directory_acl(_directory: &Path) {}

#[cfg(windows)]
fn windows_identity() -> Option<String> {
    if let Some(identity) = std::env::var_os("USERNAME").filter(|value| !value.is_empty()) {
        return Some(identity.to_string_lossy().into_owned());
    }
    let root = std::env::var_os("SystemRoot").unwrap_or_else(|| r"C:\Windows".into());
    let output =
        std::process::Command::new(PathBuf::from(root).join("System32").join("whoami.exe"))
            .args(["/user", "/fo", "csv", "/nh"])
            .output()
            .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let sid = text.trim().split(',').next_back()?.trim_matches('"').trim();
    (!sid.is_empty()).then(|| format!("*{sid}"))
}

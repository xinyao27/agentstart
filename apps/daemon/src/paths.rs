use std::env;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use thiserror::Error;

#[derive(Debug, Error)]
pub(crate) enum PathResolutionError {
    #[cfg(windows)]
    #[error("daemon_user_data_path_unavailable")]
    UserDataUnavailable,
    #[cfg(not(windows))]
    #[error("home directory is unavailable")]
    HomeUnavailable,
    #[error("path resolution failed: {0}")]
    Io(#[from] io::Error),
}

pub(crate) fn resolve_default_user_data_path() -> Result<PathBuf, PathResolutionError> {
    if let Some(configured) = trimmed_environment("YIRU_APP_USER_DATA_PATH")
        .or_else(|| trimmed_environment("YIRU_USER_DATA_PATH"))
    {
        return resolve_user_data_path(Path::new(&configured));
    }
    #[cfg(target_os = "macos")]
    {
        resolve_user_data_path(
            &home_directory()?
                .join("Library")
                .join("Application Support")
                .join("yiru"),
        )
    }
    #[cfg(target_os = "windows")]
    {
        let app_data =
            trimmed_environment("APPDATA").ok_or(PathResolutionError::UserDataUnavailable)?;
        resolve_user_data_path(&PathBuf::from(app_data).join("yiru"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        resolve_user_data_path(
            &trimmed_environment("XDG_CONFIG_HOME")
                .map(PathBuf::from)
                .unwrap_or(home_directory()?.join(".config"))
                .join("yiru"),
        )
    }
}

pub(crate) fn resolve_user_data_path(path: &Path) -> Result<PathBuf, PathResolutionError> {
    let mut ancestor = if path.is_absolute() {
        path.to_owned()
    } else {
        env::current_dir()?.join(path)
    };
    let mut missing = Vec::new();
    loop {
        match std::fs::canonicalize(&ancestor) {
            Ok(mut resolved) => {
                // Why: SQLite NOFOLLOW must reject database symlinks while the selected
                // directory can legitimately descend from system aliases such as /var.
                for component in missing.iter().rev() {
                    resolved.push(component);
                }
                return Ok(resolved);
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                let Some(component) = ancestor.components().next_back() else {
                    return Err(error.into());
                };
                let component = component.as_os_str().to_owned();
                if !ancestor.pop() {
                    return Err(error.into());
                }
                missing.push(component);
            }
            Err(error) => return Err(error.into()),
        }
    }
}

pub(crate) fn resolve_local_home_path() -> Option<PathBuf> {
    let primary = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    trimmed_environment(primary)
        .or_else(|| trimmed_environment("USERPROFILE"))
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .or_else(system_home_path)
}

#[cfg(not(windows))]
fn home_directory() -> Result<PathBuf, PathResolutionError> {
    resolve_local_home_path().ok_or(PathResolutionError::HomeUnavailable)
}

#[cfg(unix)]
fn system_home_path() -> Option<PathBuf> {
    let output = Command::new("/bin/sh")
        .args(["-c", "cd ~ 2>/dev/null && pwd -P"])
        .env_remove("HOME")
        .env_remove("USERPROFILE")
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    path_from_output(output)
}

#[cfg(windows)]
fn system_home_path() -> Option<PathBuf> {
    use std::os::windows::process::CommandExt;

    let combined = env::var_os("HOMEDRIVE")
        .zip(env::var_os("HOMEPATH"))
        .map(|(drive, path)| {
            let mut value = drive;
            value.push(path);
            PathBuf::from(value)
        })
        .filter(|path| path.is_absolute());
    if combined.is_some() {
        return combined;
    }
    let root = env::var_os("SystemRoot").unwrap_or_else(|| r"C:\Windows".into());
    let mut command = Command::new(
        PathBuf::from(root)
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe"),
    );
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[Environment]::GetFolderPath('UserProfile')",
        ])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
    path_from_output(command.output().ok()?)
}

fn path_from_output(output: std::process::Output) -> Option<PathBuf> {
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8(output.stdout).ok()?;
    let path = PathBuf::from(value.trim());
    (!path.as_os_str().is_empty() && path.is_absolute()).then_some(path)
}

fn trimmed_environment(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

pub(crate) fn containing_app(executable: &Path) -> Option<&Path> {
    let macos = executable.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    (macos.file_name()? == "MacOS"
        && contents.file_name()? == "Contents"
        && bundle.extension()? == "app")
        .then_some(bundle)
}

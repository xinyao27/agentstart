use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

use super::context::HostPlatform;
use super::model::CliInstallerError;

const WINDOWS_PATH_COMMAND_TIMEOUT: Duration = Duration::from_secs(5);
const MAC_PRIVILEGED_COMMAND_TIMEOUT: Duration = Duration::from_secs(120);

pub(super) fn split_path_entries(platform: HostPlatform, value: Option<&str>) -> Vec<PathBuf> {
    value
        .unwrap_or_default()
        .split(if platform == HostPlatform::Windows {
            ';'
        } else {
            ':'
        })
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(PathBuf::from)
        .collect()
}

pub(super) fn unique_path_entries(
    platform: HostPlatform,
    entries: impl IntoIterator<Item = PathBuf>,
) -> Vec<PathBuf> {
    let mut keys = std::collections::HashSet::new();
    entries
        .into_iter()
        .filter(|entry| keys.insert(path_key(platform, entry)))
        .collect()
}

pub(super) fn same_path(platform: HostPlatform, left: &Path, right: &Path) -> bool {
    path_key(platform, left) == path_key(platform, right)
}

pub(super) fn path_is_inside(parent: &Path, child: &Path) -> bool {
    let parent = lexical_path(parent);
    let child = lexical_path(child);
    child == parent || child.starts_with(parent)
}

pub(super) fn lexical_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            component => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

pub(super) fn display_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

pub(super) fn quote_shell(value: &Path) -> String {
    format!("'{}'", display_path(value).replace('\'', "'\"'\"'"))
}

pub(super) fn build_windows_forwarder(launcher_path: &Path) -> String {
    format!(
        "@echo off\nsetlocal\nset \"YIRU_LAUNCHER={}\"\n\"%YIRU_LAUNCHER%\" %*\n",
        display_path(launcher_path).replace('"', "\"\"")
    )
}

pub(super) async fn read_windows_user_path() -> Result<Option<String>, CliInstallerError> {
    let stdout = run_command(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            "[Environment]::GetEnvironmentVariable('Path','User')",
        ],
        WINDOWS_PATH_COMMAND_TIMEOUT,
    )
    .await?;
    let value = stdout.trim().to_owned();
    Ok((!value.is_empty()).then_some(value))
}

pub(super) async fn write_windows_user_path(value: &str) -> Result<(), CliInstallerError> {
    let escaped = value.replace('\'', "''");
    run_command(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            &format!("[Environment]::SetEnvironmentVariable('Path', '{escaped}', 'User')"),
        ],
        WINDOWS_PATH_COMMAND_TIMEOUT,
    )
    .await?;
    Ok(())
}

pub(super) async fn run_mac_privileged(command: &str) -> Result<(), CliInstallerError> {
    let apple_script = format!(
        "do shell script \"{}\" with administrator privileges",
        command.replace('\\', "\\\\").replace('"', "\\\"")
    );
    run_command(
        "osascript",
        &["-e", &apple_script],
        MAC_PRIVILEGED_COMMAND_TIMEOUT,
    )
    .await?;
    Ok(())
}

pub(super) fn is_permission_error(error: &std::io::Error) -> bool {
    matches!(
        error.kind(),
        std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::ReadOnlyFilesystem
    )
}

pub(super) fn is_windows_path_permission_error(error: &CliInstallerError) -> bool {
    let message = error.to_string();
    [
        "UnauthorizedAccessException",
        "SecurityException",
        "Requested registry access is not allowed",
        "Access is denied",
        "Access to the registry key",
    ]
    .iter()
    .any(|marker| message.contains(marker))
}

fn path_key(platform: HostPlatform, path: &Path) -> String {
    let value = display_path(path);
    if platform == HostPlatform::Windows {
        value
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_lowercase()
    } else {
        value
    }
}

async fn run_command(
    executable: &'static str,
    args: &[&str],
    timeout: Duration,
) -> Result<String, CliInstallerError> {
    let mut command = Command::new(executable);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let output = tokio::time::timeout(timeout, command.output())
        .await
        .map_err(|_| CliInstallerError::CommandTimeout(executable))??;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(CliInstallerError::CommandFailed(if stderr.is_empty() {
            format!("{executable} exited with {}", output.status)
        } else {
            stderr
        }));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

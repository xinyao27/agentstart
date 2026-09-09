mod unix;
mod windows;

use std::path::{Path, PathBuf};

use super::context::{HostPlatform, InstallContext};
use super::inspection;
use super::model::{CliInstallMethod, CliInstallState, CliInstallStatus, CliInstallerError};
use super::platform_path::{display_path, same_path};

pub(super) async fn install(
    context: &InstallContext,
) -> Result<CliInstallStatus, CliInstallerError> {
    let status = inspection::status(context).await?;
    if !status.supported {
        return Err(CliInstallerError::Refused(status.detail.unwrap_or_else(
            || "CLI registration is unavailable on this build.".to_owned(),
        )));
    }
    let command_path = required_path(status.command_path.as_deref(), "CLI command path")?;
    let launcher_path = required_path(status.launcher_path.as_deref(), "CLI launcher path")?;
    let install_method = status
        .install_method
        .ok_or(CliInstallerError::PathUnavailable("CLI install method"))?;
    if status.state == CliInstallState::Conflict {
        return Err(CliInstallerError::Refused(format!(
            "Refusing to replace non-Yiru command at {}.",
            display_path(&command_path)
        )));
    }
    match install_method {
        CliInstallMethod::Symlink => {
            unix::install(context, &command_path, &launcher_path, status.state).await?;
        }
        CliInstallMethod::Wrapper
            if !is_windows_bundled_command(context, &command_path, &launcher_path) =>
        {
            windows::install_wrapper(context, &command_path, &launcher_path, status.state).await?;
        }
        CliInstallMethod::Wrapper => {}
    }
    if context.platform == HostPlatform::Windows {
        windows::ensure_path_entry(path_directory(&command_path)).await?;
    }
    inspection::status(context).await
}

pub(super) async fn remove(
    context: &InstallContext,
) -> Result<CliInstallStatus, CliInstallerError> {
    let status = inspection::status(context).await?;
    if !status.supported {
        return Ok(status);
    }
    let command_path = required_path(status.command_path.as_deref(), "CLI command path")?;
    let launcher_path = required_path(status.launcher_path.as_deref(), "CLI launcher path")?;
    let install_method = status
        .install_method
        .ok_or(CliInstallerError::PathUnavailable("CLI install method"))?;
    match status.state {
        CliInstallState::NotInstalled => {
            if context.platform == HostPlatform::Windows {
                windows::remove_path_entry(path_directory(&command_path)).await?;
                return inspection::status(context).await;
            }
            return Ok(status);
        }
        CliInstallState::Conflict => {
            return Err(CliInstallerError::Refused(format!(
                "Refusing to remove non-Yiru command at {}.",
                display_path(&command_path)
            )));
        }
        CliInstallState::Stale => {
            return Err(CliInstallerError::Refused(format!(
                "Refusing to remove a command not owned by Yiru at {}.",
                display_path(&command_path)
            )));
        }
        CliInstallState::Installed => {}
        CliInstallState::Unsupported => return Ok(status),
    }
    match install_method {
        CliInstallMethod::Symlink => {
            unix::remove_installed(context, &command_path, &launcher_path).await?;
        }
        CliInstallMethod::Wrapper
            if is_windows_bundled_command(context, &command_path, &launcher_path) =>
        {
            windows::remove_path_entry(path_directory(&command_path)).await?;
        }
        CliInstallMethod::Wrapper => {
            windows::remove_installed_wrapper(&command_path, &launcher_path).await?;
            windows::remove_path_entry(path_directory(&command_path)).await?;
        }
    }
    inspection::status(context).await
}

fn is_windows_bundled_command(
    context: &InstallContext,
    command_path: &Path,
    launcher_path: &Path,
) -> bool {
    context.platform == HostPlatform::Windows
        && context.is_production()
        && same_path(HostPlatform::Windows, command_path, launcher_path)
}

fn required_path(value: Option<&str>, name: &'static str) -> Result<PathBuf, CliInstallerError> {
    value
        .map(PathBuf::from)
        .ok_or(CliInstallerError::PathUnavailable(name))
}

fn path_directory(path: &Path) -> &Path {
    path.parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."))
}

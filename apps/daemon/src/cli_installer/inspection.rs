mod unix;
mod windows;

use std::path::{Path, PathBuf};

use super::context::{HostPlatform, InstallContext, InstallSpec};
use super::model::{
    CliInstallMethod, CliInstallState, CliInstallStatus, CliInstallUnsupportedReason,
    CliInstallerError,
};
use super::platform_path::{
    display_path, read_windows_user_path, same_path, split_path_entries, unique_path_entries,
};

pub(super) use unix::extract_managed_launcher_target;
pub(super) use windows::extract_managed_forwarder;

pub(super) async fn status(
    context: &InstallContext,
) -> Result<CliInstallStatus, CliInstallerError> {
    if matches!(context.platform, HostPlatform::Unsupported(_)) {
        return Ok(unsupported_status(
            context,
            None,
            None,
            CliInstallUnsupportedReason::PlatformNotSupported,
            "CLI registration is not implemented on this platform.",
        ));
    }
    let launcher_path = context.launcher_path();
    let default_spec = context.install_spec(launcher_path.as_deref())?;
    let Some(launcher_path) = launcher_path else {
        let command_path = default_spec
            .as_ref()
            .map(|spec| spec.command_path.as_path());
        let install_method = default_spec.as_ref().map(|spec| spec.install_method);
        return Ok(unsupported_status(
            context,
            command_path,
            install_method,
            if context.is_production() {
                CliInstallUnsupportedReason::LauncherMissing
            } else {
                CliInstallUnsupportedReason::LaunchModeUnavailable
            },
            if context.is_production() {
                "The AgentStart CLI executable is missing from this build."
            } else {
                "Development mode requires a running AgentStart executable."
            },
        ));
    };
    let default_spec = default_spec.ok_or(CliInstallerError::PathUnavailable(
        "CLI registration target",
    ))?;
    let spec = resolve_active_spec(context, default_spec, &launcher_path).await?;
    let base = match spec.install_method {
        CliInstallMethod::Symlink => {
            unix::inspect(context, &spec.command_path, &launcher_path).await?
        }
        CliInstallMethod::Wrapper => {
            windows::inspect(context, &spec.command_path, &launcher_path).await?
        }
    };
    with_path_info(context, base).await
}

async fn resolve_active_spec(
    context: &InstallContext,
    default_spec: InstallSpec,
    launcher_path: &Path,
) -> Result<InstallSpec, CliInstallerError> {
    if context.command_path_override.is_some()
        || context.platform != HostPlatform::Darwin
        || default_spec.install_method != CliInstallMethod::Symlink
    {
        return Ok(default_spec);
    }
    let Some(command_path) =
        find_active_command(context, launcher_path, &default_spec.command_path).await?
    else {
        return Ok(default_spec);
    };
    Ok(InstallSpec {
        command_path,
        install_method: default_spec.install_method,
    })
}

async fn find_active_command(
    context: &InstallContext,
    launcher_path: &Path,
    default_command_path: &Path,
) -> Result<Option<PathBuf>, CliInstallerError> {
    let command_name = default_command_path
        .file_name()
        .ok_or(CliInstallerError::PathUnavailable("CLI command name"))?;
    let candidates = unique_path_entries(
        context.platform,
        split_path_entries(context.platform, context.process_path.as_deref())
            .into_iter()
            .map(|directory| directory.join(command_name)),
    );
    let mut reached_default = false;
    for command_path in candidates {
        let is_default = same_path(context.platform, &command_path, default_command_path);
        reached_default |= is_default;
        if !unix::is_executable_file(&command_path).await {
            continue;
        }
        let status = unix::inspect(context, &command_path, launcher_path).await?;
        if status.state == CliInstallState::NotInstalled {
            continue;
        }
        if reached_default && !is_default && status.state == CliInstallState::Conflict {
            continue;
        }
        return Ok(Some(command_path));
    }
    Ok(None)
}

async fn with_path_info(
    context: &InstallContext,
    mut status: CliInstallStatus,
) -> Result<CliInstallStatus, CliInstallerError> {
    let command_path = status
        .command_path
        .as_ref()
        .map(PathBuf::from)
        .ok_or(CliInstallerError::PathUnavailable("CLI command path"))?;
    let directory = path_directory(&command_path);
    let path_value = if context.platform == HostPlatform::Windows {
        read_windows_user_path().await?
    } else {
        context.process_path.clone()
    };
    let path_configured = split_path_entries(context.platform, path_value.as_deref())
        .iter()
        .any(|entry| same_path(context.platform, entry, &directory));
    status.path_directory = Some(display_path(&directory));
    status.path_configured = path_configured;
    if windows::is_bundled_command(
        context,
        &command_path,
        Path::new(status.launcher_path.as_deref().unwrap_or_default()),
    ) && status.state == CliInstallState::Installed
        && !path_configured
    {
        status.state = CliInstallState::NotInstalled;
        status.current_target = None;
        status.detail = Some(format!(
            "Register {} to use AgentStart from Command Prompt or PowerShell.",
            display_path(&command_path)
        ));
        return Ok(status);
    }
    if status.state == CliInstallState::Installed && !path_configured {
        status.detail = Some(if context.platform == HostPlatform::Linux {
            format!(
                "{} is registered, but {} is not on PATH for this shell.",
                display_path(&command_path),
                display_path(&directory)
            )
        } else {
            format!(
                "{} is registered. Restart your shell if the command is not visible yet.",
                display_path(&command_path)
            )
        });
    }
    Ok(status)
}

pub(super) fn base_status(
    context: &InstallContext,
    command_path: &Path,
    launcher_path: &Path,
    install_method: CliInstallMethod,
    state: CliInstallState,
    current_target: Option<String>,
    detail: String,
) -> CliInstallStatus {
    CliInstallStatus {
        platform: context.platform.wire_name().to_owned(),
        command_name: context.command_name.to_owned(),
        command_path: Some(display_path(command_path)),
        path_directory: Some(display_path(&path_directory(command_path))),
        path_configured: false,
        launcher_path: Some(display_path(launcher_path)),
        install_method: Some(install_method),
        supported: true,
        state,
        current_target,
        unsupported_reason: None,
        detail: Some(detail),
    }
}

fn unsupported_status(
    context: &InstallContext,
    command_path: Option<&Path>,
    install_method: Option<CliInstallMethod>,
    reason: CliInstallUnsupportedReason,
    detail: &str,
) -> CliInstallStatus {
    CliInstallStatus {
        platform: context.platform.wire_name().to_owned(),
        command_name: context.command_name.to_owned(),
        command_path: command_path.map(display_path),
        path_directory: command_path
            .map(path_directory)
            .as_deref()
            .map(display_path),
        path_configured: false,
        launcher_path: None,
        install_method,
        supported: false,
        state: CliInstallState::Unsupported,
        current_target: None,
        unsupported_reason: Some(reason),
        detail: Some(detail.to_owned()),
    }
}

fn path_directory(path: &Path) -> PathBuf {
    path.parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."))
        .to_owned()
}

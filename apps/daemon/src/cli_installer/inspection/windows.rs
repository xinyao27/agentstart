use std::io;
use std::path::{Path, PathBuf};

use tokio::fs;

use super::super::context::{HostPlatform, InstallContext};
use super::super::model::{CliInstallMethod, CliInstallState, CliInstallStatus, CliInstallerError};
use super::super::platform_path::{
    build_windows_forwarder, display_path, path_is_inside, same_path,
};
use super::base_status;

const DEV_LAUNCHER_DIRECTORY: [&str; 2] = ["cli", "bin"];

pub(super) async fn inspect(
    context: &InstallContext,
    command_path: &Path,
    launcher_path: &Path,
) -> Result<CliInstallStatus, CliInstallerError> {
    let metadata = match fs::symlink_metadata(command_path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(base_status(
                context,
                command_path,
                launcher_path,
                CliInstallMethod::Wrapper,
                CliInstallState::NotInstalled,
                None,
                format!(
                    "Register {} to use Yiru from Command Prompt or PowerShell.",
                    display_path(command_path)
                ),
            ));
        }
        Err(error) => return Err(error.into()),
    };
    if !metadata.is_file() {
        return Ok(conflict_status(context, command_path, launcher_path));
    }
    if is_bundled_command(context, command_path, launcher_path) {
        return Ok(installed_status(context, command_path, launcher_path));
    }
    let contents = fs::read_to_string(command_path).await?;
    if contents == build_windows_forwarder(launcher_path) {
        return Ok(installed_status(context, command_path, launcher_path));
    }
    if extract_managed_forwarder(context, launcher_path, &contents).is_some() {
        return Ok(base_status(
            context,
            command_path,
            launcher_path,
            CliInstallMethod::Wrapper,
            CliInstallState::Stale,
            Some(display_path(launcher_path)),
            format!(
                "{} points to a different launcher.",
                display_path(command_path)
            ),
        ));
    }
    Ok(conflict_status(context, command_path, launcher_path))
}

pub(crate) fn extract_managed_forwarder(
    context: &InstallContext,
    launcher_path: &Path,
    contents: &str,
) -> Option<PathBuf> {
    let normalized = contents.replace("\r\n", "\n");
    let lines = normalized
        .trim_end_matches('\n')
        .lines()
        .collect::<Vec<_>>();
    if lines.len() != 4
        || lines[0] != "@echo off"
        || lines[1] != "setlocal"
        || lines[3] != "\"%YIRU_LAUNCHER%\" %*"
    {
        return None;
    }
    let target = lines[2]
        .strip_prefix("set \"YIRU_LAUNCHER=")?
        .strip_suffix('"')?
        .replace("\"\"", "\"");
    let target = PathBuf::from(target);
    let name = target.file_name()?.to_string_lossy().to_lowercase();
    let launcher_name = launcher_path
        .file_name()
        .map(|value| value.to_string_lossy().to_lowercase());
    let has_yiru_name = matches!(
        name.as_str(),
        "yiru" | "yiru.exe" | "yiru-dev" | "yiru-dev.cmd"
    ) || launcher_name.as_deref() == Some(name.as_str());
    let is_owned_path = context.user_data_path.as_ref().is_some_and(|user_data| {
        path_is_inside(
            &user_data
                .join(DEV_LAUNCHER_DIRECTORY[0])
                .join(DEV_LAUNCHER_DIRECTORY[1]),
            &target,
        )
    }) || display_path(&target)
        .replace('/', "\\")
        .to_lowercase()
        .contains("\\resources\\bin\\")
        || same_path(HostPlatform::Windows, &target, launcher_path);
    (has_yiru_name && is_owned_path).then_some(target)
}

pub(super) fn is_bundled_command(
    context: &InstallContext,
    command_path: &Path,
    launcher_path: &Path,
) -> bool {
    context.platform == HostPlatform::Windows
        && context.is_production()
        && same_path(HostPlatform::Windows, command_path, launcher_path)
}

fn installed_status(
    context: &InstallContext,
    command_path: &Path,
    launcher_path: &Path,
) -> CliInstallStatus {
    base_status(
        context,
        command_path,
        launcher_path,
        CliInstallMethod::Wrapper,
        CliInstallState::Installed,
        Some(display_path(launcher_path)),
        format!("Registered at {}.", display_path(command_path)),
    )
}

fn conflict_status(
    context: &InstallContext,
    command_path: &Path,
    launcher_path: &Path,
) -> CliInstallStatus {
    base_status(
        context,
        command_path,
        launcher_path,
        CliInstallMethod::Wrapper,
        CliInstallState::Conflict,
        None,
        format!(
            "{} exists but is not a Yiru launcher script.",
            display_path(command_path)
        ),
    )
}

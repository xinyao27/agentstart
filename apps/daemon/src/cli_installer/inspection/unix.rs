use std::ffi::OsStr;
use std::io;
use std::path::{Path, PathBuf};

use tokio::fs;

use super::super::context::{DEVELOPMENT_COMMAND_NAME, HostPlatform, InstallContext};
use super::super::model::{CliInstallMethod, CliInstallState, CliInstallStatus, CliInstallerError};
use super::super::platform_path::{display_path, lexical_path, path_is_inside};
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
                CliInstallMethod::Symlink,
                CliInstallState::NotInstalled,
                None,
                format!(
                    "Register {} to use Yiru from the terminal.",
                    display_path(command_path)
                ),
            ));
        }
        Err(error) => return Err(error.into()),
    };
    if !metadata.file_type().is_symlink() {
        if metadata.is_file()
            && let Some(target) =
                extract_managed_launcher_target(&fs::read_to_string(command_path).await?)
        {
            return Ok(base_status(
                context,
                command_path,
                launcher_path,
                CliInstallMethod::Symlink,
                CliInstallState::Stale,
                Some(target),
                format!(
                    "{} contains an older Yiru launcher.",
                    display_path(command_path)
                ),
            ));
        }
        return Ok(base_status(
            context,
            command_path,
            launcher_path,
            CliInstallMethod::Symlink,
            CliInstallState::Conflict,
            None,
            format!(
                "{} exists but is not a Yiru symlink.",
                display_path(command_path)
            ),
        ));
    }
    let raw_target = fs::read_link(command_path).await?;
    let resolved_target = resolve_link_target(command_path, &raw_target);
    let is_installed = resolved_target == lexical_path(launcher_path);
    let is_stale = !is_installed && is_managed_target(context, &resolved_target, launcher_path);
    let state = if is_installed {
        CliInstallState::Installed
    } else if is_stale {
        CliInstallState::Stale
    } else {
        CliInstallState::Conflict
    };
    let detail = match state {
        CliInstallState::Installed => format!("Registered at {}.", display_path(command_path)),
        CliInstallState::Stale => format!(
            "{} points to an older Yiru launcher.",
            display_path(command_path)
        ),
        CliInstallState::Conflict => format!(
            "{} points to a non-Yiru launcher.",
            display_path(command_path)
        ),
        CliInstallState::NotInstalled | CliInstallState::Unsupported => unreachable!(),
    };
    Ok(base_status(
        context,
        command_path,
        launcher_path,
        CliInstallMethod::Symlink,
        state,
        Some(display_path(&resolved_target)),
        detail,
    ))
}

fn is_managed_target(
    context: &InstallContext,
    resolved_target: &Path,
    launcher_path: &Path,
) -> bool {
    let expected_name = launcher_path.file_name();
    if context.is_production() && is_sibling_dev_target(context, resolved_target, expected_name) {
        return true;
    }
    if resolved_target.file_name() != expected_name {
        return false;
    }
    if context.user_data_path.as_ref().is_some_and(|user_data| {
        path_is_inside(
            &user_data
                .join(DEV_LAUNCHER_DIRECTORY[0])
                .join(DEV_LAUNCHER_DIRECTORY[1]),
            resolved_target,
        )
    }) {
        return true;
    }
    let normalized = display_path(resolved_target).replace('\\', "/");
    match context.platform {
        HostPlatform::Darwin => normalized.contains(".app/Contents/Resources/bin/"),
        HostPlatform::Linux => normalized.contains("/resources/bin/"),
        HostPlatform::Windows | HostPlatform::Unsupported(_) => false,
    }
}

fn is_sibling_dev_target(
    context: &InstallContext,
    resolved_target: &Path,
    packaged_launcher_name: Option<&OsStr>,
) -> bool {
    let Some(target_name) = resolved_target.file_name() else {
        return false;
    };
    if Some(target_name) != packaged_launcher_name && target_name != DEVELOPMENT_COMMAND_NAME {
        return false;
    }
    let Some(user_data_path) = &context.user_data_path else {
        return false;
    };
    let sibling = PathBuf::from(format!("{}-dev", display_path(user_data_path)));
    let Some(sibling_name) = sibling.file_name() else {
        return false;
    };
    let Some(user_data_name) = user_data_path.file_name() else {
        return false;
    };
    sibling_name == OsStr::new(&format!("{}-dev", user_data_name.to_string_lossy()))
        && path_is_inside(
            &sibling
                .join(DEV_LAUNCHER_DIRECTORY[0])
                .join(DEV_LAUNCHER_DIRECTORY[1]),
            resolved_target,
        )
}

pub(crate) fn extract_managed_launcher_target(contents: &str) -> Option<String> {
    if !contents.contains("YIRU_CLI_ENVIRONMENT=development")
        || !contents.contains("YIRU_NODE_OPTIONS")
        || !contents.contains("NODE_REPL_EXTERNAL_MODULE")
    {
        return None;
    }
    let assignment = contents
        .lines()
        .find_map(|line| line.strip_prefix("ENTRY="))?;
    let target = assignment
        .strip_prefix('\'')
        .and_then(|value| value.strip_suffix('\''))
        .or_else(|| {
            assignment
                .strip_prefix('"')
                .and_then(|value| value.strip_suffix('"'))
        })
        .unwrap_or(assignment)
        .trim();
    let normalized = target.replace('\\', "/");
    (normalized == "apps/daemon/src/entry.ts" || normalized.ends_with("/apps/daemon/src/entry.ts"))
        .then(|| target.to_owned())
}

fn resolve_link_target(command_path: &Path, target: &Path) -> PathBuf {
    let resolved = if target.is_absolute() {
        target.to_owned()
    } else {
        command_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(target)
    };
    lexical_path(&resolved)
}

pub(super) async fn is_executable_file(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path).await else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

use std::io;
use std::path::{Path, PathBuf};

use tokio::fs;

use super::super::context::{HostPlatform, InstallContext};
use super::super::inspection;
use super::super::model::{CliInstallState, CliInstallerError};
use super::super::platform_path::{
    display_path, is_permission_error, lexical_path, quote_shell, run_mac_privileged,
};
use super::path_directory;

pub(super) async fn install(
    context: &InstallContext,
    command_path: &Path,
    launcher_path: &Path,
    state: CliInstallState,
) -> Result<(), CliInstallerError> {
    if state == CliInstallState::Installed {
        return Ok(());
    }
    if state == CliInstallState::Stale {
        remove_stale(context, command_path).await?;
    }
    create_symlink(context, command_path, launcher_path).await
}

async fn remove_stale(
    context: &InstallContext,
    command_path: &Path,
) -> Result<(), CliInstallerError> {
    let confirmation = inspection::status(context).await?;
    if confirmation.state != CliInstallState::Stale
        || confirmation.command_path.as_deref() != Some(display_path(command_path).as_str())
    {
        return Err(ownership_changed("replace", command_path));
    }
    let metadata = fs::symlink_metadata(command_path).await?;
    let symlink_target = if metadata.file_type().is_symlink() {
        let target = fs::read_link(command_path).await?;
        let resolved = resolve_link_target(command_path, &target);
        if confirmation.current_target.as_deref() != Some(display_path(&resolved).as_str()) {
            return Err(ownership_changed("replace", command_path));
        }
        Some(target)
    } else {
        let contents = fs::read_to_string(command_path).await?;
        if inspection::extract_managed_launcher_target(&contents).as_deref()
            != confirmation.current_target.as_deref()
        {
            return Err(ownership_changed("replace", command_path));
        }
        None
    };
    match fs::remove_file(command_path).await {
        Ok(()) => Ok(()),
        Err(error) if context.platform == HostPlatform::Darwin && is_permission_error(&error) => {
            remove_stale_privileged(command_path, symlink_target.as_deref()).await
        }
        Err(error) => Err(error.into()),
    }
}

async fn remove_stale_privileged(
    command_path: &Path,
    symlink_target: Option<&Path>,
) -> Result<(), CliInstallerError> {
    let path = quote_shell(command_path);
    let command = if let Some(target) = symlink_target {
        format!(
            "if [ -L {path} ] && [ \"$(readlink {path})\" = {} ]; then rm {path}; else exit 73; fi",
            quote_shell(target)
        )
    } else {
        format!(
            "if [ -f {path} ] && grep -q 'YIRU_CLI_ENVIRONMENT=development' {path} && grep -q 'YIRU_NODE_OPTIONS' {path} && grep -q 'NODE_REPL_EXTERNAL_MODULE' {path} && grep -Eq 'apps[/\\]daemon[/\\]src[/\\]entry\\.ts' {path}; then rm {path}; else exit 73; fi"
        )
    };
    run_mac_privileged(&command).await
}

async fn create_symlink(
    context: &InstallContext,
    command_path: &Path,
    launcher_path: &Path,
) -> Result<(), CliInstallerError> {
    let directory = path_directory(command_path);
    if let Err(error) = fs::create_dir_all(directory).await {
        if context.platform != HostPlatform::Darwin || !is_permission_error(&error) {
            return Err(error.into());
        }
        run_mac_privileged(&format!("mkdir -p {}", quote_shell(directory))).await?;
    }
    match symlink_file(launcher_path, command_path).await {
        Ok(()) => Ok(()),
        Err(error) if context.platform == HostPlatform::Darwin && is_permission_error(&error) => {
            run_mac_privileged(&format!(
                "if [ ! -e {0} ] && [ ! -L {0} ]; then ln -s {1} {0}; else exit 73; fi",
                quote_shell(command_path),
                quote_shell(launcher_path)
            ))
            .await
        }
        Err(error) => Err(error.into()),
    }
}

pub(super) async fn remove_installed(
    context: &InstallContext,
    command_path: &Path,
    launcher_path: &Path,
) -> Result<(), CliInstallerError> {
    let raw_target = fs::read_link(command_path).await?;
    if resolve_link_target(command_path, &raw_target) != lexical_path(launcher_path) {
        return Err(ownership_changed("remove", command_path));
    }
    match fs::remove_file(command_path).await {
        Ok(()) => Ok(()),
        Err(error) if context.platform == HostPlatform::Darwin && is_permission_error(&error) => {
            let path = quote_shell(command_path);
            run_mac_privileged(&format!(
                "if [ -L {path} ] && [ \"$(readlink {path})\" = {} ]; then rm {path}; else exit 73; fi",
                quote_shell(&raw_target)
            ))
            .await
        }
        Err(error) => Err(error.into()),
    }
}

fn ownership_changed(action: &str, command_path: &Path) -> CliInstallerError {
    CliInstallerError::Refused(format!(
        "Refusing to {action} command whose ownership changed at {}.",
        display_path(command_path)
    ))
}

fn resolve_link_target(command_path: &Path, target: &Path) -> PathBuf {
    let resolved = if target.is_absolute() {
        target.to_owned()
    } else {
        path_directory(command_path).join(target)
    };
    lexical_path(&resolved)
}

#[cfg(unix)]
async fn symlink_file(target: &Path, link: &Path) -> io::Result<()> {
    tokio::fs::symlink(target, link).await
}

#[cfg(not(unix))]
async fn symlink_file(_target: &Path, _link: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "symlink installation is unavailable",
    ))
}

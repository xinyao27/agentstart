use std::path::Path;

use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

use super::super::context::{HostPlatform, InstallContext};
use super::super::inspection;
use super::super::model::{CliInstallState, CliInstallerError};
use super::super::platform_path::{
    build_windows_forwarder, display_path, is_windows_path_permission_error,
    read_windows_user_path, same_path, split_path_entries, write_windows_user_path,
};
use super::path_directory;

pub(super) async fn install_wrapper(
    context: &InstallContext,
    command_path: &Path,
    launcher_path: &Path,
    state: CliInstallState,
) -> Result<(), CliInstallerError> {
    if state == CliInstallState::Installed {
        return Ok(());
    }
    if state == CliInstallState::Stale {
        let contents = fs::read_to_string(command_path).await?;
        if contents == build_windows_forwarder(launcher_path) {
            return Ok(());
        }
        if inspection::extract_managed_forwarder(context, launcher_path, &contents).is_none() {
            return Err(ownership_changed("replace", command_path));
        }
        fs::remove_file(command_path).await?;
    }
    fs::create_dir_all(path_directory(command_path)).await?;
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(command_path)
        .await?;
    file.write_all(build_windows_forwarder(launcher_path).as_bytes())
        .await?;
    file.flush().await?;
    Ok(())
}

pub(super) async fn remove_installed_wrapper(
    command_path: &Path,
    launcher_path: &Path,
) -> Result<(), CliInstallerError> {
    if fs::read_to_string(command_path).await? != build_windows_forwarder(launcher_path) {
        return Err(ownership_changed("remove", command_path));
    }
    fs::remove_file(command_path).await?;
    Ok(())
}

pub(super) async fn ensure_path_entry(directory: &Path) -> Result<(), CliInstallerError> {
    let entries = split_path_entries(
        HostPlatform::Windows,
        read_windows_user_path().await?.as_deref(),
    );
    if entries
        .iter()
        .any(|entry| same_path(HostPlatform::Windows, entry, directory))
    {
        return Ok(());
    }
    let mut entries = entries;
    entries.push(directory.to_owned());
    write_path_entry(
        &entries
            .iter()
            .map(|entry| display_path(entry))
            .collect::<Vec<_>>()
            .join(";"),
        directory,
        "add",
    )
    .await
}

pub(super) async fn remove_path_entry(directory: &Path) -> Result<(), CliInstallerError> {
    let entries = split_path_entries(
        HostPlatform::Windows,
        read_windows_user_path().await?.as_deref(),
    );
    let retained = entries
        .iter()
        .filter(|entry| !same_path(HostPlatform::Windows, entry, directory))
        .collect::<Vec<_>>();
    if retained.len() == entries.len() {
        return Ok(());
    }
    write_path_entry(
        &retained
            .iter()
            .map(|entry| display_path(entry))
            .collect::<Vec<_>>()
            .join(";"),
        directory,
        "remove",
    )
    .await
}

async fn write_path_entry(
    value: &str,
    directory: &Path,
    action: &'static str,
) -> Result<(), CliInstallerError> {
    match write_windows_user_path(value).await {
        Ok(()) => Ok(()),
        Err(error) if is_windows_path_permission_error(&error) => {
            let instruction = if action == "add" {
                "Add this folder to your PATH manually"
            } else {
                "Remove this folder from your PATH manually"
            };
            Err(CliInstallerError::Refused(format!(
                "Windows blocked updating your user PATH (access denied). This usually means your PATH environment variable is managed by Group Policy or your organization's device management. {instruction}: {}. Or run Yiru as an administrator and try again.",
                display_path(directory)
            )))
        }
        Err(error) => Err(error),
    }
}

fn ownership_changed(action: &str, command_path: &Path) -> CliInstallerError {
    CliInstallerError::Refused(format!(
        "Refusing to {action} command whose ownership changed at {}.",
        display_path(command_path)
    ))
}

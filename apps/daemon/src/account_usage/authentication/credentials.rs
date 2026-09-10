use std::io::Read as _;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde_json::Value;
#[cfg(target_os = "macos")]
use sha2::{Digest as _, Sha256};
#[cfg(target_os = "macos")]
use tokio::process::Command;

use crate::transport::secure_file;

use super::{AccountsError, AuthenticationProvider, CREDENTIAL_BYTE_LIMIT, ManagedLocation};

pub(super) struct CredentialSnapshot {
    files: Vec<(PathBuf, Option<Vec<u8>>)>,
    #[cfg(target_os = "macos")]
    keychains: Vec<(String, String, Option<Vec<u8>>)>,
}

impl CredentialSnapshot {
    pub(super) async fn capture(
        provider: AuthenticationProvider,
        location: &ManagedLocation,
    ) -> Result<Self, AccountsError> {
        let names: &[&str] = match provider {
            AuthenticationProvider::Claude => &[".credentials.json", "oauth-account.json"],
            AuthenticationProvider::Codex => &["auth.json", "config.toml"],
        };
        let mut files = Vec::with_capacity(names.len());
        for name in names {
            let path = location.host_path.join(name);
            files.push((path.clone(), read_bounded(&path).await?));
        }
        #[cfg(target_os = "macos")]
        let keychains = if matches!(provider, AuthenticationProvider::Claude) {
            let user = keychain_user();
            let scoped = scoped_keychain_service(&location.host_path);
            vec![
                (
                    "Claude Code-credentials".to_owned(),
                    user.clone(),
                    read_keychain_bytes("Claude Code-credentials", &user).await?,
                ),
                (
                    "AgentStart Claude Code Managed Credentials".to_owned(),
                    location.account_id.clone(),
                    read_keychain_bytes(
                        "AgentStart Claude Code Managed Credentials",
                        &location.account_id,
                    )
                    .await?,
                ),
                (
                    scoped.clone(),
                    user.clone(),
                    read_keychain_bytes(&scoped, &user).await?,
                ),
            ]
        } else {
            Vec::new()
        };
        Ok(Self {
            files,
            #[cfg(target_os = "macos")]
            keychains,
        })
    }

    pub(super) async fn restore(&self) -> Result<(), AccountsError> {
        for (path, contents) in &self.files {
            if let Some(contents) = contents {
                secure_file::write_bytes(path, contents)?;
            } else {
                match std::fs::remove_file(path) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => return Err(error.into()),
                }
            }
        }
        #[cfg(target_os = "macos")]
        for (service, account, contents) in &self.keychains {
            restore_keychain(service, account, contents.as_deref()).await?;
        }
        Ok(())
    }
}

pub(super) async fn read_bounded_json(path: &Path) -> Result<Option<Value>, AccountsError> {
    let Some(contents) = read_bounded(path).await? else {
        return Ok(None);
    };
    serde_json::from_slice(&contents)
        .map(Some)
        .map_err(|_| AccountsError::IdentityUnavailable)
}

pub(super) async fn read_bounded(path: &Path) -> Result<Option<Vec<u8>>, AccountsError> {
    let path = path.to_owned();
    tokio::task::spawn_blocking(move || read_bounded_sync(&path))
        .await
        .map_err(|_| AccountsError::InvalidState)?
}

pub(super) fn read_bounded_sync(path: &Path) -> Result<Option<Vec<u8>>, AccountsError> {
    let before = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if before.file_type().is_symlink() || !before.is_file() || before.len() > CREDENTIAL_BYTE_LIMIT
    {
        return Err(AccountsError::InvalidState);
    }
    let before_handle = same_file::Handle::from_path(path)?;
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    configure_no_follow(&mut options);
    let file = options.open(path)?;
    let opened_handle = same_file::Handle::from_file(file.try_clone()?)?;
    let opened = file.metadata()?;
    if before_handle != opened_handle
        || !opened.is_file()
        || opened.len() > CREDENTIAL_BYTE_LIMIT
        || before.len() != opened.len()
        || before.modified()? != opened.modified()?
    {
        return Err(AccountsError::InvalidState);
    }
    let mut contents = Vec::with_capacity(usize::try_from(opened.len()).unwrap_or(0));
    (&file)
        .take(CREDENTIAL_BYTE_LIMIT + 1)
        .read_to_end(&mut contents)?;
    let after = file.metadata()?;
    let after_handle = same_file::Handle::from_file(file.try_clone()?)?;
    if contents.len() as u64 > CREDENTIAL_BYTE_LIMIT
        || after_handle != opened_handle
        || after.len() != opened.len()
        || after.modified()? != opened.modified()?
    {
        return Err(AccountsError::InvalidState);
    }
    Ok(Some(contents))
}

#[cfg(unix)]
fn configure_no_follow(options: &mut std::fs::OpenOptions) {
    use std::os::unix::fs::OpenOptionsExt as _;
    options.custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_NONBLOCK);
}

#[cfg(windows)]
fn configure_no_follow(options: &mut std::fs::OpenOptions) {
    use std::os::windows::fs::OpenOptionsExt as _;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
}

#[cfg(not(any(unix, windows)))]
fn configure_no_follow(_options: &mut std::fs::OpenOptions) {}

#[cfg(target_os = "macos")]
pub(super) async fn read_keychain_json(
    service: &str,
    account: &str,
) -> Result<Option<Value>, AccountsError> {
    let Some(bytes) = read_keychain_bytes(service, account).await? else {
        return Ok(None);
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| AccountsError::IdentityUnavailable)
}

#[cfg(target_os = "macos")]
pub(super) async fn read_keychain_bytes(
    service: &str,
    account: &str,
) -> Result<Option<Vec<u8>>, AccountsError> {
    let output = tokio::time::timeout(
        Duration::from_secs(3),
        Command::new("security")
            .args(["find-generic-password", "-s", service, "-a", account, "-w"])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| AccountsError::LoginTimedOut)?
    .map_err(|_| AccountsError::LoginFailed)?;
    if !output.status.success() {
        return if output.status.code() == Some(44) {
            Ok(None)
        } else {
            Err(AccountsError::LoginFailed)
        };
    }
    if output.stdout.len() as u64 > CREDENTIAL_BYTE_LIMIT {
        return Err(AccountsError::InvalidState);
    }
    Ok(Some(output.stdout))
}

#[cfg(target_os = "macos")]
pub(super) async fn restore_keychain(
    service: &str,
    account: &str,
    contents: Option<&[u8]>,
) -> Result<(), AccountsError> {
    let mut command = Command::new("security");
    if let Some(contents) = contents {
        let secret = std::str::from_utf8(contents).map_err(|_| AccountsError::InvalidState)?;
        command.args([
            "add-generic-password",
            "-U",
            "-s",
            service,
            "-a",
            account,
            "-w",
            secret.trim_end(),
        ]);
    } else {
        command.args(["delete-generic-password", "-s", service, "-a", account]);
    }
    let status = tokio::time::timeout(
        Duration::from_secs(3),
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .status(),
    )
    .await
    .map_err(|_| AccountsError::LoginTimedOut)?
    .map_err(|_| AccountsError::LoginFailed)?;
    if !(status.success() || contents.is_none() && status.code() == Some(44)) {
        return Err(AccountsError::LoginFailed);
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub(super) fn keychain_user() -> String {
    std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_else(|_| "user".to_owned())
}

#[cfg(target_os = "macos")]
pub(super) fn scoped_keychain_service(path: &Path) -> String {
    let digest = format!("{:x}", Sha256::digest(path.to_string_lossy().as_bytes()));
    format!("Claude Code-credentials-{}", &digest[..8])
}

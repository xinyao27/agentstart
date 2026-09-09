use std::process::Stdio;

use serde_json::Value;
use tokio::process::Command;
use tokio::sync::watch;

use crate::transport::secure_file;

use super::codex::{ensure_wsl_cli_available, shell_quote, wsl_login_script};
use super::{
    AccountsError, CLAUDE_LOGIN_TIMEOUT, CREDENTIAL_BYTE_LIMIT, Identity, ManagedLocation,
    claude_identity, random_uuid, read_bounded_json, run,
};
#[cfg(target_os = "macos")]
use super::{
    keychain_user, read_keychain_bytes, read_keychain_json, restore_keychain,
    scoped_keychain_service,
};

pub(super) async fn authenticate(
    location: &ManagedLocation,
    cancellation: watch::Receiver<bool>,
    call_cancelled: impl Future<Output = ()>,
) -> Result<Identity, AccountsError> {
    let staging = create_staging_location(location).await?;
    #[cfg(target_os = "macos")]
    let legacy = {
        let user = keychain_user();
        read_keychain_bytes("Claude Code-credentials", &user).await?
    };
    let result = authenticate_claude_at(&staging, cancellation, call_cancelled).await;
    let committed = match result {
        Ok((identity, credentials, oauth_account)) => {
            async {
                let bytes = serde_json::to_vec(&credentials)
                    .map_err(|_| AccountsError::IdentityUnavailable)?;
                secure_file::write_bytes(&location.host_path.join(".credentials.json"), &bytes)?;
                secure_file::write_bytes(
                    &location.host_path.join("oauth-account.json"),
                    &serde_json::to_vec(&oauth_account)
                        .map_err(|_| AccountsError::IdentityUnavailable)?,
                )?;
                harden_managed_files(location).await?;
                #[cfg(target_os = "macos")]
                {
                    let user = keychain_user();
                    restore_keychain(
                        "Yiru Claude Code Managed Credentials",
                        &location.account_id,
                        Some(&bytes),
                    )
                    .await?;
                    restore_keychain(
                        &scoped_keychain_service(&location.host_path),
                        &user,
                        Some(&bytes),
                    )
                    .await?;
                }
                Ok(identity)
            }
            .await
        }
        Err(error) => Err(error),
    };
    #[cfg(target_os = "macos")]
    {
        let user = keychain_user();
        restore_keychain("Claude Code-credentials", &user, legacy.as_deref()).await?;
        let _ = restore_keychain(&scoped_keychain_service(&staging.host_path), &user, None).await;
    }
    cleanup_staging_location(&staging).await;
    committed
}

async fn harden_managed_files(location: &ManagedLocation) -> Result<(), AccountsError> {
    let (Some(distro), Some(linux_path)) = (
        location.wsl_distro.as_deref(),
        location.linux_path.as_deref(),
    ) else {
        return Ok(());
    };
    let status = Command::new("wsl.exe")
        .args([
            "-d",
            distro,
            "--",
            "sh",
            "-c",
            "set -eu; chmod 700 -- \"$1\"; chmod 600 -- \"$1/.credentials.json\" \"$1/oauth-account.json\"",
            "yiru-claude-permissions",
            linux_path,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .status()
        .await
        .map_err(|_| AccountsError::LoginFailed)?;
    if status.success() {
        Ok(())
    } else {
        Err(AccountsError::LoginFailed)
    }
}

async fn authenticate_claude_at(
    location: &ManagedLocation,
    mut cancellation: watch::Receiver<bool>,
    call_cancelled: impl Future<Output = ()>,
) -> Result<(Identity, Value, Value), AccountsError> {
    let mut command = if let (Some(distro), Some(linux_path)) = (
        location.wsl_distro.as_deref(),
        location.linux_path.as_deref(),
    ) {
        ensure_wsl_cli_available(distro, "claude").await?;
        let mut command = Command::new("wsl.exe");
        let login = format!(
            "export CLAUDE_CONFIG_DIR={}; exec claude auth login --claudeai",
            shell_quote(linux_path)
        );
        command.args(["-d", distro, "--", "sh", "-c", &wsl_login_script(&login)]);
        command
    } else {
        host_claude_command(["auth", "login", "--claudeai"], location)?
    };
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    run(
        command,
        CLAUDE_LOGIN_TIMEOUT,
        async move {
            let _ = cancellation.changed().await;
        },
        call_cancelled,
    )
    .await?;
    let status = claude_status(location).await?;
    let credentials = read_claude_login_credentials(location).await?;
    let oauth_account = read_oauth_account(location).await?;
    let identity = claude_identity(&status, &credentials, &oauth_account)?;
    Ok((identity, credentials, oauth_account))
}

async fn read_oauth_account(location: &ManagedLocation) -> Result<Value, AccountsError> {
    for name in [".claude.json", ".config.json"] {
        if let Some(document) = read_bounded_json(&location.host_path.join(name)).await?
            && let Some(account) = document.get("oauthAccount")
        {
            return Ok(account.clone());
        }
    }
    Ok(Value::Null)
}

async fn create_staging_location(
    location: &ManagedLocation,
) -> Result<ManagedLocation, AccountsError> {
    if let Some(distro) = location.wsl_distro.as_deref() {
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            Command::new("wsl.exe")
                .args([
                    "-d",
                    distro,
                    "--",
                    "sh",
                    "-lc",
                    "umask 077; mktemp -d /tmp/yiru-claude-login.XXXXXXXX",
                ])
                .stdin(Stdio::null())
                .stderr(Stdio::null())
                .kill_on_drop(true)
                .output(),
        )
        .await
        .map_err(|_| AccountsError::LoginTimedOut)?
        .map_err(|_| AccountsError::LoginFailed)?;
        if !output.status.success() || output.stdout.len() > 4096 {
            return Err(AccountsError::LoginFailed);
        }
        let linux_path = std::str::from_utf8(&output.stdout)
            .map_err(|_| AccountsError::InvalidState)?
            .trim();
        if !linux_path.starts_with("/tmp/yiru-claude-login.")
            || linux_path.chars().any(|character| character.is_control())
        {
            return Err(AccountsError::InvalidState);
        }
        return Ok(ManagedLocation {
            account_id: location.account_id.clone(),
            host_path: std::path::PathBuf::from(format!("//wsl.localhost/{distro}{linux_path}")),
            linux_path: Some(linux_path.to_owned()),
            runtime: "wsl",
            wsl_distro: Some(distro.to_owned()),
        });
    }
    let host_path = location
        .host_path
        .parent()
        .ok_or(AccountsError::InvalidState)?
        .join(format!(".login-{}", random_uuid()?));
    secure_file::ensure_secure_directory(&host_path)?;
    Ok(ManagedLocation {
        account_id: location.account_id.clone(),
        host_path,
        linux_path: None,
        runtime: "host",
        wsl_distro: None,
    })
}

async fn cleanup_staging_location(staging: &ManagedLocation) {
    if let (Some(distro), Some(linux_path)) =
        (staging.wsl_distro.as_deref(), staging.linux_path.as_deref())
    {
        let _ = Command::new("wsl.exe")
            .args([
                "-d",
                distro,
                "--",
                "sh",
                "-c",
                "case \"$1\" in /tmp/yiru-claude-login.*) rm -rf -- \"$1\" ;; *) exit 2 ;; esac",
                "yiru-claude-cleanup",
                linux_path,
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .status()
            .await;
    } else if std::fs::symlink_metadata(&staging.host_path)
        .is_ok_and(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
    {
        let _ = std::fs::remove_dir_all(&staging.host_path);
    }
}

async fn claude_status(location: &ManagedLocation) -> Result<Value, AccountsError> {
    let mut command = if let (Some(distro), Some(linux_path)) = (
        location.wsl_distro.as_deref(),
        location.linux_path.as_deref(),
    ) {
        let status = format!(
            "export CLAUDE_CONFIG_DIR={}; exec claude auth status --json",
            shell_quote(linux_path)
        );
        let mut command = Command::new("wsl.exe");
        command.args(["-d", distro, "--", "sh", "-c", &wsl_login_script(&status)]);
        command
    } else {
        host_claude_command(["auth", "status", "--json"], location)?
    };
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(20),
        command.kill_on_drop(true).output(),
    )
    .await
    .map_err(|_| AccountsError::LoginTimedOut)?
    .map_err(|_| AccountsError::LoginFailed)?;
    if output.stdout.len() as u64 > CREDENTIAL_BYTE_LIMIT {
        return Err(AccountsError::InvalidState);
    }
    serde_json::from_slice(&output.stdout).map_err(|_| AccountsError::IdentityUnavailable)
}

#[cfg(not(windows))]
fn host_claude_command<const N: usize>(
    args: [&str; N],
    location: &ManagedLocation,
) -> Result<Command, AccountsError> {
    let mut command = Command::new("claude");
    command
        .args(args)
        .env("CLAUDE_CONFIG_DIR", &location.host_path);
    Ok(command)
}

#[cfg(windows)]
fn host_claude_command<const N: usize>(
    args: [&str; N],
    location: &ManagedLocation,
) -> Result<Command, AccountsError> {
    let resolved = resolve_windows_claude_command();
    let is_batch = resolved
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("cmd") || extension.eq_ignore_ascii_case("bat")
        });
    let mut command = if is_batch {
        let value = resolved.to_string_lossy();
        if value
            .chars()
            .any(|character| "&|<>^\"%!\r\n".contains(character))
            || args.iter().any(|argument| {
                argument
                    .chars()
                    .any(|character| "&|<>^\"%!\r\n".contains(character))
            })
        {
            return Err(AccountsError::LoginUnavailable);
        }
        let executable = std::env::var_os("ComSpec")
            .map(std::path::PathBuf::from)
            .or_else(|| {
                std::env::var_os("SystemRoot").map(|root| {
                    std::path::PathBuf::from(root)
                        .join("System32")
                        .join("cmd.exe")
                })
            })
            .unwrap_or_else(|| std::path::PathBuf::from(r"C:\Windows\System32\cmd.exe"));
        let mut command = Command::new(executable);
        command.args(["/d", "/c"]).arg(&resolved).args(args);
        command
    } else {
        let mut command = Command::new(resolved);
        command.args(args);
        command
    };
    command.env("CLAUDE_CONFIG_DIR", &location.host_path);
    Ok(command)
}

#[cfg(windows)]
fn resolve_windows_claude_command() -> std::path::PathBuf {
    let names = ["claude.cmd", "claude.exe", "claude.bat", "claude"];
    let mut directories = std::env::var_os("PATH")
        .or_else(|| std::env::var_os("Path"))
        .map(|value| std::env::split_paths(&value).collect::<Vec<_>>())
        .unwrap_or_default();
    if let Some(home) = crate::paths::resolve_local_home_path() {
        directories.extend([
            home.join(".volta").join("bin"),
            home.join(".asdf").join("shims"),
            home.join(".local").join("bin"),
            home.join("AppData").join("Roaming").join("npm"),
            home.join("AppData").join("Local").join("pnpm"),
            home.join(".bun").join("bin"),
        ]);
    }
    directories
        .into_iter()
        .flat_map(|directory| names.map(|name| directory.join(name)))
        .find(|candidate| std::fs::metadata(candidate).is_ok_and(|metadata| metadata.is_file()))
        .unwrap_or_else(|| std::path::PathBuf::from("claude"))
}

async fn read_claude_credentials(location: &ManagedLocation) -> Result<Value, AccountsError> {
    let path = location.host_path.join(".credentials.json");
    if let Some(credentials) = read_bounded_json(&path).await? {
        return Ok(credentials);
    }
    #[cfg(target_os = "macos")]
    {
        let user = std::env::var("USER")
            .or_else(|_| std::env::var("USERNAME"))
            .unwrap_or_else(|_| "user".to_owned());
        let scoped = scoped_keychain_service(&location.host_path);
        for (service, account) in [
            (
                "Yiru Claude Code Managed Credentials",
                location.account_id.as_str(),
            ),
            (scoped.as_str(), user.as_str()),
        ] {
            if let Some(credentials) = read_keychain_json(service, account).await? {
                return Ok(credentials);
            }
        }
    }
    Err(AccountsError::IdentityUnavailable)
}

async fn read_claude_login_credentials(location: &ManagedLocation) -> Result<Value, AccountsError> {
    match read_claude_credentials(location).await {
        Ok(credentials) => Ok(credentials),
        Err(AccountsError::IdentityUnavailable) => {
            #[cfg(target_os = "macos")]
            {
                let user = keychain_user();
                return read_keychain_json("Claude Code-credentials", &user)
                    .await?
                    .ok_or(AccountsError::IdentityUnavailable);
            }
            #[cfg(not(target_os = "macos"))]
            Err(AccountsError::IdentityUnavailable)
        }
        Err(error) => Err(error),
    }
}

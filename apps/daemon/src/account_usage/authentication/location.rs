use std::path::{Path, PathBuf};

use serde_json::{Map, Value, json};
#[cfg(windows)]
use tokio::process::Command;

use crate::transport::secure_file;

use super::{
    AccountsError, AuthenticationProvider, AuthenticationTarget, ManagedLocation, read_bounded_sync,
};
#[cfg(target_os = "macos")]
use super::{keychain_user, restore_keychain, scoped_keychain_service};

pub(super) async fn create_location(
    root: &Path,
    provider: AuthenticationProvider,
    account_id: &str,
    target: &AuthenticationTarget<'_>,
) -> Result<ManagedLocation, AccountsError> {
    if target.runtime == "wsl" {
        return create_wsl_location(provider, account_id, target.wsl_distro).await;
    }
    let (folder, leaf, marker) = location_parts(provider);
    let path = root.join(folder).join(account_id).join(leaf);
    secure_file::ensure_secure_directory(&path)?;
    secure_file::write_bytes(&path.join(marker), format!("{account_id}\n").as_bytes())?;
    Ok(ManagedLocation {
        account_id: account_id.to_owned(),
        host_path: std::fs::canonicalize(path)?,
        linux_path: None,
        runtime: "host",
        wsl_distro: None,
    })
}

#[cfg(windows)]
async fn create_wsl_location(
    provider: AuthenticationProvider,
    account_id: &str,
    requested_distro: Option<&str>,
) -> Result<ManagedLocation, AccountsError> {
    let mut command = Command::new("wsl.exe");
    if let Some(distro) = requested_distro {
        command.args(["-d", distro]);
    }
    let output = command
        .args([
            "--",
            "sh",
            "-lc",
            "printf '%s\\n%s\\n' \"$WSL_DISTRO_NAME\" \"$HOME\"",
        ])
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|_| AccountsError::RuntimeMismatch)?;
    if !output.status.success() || output.stdout.len() > 16 * 1024 {
        return Err(AccountsError::RuntimeMismatch);
    }
    let text = String::from_utf8(output.stdout).map_err(|_| AccountsError::RuntimeMismatch)?;
    let mut lines = text.lines();
    let reported_distro = lines.next();
    let reported_home = lines.next();
    let distro = requested_distro
        .or(reported_distro)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or(AccountsError::RuntimeMismatch)?
        .to_owned();
    let home = reported_home
        .map(str::trim)
        .filter(|value| value.starts_with('/'))
        .ok_or(AccountsError::RuntimeMismatch)?;
    let (folder, leaf, marker) = location_parts(provider);
    let linux_path = format!("{home}/.local/share/yiru/{folder}/{account_id}/{leaf}");
    let script = "set -eu; umask 077; mkdir -p -- \"$1\"; chmod 700 -- \"$1\"; printf '%s\\n' \"$2\" > \"$1/$3\"; chmod 600 -- \"$1/$3\"";
    let status = Command::new("wsl.exe")
        .args([
            "-d",
            &distro,
            "--",
            "sh",
            "-c",
            script,
            "yiru-account",
            &linux_path,
            account_id,
            marker,
        ])
        .kill_on_drop(true)
        .status()
        .await
        .map_err(|_| AccountsError::RuntimeMismatch)?;
    if !status.success() {
        return Err(AccountsError::RuntimeMismatch);
    }
    Ok(ManagedLocation {
        account_id: account_id.to_owned(),
        host_path: PathBuf::from(format!("//wsl.localhost/{distro}{linux_path}")),
        linux_path: Some(linux_path),
        runtime: "wsl",
        wsl_distro: Some(distro),
    })
}

#[cfg(not(windows))]
async fn create_wsl_location(
    _provider: AuthenticationProvider,
    _account_id: &str,
    _requested_distro: Option<&str>,
) -> Result<ManagedLocation, AccountsError> {
    Err(AccountsError::RuntimeMismatch)
}

pub(super) fn stored_location(
    root: &Path,
    provider: AuthenticationProvider,
    account: &Map<String, Value>,
    account_id: &str,
) -> Result<ManagedLocation, AccountsError> {
    let path_key = if matches!(provider, AuthenticationProvider::Claude) {
        "managedAuthPath"
    } else {
        "managedHomePath"
    };
    let linux_key = if matches!(provider, AuthenticationProvider::Claude) {
        "wslLinuxAuthPath"
    } else {
        "wslLinuxHomePath"
    };
    let runtime = account
        .get(if matches!(provider, AuthenticationProvider::Claude) {
            "managedAuthRuntime"
        } else {
            "managedHomeRuntime"
        })
        .and_then(Value::as_str)
        .unwrap_or("host");
    let host_path = account
        .get(path_key)
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .ok_or(AccountsError::InvalidState)?;
    let (folder, leaf, marker) = location_parts(provider);
    if runtime == "wsl" {
        let distro = account
            .get("wslDistro")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .ok_or(AccountsError::InvalidState)?;
        let linux_path = account
            .get(linux_key)
            .and_then(Value::as_str)
            .ok_or(AccountsError::InvalidState)?;
        let expected_suffix = format!("/.local/share/yiru/{folder}/{account_id}/{leaf}");
        let expected_host_path = format!("//wsl.localhost/{distro}{linux_path}");
        let normalized_host_path = host_path.to_string_lossy().replace('\\', "/");
        if !linux_path.ends_with(&expected_suffix)
            || !normalized_host_path.eq_ignore_ascii_case(&expected_host_path)
        {
            return Err(AccountsError::InvalidState);
        }
    } else {
        let canonical = std::fs::canonicalize(&host_path)?;
        let expected = std::fs::canonicalize(root.join(folder).join(account_id).join(leaf))?;
        let canonical_root = std::fs::canonicalize(root.join(folder))?;
        if canonical != expected || !canonical.starts_with(canonical_root) {
            return Err(AccountsError::InvalidState);
        }
    }
    let marker_value =
        read_bounded_sync(&host_path.join(marker))?.ok_or(AccountsError::InvalidState)?;
    if std::str::from_utf8(&marker_value)
        .map_err(|_| AccountsError::InvalidState)?
        .trim()
        != account_id
    {
        return Err(AccountsError::InvalidState);
    }
    Ok(ManagedLocation {
        account_id: account_id.to_owned(),
        host_path,
        linux_path: account
            .get(linux_key)
            .and_then(Value::as_str)
            .map(str::to_owned),
        runtime: if runtime == "wsl" { "wsl" } else { "host" },
        wsl_distro: account
            .get("wslDistro")
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}

pub(super) async fn cleanup_location(
    root: &Path,
    provider: AuthenticationProvider,
    location: &ManagedLocation,
    account_id: &str,
) {
    let _ = super::super::accounts::remove_managed_storage(
        root,
        provider.name(),
        &account_value_for_cleanup(provider, location),
        account_id,
    )
    .await;
    if matches!(provider, AuthenticationProvider::Claude) && location.runtime == "host" {
        let _ = super::super::accounts::delete_managed_claude_keychain(account_id).await;
        #[cfg(target_os = "macos")]
        {
            let _ = restore_keychain(
                &scoped_keychain_service(&location.host_path),
                &keychain_user(),
                None,
            )
            .await;
        }
    }
}

fn account_value_for_cleanup(
    provider: AuthenticationProvider,
    location: &ManagedLocation,
) -> Map<String, Value> {
    let mut value = Map::new();
    value.insert(
        if matches!(provider, AuthenticationProvider::Claude) {
            "managedAuthPath"
        } else {
            "managedHomePath"
        }
        .to_owned(),
        json!(location.host_path),
    );
    value.insert(
        if matches!(provider, AuthenticationProvider::Claude) {
            "managedAuthRuntime"
        } else {
            "managedHomeRuntime"
        }
        .to_owned(),
        json!(location.runtime),
    );
    value.insert("wslDistro".to_owned(), json!(location.wsl_distro));
    value
}

fn location_parts(provider: AuthenticationProvider) -> (&'static str, &'static str, &'static str) {
    match provider {
        AuthenticationProvider::Claude => ("claude-accounts", "auth", ".yiru-managed-claude-auth"),
        AuthenticationProvider::Codex => ("codex-accounts", "home", ".yiru-managed-home"),
    }
}

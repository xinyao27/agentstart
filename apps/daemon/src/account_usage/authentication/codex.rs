use std::process::Stdio;

#[cfg(windows)]
use std::path::PathBuf;

use tokio::process::Command;

use super::{AccountsError, Identity, ManagedLocation, codex_identity, read_bounded, run_codex};

pub(super) async fn authenticate(
    location: &ManagedLocation,
    call_cancelled: impl Future<Output = ()>,
) -> Result<Identity, AccountsError> {
    let auth_path = location.host_path.join("auth.json");
    let initial_auth = read_bounded(&auth_path).await?;
    let mut command = if let (Some(distro), Some(linux_path)) = (
        location.wsl_distro.as_deref(),
        location.linux_path.as_deref(),
    ) {
        ensure_wsl_cli_available(distro, "codex").await?;
        let mut command = Command::new("wsl.exe");
        let login = format!(
            "export CODEX_HOME={}; exec codex login",
            shell_quote(linux_path)
        );
        command.args(["-d", distro, "--", "sh", "-c", &wsl_login_script(&login)]);
        command
    } else {
        host_login_command(location)?
    };
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    run_codex(
        command,
        &auth_path,
        initial_auth.as_deref(),
        cfg!(windows) && location.runtime == "host",
        call_cancelled,
    )
    .await?;
    harden_wsl_home(location).await?;
    codex_identity(&auth_path).await
}

async fn harden_wsl_home(location: &ManagedLocation) -> Result<(), AccountsError> {
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
            "set -eu; chmod 700 -- \"$1\"; [ ! -f \"$1/auth.json\" ] || chmod 600 -- \"$1/auth.json\"; [ ! -f \"$1/config.toml\" ] || chmod 600 -- \"$1/config.toml\"",
            "agentstart-codex-permissions",
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

#[cfg(not(windows))]
fn host_login_command(location: &ManagedLocation) -> Result<Command, AccountsError> {
    let mut command = Command::new("codex");
    command.arg("login").env("CODEX_HOME", &location.host_path);
    Ok(command)
}

#[cfg(windows)]
fn host_login_command(location: &ManagedLocation) -> Result<Command, AccountsError> {
    let resolved = resolve_windows_codex_command();
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
        {
            return Err(AccountsError::LoginUnavailable);
        }
        let executable = std::env::var_os("ComSpec")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("SystemRoot")
                    .map(|root| PathBuf::from(root).join("System32").join("cmd.exe"))
            })
            .unwrap_or_else(|| PathBuf::from(r"C:\Windows\System32\cmd.exe"));
        let mut command = Command::new(executable);
        command.args(["/d", "/c"]);
        command.arg(&resolved).arg("login");
        command
    } else {
        let mut command = Command::new(resolved);
        command.arg("login");
        command
    };
    command.env("CODEX_HOME", &location.host_path);
    Ok(command)
}

#[cfg(windows)]
fn resolve_windows_codex_command() -> PathBuf {
    let names = ["codex.cmd", "codex.exe", "codex.bat", "codex"];
    let mut directories = std::env::var_os("PATH")
        .or_else(|| std::env::var_os("Path"))
        .map(|value| std::env::split_paths(&value).collect::<Vec<_>>())
        .unwrap_or_default();
    if let Some(home) = crate::paths::resolve_local_home_path() {
        directories.extend([
            home.join(".volta").join("bin"),
            home.join(".asdf").join("shims"),
            home.join(".fnm")
                .join("aliases")
                .join("default")
                .join("bin"),
            home.join(".local").join("share").join("mise").join("shims"),
            home.join(".local").join("bin"),
            home.join("AppData").join("Roaming").join("npm"),
            home.join("AppData").join("Local").join("pnpm"),
            home.join("AppData").join("Local").join("Yarn").join("bin"),
            home.join(".bun").join("bin"),
        ]);
    }
    directories
        .into_iter()
        .flat_map(|directory| names.map(|name| directory.join(name)))
        .find(|candidate| std::fs::metadata(candidate).is_ok_and(|metadata| metadata.is_file()))
        .unwrap_or_else(|| PathBuf::from("codex"))
}

pub(super) async fn ensure_wsl_cli_available(
    distro: &str,
    executable: &str,
) -> Result<(), AccountsError> {
    if !executable
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(AccountsError::LoginUnavailable);
    }
    let probe = format!("command -v {executable} >/dev/null 2>&1");
    let status = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        Command::new("wsl.exe")
            .args(["-d", distro, "--", "sh", "-c", &wsl_login_script(&probe)])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .status(),
    )
    .await
    .map_err(|_| AccountsError::LoginUnavailable)?
    .map_err(|_| AccountsError::LoginUnavailable)?;
    if status.success() {
        Ok(())
    } else {
        Err(AccountsError::LoginUnavailable)
    }
}

pub(super) fn wsl_login_script(command: &str) -> String {
    let command = shell_quote(command);
    format!(
        "_agentstart_wsl_shell=$(getent passwd \"$(id -un)\" 2>/dev/null | cut -d: -f7)\n\
         if [ -z \"$_agentstart_wsl_shell\" ] || [ ! -x \"$_agentstart_wsl_shell\" ]; then _agentstart_wsl_shell=\"${{SHELL:-/bin/bash}}\"; fi\n\
         if [ -z \"$_agentstart_wsl_shell\" ] || [ ! -x \"$_agentstart_wsl_shell\" ]; then _agentstart_wsl_shell=/bin/sh; fi\n\
         _agentstart_wsl_shell_name=$(basename \"$_agentstart_wsl_shell\" | tr \"[:upper:]\" \"[:lower:]\")\n\
         case \"$_agentstart_wsl_shell_name\" in\n\
         sh|dash) exec \"$_agentstart_wsl_shell\" -lc {command} ;;\n\
         bash|zsh|ksh|mksh|ash) exec \"$_agentstart_wsl_shell\" -ilc {command} ;;\n\
         *) exec /bin/sh -lc {command} ;;\n\
         esac"
    )
}

pub(super) fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

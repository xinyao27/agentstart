use std::env;
use std::ffi::OsString;
#[cfg(target_os = "windows")]
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::Serialize;
use thiserror::Error;

use super::service::{self, ServiceError, ServiceState};

#[cfg(target_os = "macos")]
mod computer_use;

const CHROME_WEB_STORE_URL: &str =
    "https://chromewebstore.google.com/detail/agentstart/mfgmfiabfncmdekmikepemddejoeihbf";

#[derive(Debug, Error)]
pub(crate) enum InstallError {
    #[error("install_argument_unsupported:{0}")]
    UnsupportedArgument(String),
    #[cfg(target_os = "macos")]
    #[error(transparent)]
    ComputerUse(#[from] computer_use::ComputerUseInstallError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    NativeMessaging(#[from] crate::native_messaging::NativeMessagingInstallError),
    #[error(transparent)]
    Service(#[from] ServiceError),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallOutput {
    computer_use: &'static str,
    extension_page_opened: bool,
    extension_url: &'static str,
    service: &'static str,
}

pub(super) async fn run(args: &[OsString]) -> Result<(), InstallError> {
    validate_options(args)?;
    let computer_use = install_computer_use_helper(env!("CARGO_PKG_VERSION")).await?;
    crate::native_messaging::install(&[OsString::from("--silent")])?;
    let service_state = if has_flag(args, "--no-service") {
        None
    } else {
        Some(service::install()?)
    };
    let extension_page_opened = !has_flag(args, "--no-browser") && open_extension_page();
    let output = InstallOutput {
        computer_use,
        extension_page_opened,
        extension_url: CHROME_WEB_STORE_URL,
        service: service_state_name(service_state),
    };
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else if extension_page_opened {
        println!("AgentStart is running. Confirm Add to Chrome in the opened Web Store page.");
    } else {
        println!("AgentStart is running. Install the Chrome extension: {CHROME_WEB_STORE_URL}");
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) async fn install_computer_use_helper(
    version: &str,
) -> Result<&'static str, InstallError> {
    Ok(computer_use::install(version).await?)
}

#[cfg(not(target_os = "macos"))]
pub(crate) async fn install_computer_use_helper(
    _version: &str,
) -> Result<&'static str, InstallError> {
    Ok("not-required")
}

fn validate_options(args: &[OsString]) -> Result<(), InstallError> {
    for argument in args {
        if argument != "--json" && argument != "--no-service" && argument != "--no-browser" {
            return Err(InstallError::UnsupportedArgument(
                argument.to_string_lossy().into_owned(),
            ));
        }
    }
    Ok(())
}

fn has_flag(args: &[OsString], flag: &str) -> bool {
    args.iter().any(|argument| argument == flag)
}

fn service_state_name(state: Option<ServiceState>) -> &'static str {
    match state {
        None | Some(ServiceState::NotInstalled) => "not-installed",
        Some(ServiceState::Running) => "running",
        Some(ServiceState::Stopped) => "stopped",
    }
}

fn open_extension_page() -> bool {
    if has_nonempty_environment("SSH_CONNECTION") || has_nonempty_environment("SSH_TTY") {
        return false;
    }
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("/usr/bin/open");
        command.arg(CHROME_WEB_STORE_URL);
        command
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        if !has_nonempty_environment("DISPLAY") && !has_nonempty_environment("WAYLAND_DISPLAY") {
            return false;
        }
        let mut command = Command::new("xdg-open");
        command.arg(CHROME_WEB_STORE_URL);
        command
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new(windows_powershell_executable());
        command.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Process -FilePath $args[0]",
            CHROME_WEB_STORE_URL,
        ]);
        command
    };
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    return false;

    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

fn has_nonempty_environment(name: &str) -> bool {
    env::var_os(name).is_some_and(|value| !value.is_empty())
}

#[cfg(target_os = "windows")]
fn windows_powershell_executable() -> PathBuf {
    env::var("SystemRoot")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .map(|root| {
            root.join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe")
        })
        .unwrap_or_else(|| PathBuf::from("powershell.exe"))
}

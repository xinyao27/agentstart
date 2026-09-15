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
    "https://chromewebstore.google.com/detail/agentstart/ljgpbhfigjepmdeaggfdagchkgaogglp";
// Why: no script can install an iOS app, so handing over the TestFlight link is the whole of the
// installer's mobile job. This constant duplicates packages/client/src/mobile/downloads.ts,
// apps/web/src/site-links.ts, and AgentStartMobile's ConnectionStatus.swift; all four must agree.
const MOBILE_TESTFLIGHT_URL: &str = "https://testflight.apple.com/join/9Cq3j7hR";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ExtensionChannel {
    WebStore,
    Unpacked,
    Skip,
}

impl ExtensionChannel {
    fn parse(value: &OsString) -> Result<Self, InstallError> {
        match value.to_str() {
            Some("web-store") => Ok(Self::WebStore),
            Some("unpacked") => Ok(Self::Unpacked),
            Some("skip") => Ok(Self::Skip),
            _ => Err(InstallError::UnsupportedChannel(
                value.to_string_lossy().into_owned(),
            )),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::WebStore => "web-store",
            Self::Unpacked => "unpacked",
            Self::Skip => "skip",
        }
    }
}

struct InstallOptions {
    json: bool,
    no_service: bool,
    no_browser: bool,
    no_mobile: bool,
    extension: ExtensionChannel,
}

impl InstallOptions {
    fn parse(args: &[OsString]) -> Result<Self, InstallError> {
        let mut options = Self {
            json: false,
            no_service: false,
            no_browser: false,
            no_mobile: false,
            extension: ExtensionChannel::WebStore,
        };
        let mut arguments = args.iter();
        while let Some(argument) = arguments.next() {
            match argument.to_str() {
                Some("--json") => options.json = true,
                Some("--no-service") => options.no_service = true,
                Some("--no-browser") => options.no_browser = true,
                Some("--no-mobile") => options.no_mobile = true,
                Some("--extension") => {
                    let value = arguments
                        .next()
                        .ok_or_else(|| InstallError::MissingFlagValue("--extension".to_owned()))?;
                    options.extension = ExtensionChannel::parse(value)?;
                }
                _ => {
                    return Err(InstallError::UnsupportedArgument(
                        argument.to_string_lossy().into_owned(),
                    ));
                }
            }
        }
        Ok(options)
    }
}

#[derive(Debug, Error)]
pub(crate) enum InstallError {
    #[error("install_argument_unsupported:{0}")]
    UnsupportedArgument(String),
    #[error("install_flag_value_missing:{0}")]
    MissingFlagValue(String),
    #[error("install_extension_channel_unsupported:{0}")]
    UnsupportedChannel(String),
    #[cfg(target_os = "macos")]
    #[error(transparent)]
    ComputerUse(#[from] computer_use::ComputerUseInstallError),
    #[error(transparent)]
    ExtensionBundle(#[from] crate::extension_bundle::ExtensionBundleError),
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
    extension_channel: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    extension_bundle: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    extension_bundle_path: Option<String>,
    extension_page_opened: bool,
    extension_url: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    mobile_install_url: Option<&'static str>,
    service: &'static str,
}

struct ExtensionOutcome {
    channel: ExtensionChannel,
    bundle: Option<&'static str>,
    directory: Option<String>,
    page_opened: bool,
}

pub(super) async fn run(args: &[OsString]) -> Result<(), InstallError> {
    let options = InstallOptions::parse(args)?;
    let computer_use = install_computer_use_helper(env!("CARGO_PKG_VERSION")).await?;
    crate::native_messaging::install(&[OsString::from("--silent")])?;
    let service_state = if options.no_service {
        None
    } else {
        Some(service::install()?)
    };
    let extension = prepare_extension(&options).await?;
    let output = InstallOutput {
        computer_use,
        extension_channel: extension.channel.name(),
        extension_bundle: extension.bundle,
        extension_bundle_path: extension.directory.clone(),
        extension_page_opened: extension.page_opened,
        extension_url: CHROME_WEB_STORE_URL,
        mobile_install_url: (!options.no_mobile).then_some(MOBILE_TESTFLIGHT_URL),
        service: service_state_name(service_state),
    };
    if options.json {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        write_report(&extension, options.no_mobile);
    }
    Ok(())
}

async fn prepare_extension(options: &InstallOptions) -> Result<ExtensionOutcome, InstallError> {
    match options.extension {
        ExtensionChannel::WebStore => Ok(ExtensionOutcome {
            channel: ExtensionChannel::WebStore,
            bundle: None,
            directory: None,
            page_opened: !options.no_browser && open_extension_page(),
        }),
        ExtensionChannel::Unpacked => {
            let sync = crate::extension_bundle::sync().await?;
            let directory = crate::extension_bundle::resolve_bundle_directory()?
                .to_string_lossy()
                .into_owned();
            Ok(ExtensionOutcome {
                channel: ExtensionChannel::Unpacked,
                bundle: Some(sync.name()),
                directory: Some(directory),
                page_opened: false,
            })
        }
        ExtensionChannel::Skip => Ok(ExtensionOutcome {
            channel: ExtensionChannel::Skip,
            bundle: None,
            directory: None,
            page_opened: false,
        }),
    }
}

fn write_report(extension: &ExtensionOutcome, no_mobile: bool) {
    if extension.page_opened {
        println!("AgentStart is running. Confirm Add to Chrome in the opened Web Store page.");
    } else if let Some(directory) = &extension.directory {
        println!(
            "AgentStart is running. In chrome://extensions enable Developer mode, choose \
             \"Load unpacked\", and select {directory}."
        );
    } else if extension.channel == ExtensionChannel::WebStore {
        println!("AgentStart is running. Install the Chrome extension: {CHROME_WEB_STORE_URL}");
    } else {
        println!("AgentStart is running.");
    }
    if no_mobile {
        return;
    }
    println!("AgentStart Mobile is in TestFlight: {MOBILE_TESTFLIGHT_URL}");
    // Why: the code is at most a convenience here — the install already succeeded, and a terminal
    // that cannot draw it must not turn a finished setup into a failure.
    if let Ok(Some(qr)) = crate::mobile::render_terminal_qr(MOBILE_TESTFLIGHT_URL) {
        print!("{qr}");
    }
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

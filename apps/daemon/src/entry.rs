use std::ffi::OsString;
use std::process::ExitCode;

use crate::native_messaging;

mod agent;
mod browser;
mod codex_grant;
mod computer;
mod daemon_options;
mod daemon_runtime;
mod environment;
mod events;
mod host;
mod install;
mod layout;
mod mobile;
mod repo;
mod restart_parent;
mod service;
mod skills;
mod terminal;
mod update;
mod warp_theme;
mod worktree;

pub(crate) use install::install_computer_use_helper;
#[cfg(target_os = "windows")]
pub(crate) use service::schedule_restart_after_exit;
pub(crate) use service::{
    ServiceState, restart as restart_daemon_service, state as daemon_service_state,
};

pub(crate) const RESTART_PARENT_ENV: &str = "YIRU_RESTART_PARENT_PID";
const CODEX_GRANT_ENTRY_COMMAND: &str = "__yiru-codex-grant-entry";
const WARP_THEME_PARSE_ENTRY_COMMAND: &str = "__yiru-warp-theme-parse-entry";
const CLI_USAGE: &str = "Usage: yiru <install|status|service|connection|events|host|environment|repo|worktree|layout|terminal|agent|browser|computer|mobile|skills|update|daemon|native-messaging> [options]";

#[derive(Debug, Eq, PartialEq)]
pub enum InternalCommand {
    CodexGrant,
    WarpThemeParse,
}

#[derive(Debug, Eq, PartialEq)]
pub enum Invocation {
    Daemon(Vec<OsString>),
    NativeHost(Vec<OsString>),
    NativeInstall(Vec<OsString>),
    Cli(Vec<OsString>),
    Internal(InternalCommand),
}

impl Invocation {
    pub fn parse(args: impl IntoIterator<Item = OsString>) -> Self {
        let mut args = args.into_iter();
        let _executable = args.next();
        let remaining = args.collect::<Vec<_>>();
        let command = remaining.first().and_then(|value| value.to_str());
        match command {
            Some(CODEX_GRANT_ENTRY_COMMAND) => Self::Internal(InternalCommand::CodexGrant),
            Some(WARP_THEME_PARSE_ENTRY_COMMAND) => Self::Internal(InternalCommand::WarpThemeParse),
            Some("daemon") => Self::Daemon(remaining[1..].to_vec()),
            Some("native-messaging")
                if remaining.get(1).and_then(|value| value.to_str()) == Some("install") =>
            {
                Self::NativeInstall(remaining[2..].to_vec())
            }
            Some("native-messaging") => Self::NativeHost(remaining[1..].to_vec()),
            Some(value) if value.starts_with("chrome-extension://") => Self::NativeHost(remaining),
            _ => Self::Cli(remaining),
        }
    }

    pub fn waits_for_restart_parent(&self) -> bool {
        !matches!(self, Self::Internal(_))
    }
}

pub async fn run(invocation: Invocation, restart_parent: Option<OsString>) -> ExitCode {
    if let Err(error) = crate::http_client::install_crypto_provider() {
        eprintln!("[daemon] Runtime host failed: {error}");
        return ExitCode::FAILURE;
    }
    if let Err(error) = restart_parent::wait(restart_parent).await {
        eprintln!("[daemon] Runtime host failed: {error}");
        return ExitCode::FAILURE;
    }
    if let Some(result) = run_immediate(&invocation) {
        return result;
    }
    match invocation {
        Invocation::Daemon(args) => {
            let options = match daemon_options::parse(&args) {
                Ok(options) => options,
                Err(error) => {
                    eprintln!("[daemon] Runtime host failed: {error}");
                    return ExitCode::FAILURE;
                }
            };
            match daemon_runtime::run(options).await {
                Ok(exit_code) => exit_code,
                Err(error) => {
                    eprintln!("[daemon] Runtime host failed: {error}");
                    ExitCode::FAILURE
                }
            }
        }
        Invocation::Internal(InternalCommand::CodexGrant) => match codex_grant::run().await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("[daemon] Runtime host failed: {error}");
                ExitCode::FAILURE
            }
        },
        Invocation::Cli(args) => run_cli(&args).await,
        invocation => {
            eprintln!(
                "Rust migration binary is not active for {} yet.",
                invocation_name(&invocation)
            );
            ExitCode::from(69)
        }
    }
}

async fn run_cli(args: &[OsString]) -> ExitCode {
    if let Err(error) = crate::protocol::embedded_metadata() {
        eprintln!("[protocol] {error}");
        return ExitCode::from(70);
    }
    if args.first().and_then(|argument| argument.to_str()) == Some("update") {
        return update::run(&args[1..]).await;
    }
    if browser::is_command(args) {
        return match browser::run(args).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        };
    }
    match args.first().and_then(|argument| argument.to_str()) {
        Some("install") => match install::run(&args[1..]).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        Some("service") => match service::run(&args[1..]) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        Some("skills") => match skills::run(&args[1..]).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        Some("events") => match events::run(&args[1..]).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        Some("host") => match host::run(&args[1..]).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        Some("environment") => match environment::run(&args[1..]).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        Some("mobile") => match mobile::run(&args[1..]).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        Some("repo") => match repo::run(&args[1..]).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        Some("worktree") => match worktree::run(&args[1..]).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        Some("terminal") => match terminal::run(&args[1..]).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        Some("layout") => match layout::run(&args[1..]).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        Some("agent") => match agent::run(&args[1..]).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        Some("computer") => match computer::run(&args[1..]).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("Yiru command failed: {error}");
                ExitCode::FAILURE
            }
        },
        _ => {
            eprintln!("Rust migration binary is not active for CLI command yet.");
            ExitCode::from(69)
        }
    }
}

pub fn run_immediate(invocation: &Invocation) -> Option<ExitCode> {
    match invocation {
        Invocation::Cli(args) if is_version_command(args) => {
            println!(env!("CARGO_PKG_VERSION"));
            Some(ExitCode::SUCCESS)
        }
        Invocation::Cli(args) if is_help_command(args) => {
            println!("{CLI_USAGE}");
            Some(ExitCode::SUCCESS)
        }
        Invocation::Cli(args) if is_connection_command(args) => {
            Some(match crate::cli::run_connection(&args[1..]) {
                Ok(()) => ExitCode::SUCCESS,
                Err(error) => {
                    eprintln!("Yiru command failed: {error}");
                    ExitCode::FAILURE
                }
            })
        }
        Invocation::Cli(args) if is_status_command(args) => {
            Some(match crate::cli::run_status(&args[1..]) {
                Ok(()) => ExitCode::SUCCESS,
                Err(error) => {
                    eprintln!("Yiru command failed: {error}");
                    ExitCode::FAILURE
                }
            })
        }
        Invocation::NativeHost(args) => Some(match native_messaging::run_host(args) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("[native-messaging] {error}");
                ExitCode::FAILURE
            }
        }),
        Invocation::NativeInstall(args) => Some(match native_messaging::install(args) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("[native-messaging] {error}");
                ExitCode::FAILURE
            }
        }),
        Invocation::Internal(InternalCommand::WarpThemeParse) => Some(match warp_theme::run() {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("[warp-theme-parser] {error}");
                ExitCode::FAILURE
            }
        }),
        Invocation::Daemon(_)
        | Invocation::Cli(_)
        | Invocation::Internal(InternalCommand::CodexGrant) => None,
    }
}

pub fn restart_parent_pid() -> Option<OsString> {
    std::env::var_os(RESTART_PARENT_ENV)
}

fn is_version_command(args: &[OsString]) -> bool {
    matches!(
        args.first().and_then(|value| value.to_str()),
        Some("--version" | "-v" | "version")
    )
}

fn is_help_command(args: &[OsString]) -> bool {
    match args.first().and_then(|value| value.to_str()) {
        None | Some("--help" | "-h") => true,
        Some("help") => args.len() == 1,
        Some(_) => false,
    }
}

fn is_status_command(args: &[OsString]) -> bool {
    args.first().and_then(|value| value.to_str()) == Some("status")
}

fn is_connection_command(args: &[OsString]) -> bool {
    args.first().and_then(|value| value.to_str()) == Some("connection")
}

fn invocation_name(invocation: &Invocation) -> &'static str {
    match invocation {
        Invocation::Daemon(_) => "daemon",
        Invocation::NativeHost(_) => "native-messaging host",
        Invocation::NativeInstall(_) => "native-messaging install",
        Invocation::Cli(_) => "CLI command",
        Invocation::Internal(InternalCommand::CodexGrant) => "Codex grant helper",
        Invocation::Internal(InternalCommand::WarpThemeParse) => "Warp theme parser",
    }
}

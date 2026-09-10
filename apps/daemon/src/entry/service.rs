use std::ffi::OsString;
use std::io;
use std::path::PathBuf;
#[cfg(target_os = "macos")]
use std::process::Output;
use std::process::{Command, ExitStatus, Stdio};

use serde::Serialize;
use thiserror::Error;

#[cfg(target_os = "macos")]
mod launchd;
#[cfg(target_os = "linux")]
mod systemd;
#[cfg(target_os = "windows")]
mod windows_task;

#[cfg(target_os = "macos")]
use launchd as platform;
#[cfg(target_os = "linux")]
use systemd as platform;
#[cfg(target_os = "windows")]
use windows_task as platform;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ServiceState {
    NotInstalled,
    Running,
    Stopped,
}

#[derive(Debug, Error)]
pub(crate) enum ServiceError {
    #[error("service_action_unsupported")]
    UnsupportedAction,
    #[error("service_argument_unsupported:{0}")]
    UnsupportedArgument(String),
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    #[error("daemon_service_platform_unsupported")]
    UnsupportedPlatform,
    #[error("daemon_service_user_id_unavailable")]
    UserIdUnavailable,
    #[error("daemon_service_path_not_unicode:{0}")]
    NonUnicodePath(PathBuf),
    #[error("daemon_service_value_invalid:{0}")]
    InvalidValue(&'static str),
    #[error("daemon_service_command_failed:{program}:{code}")]
    CommandFailed { program: String, code: String },
    #[error("daemon_service_command_unavailable:{program}:{source}")]
    CommandUnavailable {
        program: String,
        #[source]
        source: io::Error,
    },
    #[error("daemon_service_io_failed:{0}")]
    Io(#[from] io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    SecureFile(#[from] crate::transport::secure_file::SecureFileError),
}

#[derive(Serialize)]
struct ServiceOutput {
    executable: Option<String>,
    pid: Option<u32>,
    state: ServiceState,
}

pub(super) fn run(args: &[OsString]) -> Result<(), ServiceError> {
    let action = args
        .first()
        .and_then(|argument| argument.to_str())
        .ok_or(ServiceError::UnsupportedAction)?;
    validate_options(&args[1..])?;
    let state = match action {
        "install" => install()?,
        "uninstall" => platform::uninstall()?,
        "status" => state()?,
        "start" => platform::start()?,
        "stop" => platform::stop()?,
        "restart" => restart()?,
        _ => return Err(ServiceError::UnsupportedAction),
    };
    write_output(action, state, has_flag(args, "--json"))
}

pub(super) fn install() -> Result<ServiceState, ServiceError> {
    platform::install()
}

pub(crate) fn state() -> Result<ServiceState, ServiceError> {
    platform::state()
}

pub(crate) fn restart() -> Result<ServiceState, ServiceError> {
    platform::restart()
}

#[cfg(target_os = "windows")]
pub(crate) fn schedule_restart_after_exit(parent_pid: u32) -> Result<(), ServiceError> {
    platform::schedule_restart_after_exit(parent_pid)
}

fn validate_options(args: &[OsString]) -> Result<(), ServiceError> {
    for argument in args {
        if argument != "--json" {
            return Err(ServiceError::UnsupportedArgument(
                argument.to_string_lossy().into_owned(),
            ));
        }
    }
    Ok(())
}

fn has_flag(args: &[OsString], flag: &str) -> bool {
    args.iter().any(|argument| argument == flag)
}

fn write_output(action: &str, state: ServiceState, json: bool) -> Result<(), ServiceError> {
    if json {
        let executable = platform::configured_executable()?
            .map(|path| {
                path.into_os_string()
                    .into_string()
                    .map_err(|path| ServiceError::NonUnicodePath(PathBuf::from(path)))
            })
            .transpose()?;
        let pid = platform::running_pid()?;
        println!(
            "{}",
            serde_json::to_string(&ServiceOutput {
                executable,
                pid,
                state
            })?
        );
        return Ok(());
    }
    match action {
        "install" => println!("AgentStart daemon service installed and started"),
        "uninstall" => println!("AgentStart daemon service uninstalled"),
        "status" => println!("AgentStart daemon service state: {}", state_name(state)),
        "start" => println!("AgentStart daemon service started"),
        "stop" => println!("AgentStart daemon service stopped"),
        "restart" => println!("AgentStart daemon service restarted"),
        _ => return Err(ServiceError::UnsupportedAction),
    }
    Ok(())
}

fn state_name(state: ServiceState) -> &'static str {
    match state {
        ServiceState::NotInstalled => "not_installed",
        ServiceState::Running => "running",
        ServiceState::Stopped => "stopped",
    }
}

pub(super) fn not_installed_error() -> ServiceError {
    ServiceError::CommandFailed {
        program: "agentstart service".to_owned(),
        code: "not_installed".to_owned(),
    }
}

pub(super) fn run_required(command: &mut Command) -> Result<(), ServiceError> {
    let program = command.get_program().to_string_lossy().into_owned();
    let status = run_status(command)?;
    if status.success() {
        Ok(())
    } else {
        Err(ServiceError::CommandFailed {
            program,
            code: exit_code(status),
        })
    }
}

pub(super) fn run_allow_failure(command: &mut Command) -> Result<bool, ServiceError> {
    run_status(command).map(|status| status.success())
}

pub(super) fn run_status(command: &mut Command) -> Result<ExitStatus, ServiceError> {
    let program = command.get_program().to_string_lossy().into_owned();
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|source| ServiceError::CommandUnavailable { program, source })
}

#[cfg(target_os = "macos")]
pub(super) fn run_output_required(command: &mut Command) -> Result<Output, ServiceError> {
    let program = command.get_program().to_string_lossy().into_owned();
    let output = command
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|source| ServiceError::CommandUnavailable {
            program: program.clone(),
            source,
        })?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(ServiceError::CommandFailed {
            program,
            code: exit_code(output.status),
        })
    }
}

pub(super) fn exit_code(status: ExitStatus) -> String {
    status
        .code()
        .map_or_else(|| "signal".to_owned(), |code| code.to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
mod platform {
    use super::{ServiceError, ServiceState};

    pub(super) fn install() -> Result<ServiceState, ServiceError> {
        Err(ServiceError::UnsupportedPlatform)
    }

    pub(super) fn uninstall() -> Result<ServiceState, ServiceError> {
        Err(ServiceError::UnsupportedPlatform)
    }

    pub(super) fn state() -> Result<ServiceState, ServiceError> {
        Err(ServiceError::UnsupportedPlatform)
    }

    pub(super) fn start() -> Result<ServiceState, ServiceError> {
        Err(ServiceError::UnsupportedPlatform)
    }

    pub(super) fn stop() -> Result<ServiceState, ServiceError> {
        Err(ServiceError::UnsupportedPlatform)
    }

    pub(super) fn restart() -> Result<ServiceState, ServiceError> {
        Err(ServiceError::UnsupportedPlatform)
    }

    pub(super) fn configured_executable() -> Result<Option<std::path::PathBuf>, ServiceError> {
        Err(ServiceError::UnsupportedPlatform)
    }

    pub(super) fn running_pid() -> Result<Option<u32>, ServiceError> {
        Err(ServiceError::UnsupportedPlatform)
    }
}

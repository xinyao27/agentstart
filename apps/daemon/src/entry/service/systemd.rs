use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::{ServiceError, ServiceState, run_allow_failure, run_required};

const SYSTEMD_UNIT: &str = "agentstart.service";

pub(super) fn install() -> Result<ServiceState, ServiceError> {
    crate::transport::secure_file::write_bytes(&unit_path()?, document()?.as_bytes())?;
    reload()?;
    let mut enable = Command::new("systemctl");
    enable.args(["--user", "enable", "--now", SYSTEMD_UNIT]);
    run_required(&mut enable)?;
    state()
}

pub(super) fn uninstall() -> Result<ServiceState, ServiceError> {
    let mut disable = Command::new("systemctl");
    disable.args(["--user", "disable", "--now", SYSTEMD_UNIT]);
    let _ = run_allow_failure(&mut disable)?;
    remove_file_if_present(&unit_path()?)?;
    reload()?;
    Ok(ServiceState::NotInstalled)
}

pub(super) fn state() -> Result<ServiceState, ServiceError> {
    if !unit_path()?.is_file() {
        return Ok(ServiceState::NotInstalled);
    }
    let mut command = Command::new("systemctl");
    command.args(["--user", "is-active", "--quiet", SYSTEMD_UNIT]);
    run_allow_failure(&mut command).map(|running| {
        if running {
            ServiceState::Running
        } else {
            ServiceState::Stopped
        }
    })
}

pub(super) fn configured_executable() -> Result<Option<PathBuf>, ServiceError> {
    let path = unit_path()?;
    if !path.is_file() {
        return Ok(None);
    }
    let contents = fs::read_to_string(path)?;
    let command = contents
        .lines()
        .find_map(|line| line.strip_prefix("ExecStart="))
        .ok_or(ServiceError::InvalidValue("executable"))?;
    let executable = parse_quoted_argument(command)
        .ok_or(ServiceError::InvalidValue("executable"))?
        .replace("%%", "%");
    Ok(Some(PathBuf::from(executable)))
}

pub(super) fn running_pid() -> Result<Option<u32>, ServiceError> {
    if !unit_path()?.is_file() {
        return Ok(None);
    }
    let program = "systemctl";
    let output = Command::new(program)
        .args([
            "--user",
            "show",
            "--property",
            "MainPID",
            "--value",
            SYSTEMD_UNIT,
        ])
        .output()
        .map_err(|source| ServiceError::CommandUnavailable {
            program: program.to_owned(),
            source,
        })?;
    if !output.status.success() {
        return Ok(None);
    }
    let pid = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u32>()
        .ok()
        .filter(|pid| *pid > 0);
    Ok(pid)
}

pub(super) fn start() -> Result<ServiceState, ServiceError> {
    match state()? {
        ServiceState::NotInstalled => return Err(super::not_installed_error()),
        ServiceState::Running => return Ok(ServiceState::Running),
        ServiceState::Stopped => {}
    }
    let mut command = Command::new("systemctl");
    command.args(["--user", "start", SYSTEMD_UNIT]);
    run_required(&mut command)?;
    state()
}

pub(super) fn stop() -> Result<ServiceState, ServiceError> {
    require_installed()?;
    let mut command = Command::new("systemctl");
    command.args(["--user", "stop", SYSTEMD_UNIT]);
    run_required(&mut command)?;
    state()
}

pub(super) fn restart() -> Result<ServiceState, ServiceError> {
    require_installed()?;
    let mut command = Command::new("systemctl");
    command.args(["--user", "restart", SYSTEMD_UNIT]);
    run_required(&mut command)?;
    state()
}

fn require_installed() -> Result<(), ServiceError> {
    if state()? == ServiceState::NotInstalled {
        Err(super::not_installed_error())
    } else {
        Ok(())
    }
}

fn reload() -> Result<(), ServiceError> {
    let mut command = Command::new("systemctl");
    command.args(["--user", "daemon-reload"]);
    run_required(&mut command)
}

fn document() -> Result<String, ServiceError> {
    let executable_path = env::current_exe()?;
    let executable = executable_path
        .to_str()
        .ok_or_else(|| ServiceError::NonUnicodePath(executable_path.clone()))?;
    if executable.chars().any(char::is_control) {
        return Err(ServiceError::InvalidValue("executable"));
    }
    Ok(format!(
        "[Unit]\nDescription=AgentStart daemon\n\n[Service]\nType=simple\nExecStart={} {}\nRestart=on-failure\nRestartSec=2\n\n[Install]\nWantedBy=default.target\n",
        quote(executable),
        quote("daemon")
    ))
}

fn unit_path() -> Result<PathBuf, ServiceError> {
    let config = trimmed_environment("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or(home_path()?.join(".config"));
    Ok(config.join("systemd").join("user").join(SYSTEMD_UNIT))
}

fn home_path() -> Result<PathBuf, ServiceError> {
    crate::paths::resolve_local_home_path().ok_or_else(|| {
        ServiceError::Io(io::Error::new(
            io::ErrorKind::NotFound,
            "home directory is unavailable",
        ))
    })
}

fn trimmed_environment(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn quote(value: &str) -> String {
    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('%', "%%")
    )
}

fn parse_quoted_argument(value: &str) -> Option<String> {
    let mut characters = value.chars();
    if characters.next()? != '"' {
        return None;
    }
    let mut output = String::new();
    while let Some(character) = characters.next() {
        match character {
            '"' => return Some(output),
            '\\' => output.push(characters.next()?),
            _ => output.push(character),
        }
    }
    None
}

fn remove_file_if_present(path: &Path) -> Result<(), ServiceError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

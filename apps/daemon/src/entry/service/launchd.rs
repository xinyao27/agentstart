use std::env;
use std::fs;
use std::io;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::{ServiceError, ServiceState, run_allow_failure, run_output_required, run_required};

const SERVICE_LABEL: &str = "com.agentstart.daemon";

pub(super) fn install() -> Result<ServiceState, ServiceError> {
    let path = launch_agent_path()?;
    let log_directory = launch_log_directory()?;
    fs::create_dir_all(&log_directory)?;
    fs::set_permissions(&log_directory, fs::Permissions::from_mode(0o700))?;
    crate::transport::secure_file::write_bytes(&path, document()?.as_bytes())?;
    let domain = launch_domain()?;
    let mut bootout = Command::new("/bin/launchctl");
    bootout.args(["bootout", &domain]).arg(&path);
    let _ = run_allow_failure(&mut bootout)?;
    bootstrap(&domain, &path)?;
    state()
}

pub(super) fn uninstall() -> Result<ServiceState, ServiceError> {
    let path = launch_agent_path()?;
    let mut command = Command::new("/bin/launchctl");
    command.args(["bootout", &launch_domain()?]).arg(&path);
    let _ = run_allow_failure(&mut command)?;
    remove_file_if_present(&path)?;
    Ok(ServiceState::NotInstalled)
}

pub(super) fn state() -> Result<ServiceState, ServiceError> {
    if !launch_agent_path()?.is_file() {
        return Ok(ServiceState::NotInstalled);
    }
    let mut command = Command::new("/bin/launchctl");
    command.args(["print", &format!("{}/{SERVICE_LABEL}", launch_domain()?)]);
    run_allow_failure(&mut command).map(|running| {
        if running {
            ServiceState::Running
        } else {
            ServiceState::Stopped
        }
    })
}

pub(super) fn configured_executable() -> Result<Option<PathBuf>, ServiceError> {
    let path = launch_agent_path()?;
    if !path.is_file() {
        return Ok(None);
    }
    let output = run_output_required(
        Command::new("/usr/bin/plutil")
            .args(["-extract", "ProgramArguments.0", "raw", "-o", "-"])
            .arg(path),
    )?;
    let executable = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if executable.is_empty() {
        return Err(ServiceError::InvalidValue("executable"));
    }
    Ok(Some(PathBuf::from(executable)))
}

pub(super) fn running_pid() -> Result<Option<u32>, ServiceError> {
    if !launch_agent_path()?.is_file() {
        return Ok(None);
    }
    let program = "/bin/launchctl";
    let output = Command::new(program)
        .args(["print", &format!("{}/{SERVICE_LABEL}", launch_domain()?)])
        .output()
        .map_err(|source| ServiceError::CommandUnavailable {
            program: program.to_owned(),
            source,
        })?;
    if !output.status.success() {
        return Ok(None);
    }
    let text = String::from_utf8_lossy(&output.stdout);
    Ok(text.lines().find_map(|line| {
        line.trim()
            .strip_prefix("pid = ")
            .and_then(|value| value.parse().ok())
    }))
}

pub(super) fn start() -> Result<ServiceState, ServiceError> {
    match state()? {
        ServiceState::NotInstalled => return Err(super::not_installed_error()),
        ServiceState::Running => return Ok(ServiceState::Running),
        ServiceState::Stopped => {}
    }
    bootstrap(&launch_domain()?, &launch_agent_path()?)?;
    state()
}

pub(super) fn stop() -> Result<ServiceState, ServiceError> {
    require_installed()?;
    let path = launch_agent_path()?;
    let mut command = Command::new("/bin/launchctl");
    command.args(["bootout", &launch_domain()?]).arg(path);
    let _ = run_allow_failure(&mut command)?;
    state()
}

pub(super) fn restart() -> Result<ServiceState, ServiceError> {
    require_installed()?;
    let path = launch_agent_path()?;
    let domain = launch_domain()?;
    let mut bootout = Command::new("/bin/launchctl");
    bootout.args(["bootout", &domain]).arg(&path);
    let _ = run_allow_failure(&mut bootout)?;
    bootstrap(&domain, &path)?;
    state()
}

fn bootstrap(domain: &str, path: &Path) -> Result<(), ServiceError> {
    let mut bootstrap = Command::new("/bin/launchctl");
    bootstrap.args(["bootstrap", domain]).arg(path);
    run_required(&mut bootstrap)?;
    let mut enable = Command::new("/bin/launchctl");
    enable.args(["enable", &format!("{domain}/{SERVICE_LABEL}")]);
    run_required(&mut enable)
}

fn require_installed() -> Result<(), ServiceError> {
    if state()? == ServiceState::NotInstalled {
        Err(super::not_installed_error())
    } else {
        Ok(())
    }
}

fn document() -> Result<String, ServiceError> {
    let executable_path = env::current_exe()?;
    let executable = path_text(&executable_path)?;
    let log_directory = launch_log_directory()?;
    let standard_output_path = log_directory.join("daemon.log");
    let standard_error_path = log_directory.join("daemon.error.log");
    let standard_output = path_text(&standard_output_path)?;
    let standard_error = path_text(&standard_error_path)?;
    validate_value(executable, "executable")?;
    validate_value(standard_output, "stdout")?;
    validate_value(standard_error, "stderr")?;
    Ok(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n  <key>Label</key>\n  <string>{SERVICE_LABEL}</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>{}</string>\n    <string>daemon</string>\n  </array>\n  <key>RunAtLoad</key>\n  <true/>\n  <key>KeepAlive</key>\n  <dict><key>SuccessfulExit</key><false/></dict>\n  <key>StandardOutPath</key>\n  <string>{}</string>\n  <key>StandardErrorPath</key>\n  <string>{}</string>\n</dict>\n</plist>\n",
        escape_xml(executable),
        escape_xml(standard_output),
        escape_xml(standard_error)
    ))
}

fn launch_agent_path() -> Result<PathBuf, ServiceError> {
    Ok(home_path()?
        .join("Library")
        .join("LaunchAgents")
        .join(format!("{SERVICE_LABEL}.plist")))
}

fn launch_log_directory() -> Result<PathBuf, ServiceError> {
    Ok(home_path()?.join("Library").join("Logs").join("AgentStart"))
}

fn home_path() -> Result<PathBuf, ServiceError> {
    crate::paths::resolve_local_home_path().ok_or_else(|| {
        ServiceError::Io(io::Error::new(
            io::ErrorKind::NotFound,
            "home directory is unavailable",
        ))
    })
}

fn launch_domain() -> Result<String, ServiceError> {
    let output = run_output_required(Command::new("/usr/bin/id").arg("-u"))?;
    let value = String::from_utf8_lossy(&output.stdout);
    let uid = value.trim();
    if uid.is_empty() || !uid.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(ServiceError::UserIdUnavailable);
    }
    Ok(format!("gui/{uid}"))
}

fn path_text(path: &Path) -> Result<&str, ServiceError> {
    path.to_str()
        .ok_or_else(|| ServiceError::NonUnicodePath(path.to_owned()))
}

fn validate_value(value: &str, name: &'static str) -> Result<(), ServiceError> {
    if value.chars().any(char::is_control) {
        Err(ServiceError::InvalidValue(name))
    } else {
        Ok(())
    }
}

fn remove_file_if_present(path: &Path) -> Result<(), ServiceError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

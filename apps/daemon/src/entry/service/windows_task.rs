use std::env;
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use super::{ServiceError, ServiceState, exit_code, run_allow_failure, run_required, run_status};

const WINDOWS_TASK: &str = "AgentStart Daemon";

pub(super) fn install() -> Result<ServiceState, ServiceError> {
    let instance_token = format!(
        "{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let command_line = command_line(&[
        env::current_exe()?,
        OsString::from("daemon"),
        OsString::from("--service-instance-token"),
        OsString::from(instance_token),
    ])?;
    let mut create = Command::new(system_executable("schtasks.exe"));
    create.args([
        "/Create",
        "/F",
        "/RL",
        "LIMITED",
        "/SC",
        "ONLOGON",
        "/TN",
        WINDOWS_TASK,
        "/TR",
        &command_line,
    ]);
    run_required(&mut create)?;
    run_task()?;
    state()
}

pub(super) fn uninstall() -> Result<ServiceState, ServiceError> {
    let mut command = Command::new(system_executable("schtasks.exe"));
    command.args(["/Delete", "/F", "/TN", WINDOWS_TASK]);
    let _ = run_allow_failure(&mut command)?;
    Ok(ServiceState::NotInstalled)
}

pub(super) fn state() -> Result<ServiceState, ServiceError> {
    if !task_exists()? {
        return Ok(ServiceState::NotInstalled);
    }
    Ok(if task_running()? {
        ServiceState::Running
    } else {
        ServiceState::Stopped
    })
}

pub(super) fn configured_executable() -> Result<Option<PathBuf>, ServiceError> {
    if !task_exists()? {
        return Ok(None);
    }
    let script = "[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); $task = Get-ScheduledTask -TaskName $args[0] -ErrorAction Stop; [Console]::Out.Write(@($task.Actions)[0].Execute)";
    let mut command = Command::new(powershell_executable());
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        script,
        WINDOWS_TASK,
    ]);
    let program = command.get_program().to_string_lossy().into_owned();
    let output = command
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|source| ServiceError::CommandUnavailable {
            program: program.clone(),
            source,
        })?;
    if !output.status.success() {
        return Err(ServiceError::CommandFailed {
            program,
            code: exit_code(output.status),
        });
    }
    let executable = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    if executable.is_empty() {
        return Err(ServiceError::InvalidValue("executable"));
    }
    Ok(Some(PathBuf::from(executable)))
}

pub(super) fn running_pid() -> Result<Option<u32>, ServiceError> {
    if !task_exists()? {
        return Ok(None);
    }
    let script = r#"$task = Get-ScheduledTask -TaskName $args[0] -ErrorAction Stop; $action = @($task.Actions)[0]; $tokenMatch = [regex]::Match($action.Arguments, '--service-instance-token(?:=|\s+)(?:"([^"]+)"|(\S+))'); if (-not $tokenMatch.Success) { exit 4 }; $token = if ($tokenMatch.Groups[1].Success) { $tokenMatch.Groups[1].Value } else { $tokenMatch.Groups[2].Value }; $matches = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $action.Execute -and $_.CommandLine -like ('*--service-instance-token*' + $token + '*') }); if ($matches.Count -gt 1) { exit 5 }; if ($matches.Count -eq 1) { [Console]::Out.Write($matches[0].ProcessId) }"#;
    let mut command = Command::new(powershell_executable());
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        script,
        WINDOWS_TASK,
    ]);
    let program = command.get_program().to_string_lossy().into_owned();
    let output = command
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|source| ServiceError::CommandUnavailable {
            program: program.clone(),
            source,
        })?;
    if !output.status.success() {
        return Err(ServiceError::CommandFailed {
            program,
            code: exit_code(output.status),
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u32>()
        .ok()
        .filter(|pid| *pid > 0))
}

pub(super) fn start() -> Result<ServiceState, ServiceError> {
    match state()? {
        ServiceState::NotInstalled => return Err(super::not_installed_error()),
        ServiceState::Running => return Ok(ServiceState::Running),
        ServiceState::Stopped => {}
    }
    run_task()?;
    state()
}

pub(super) fn stop() -> Result<ServiceState, ServiceError> {
    require_installed()?;
    if state()? == ServiceState::Running {
        let mut command = Command::new(system_executable("schtasks.exe"));
        command.args(["/End", "/TN", WINDOWS_TASK]);
        run_required(&mut command)?;
    }
    state()
}

pub(super) fn restart() -> Result<ServiceState, ServiceError> {
    require_installed()?;
    if state()? == ServiceState::Running {
        let mut command = Command::new(system_executable("schtasks.exe"));
        command.args(["/End", "/TN", WINDOWS_TASK]);
        run_required(&mut command)?;
    }
    run_task()?;
    state()
}

pub(super) fn schedule_restart_after_exit(parent_pid: u32) -> Result<(), ServiceError> {
    use std::os::windows::process::CommandExt;
    use windows_sys::Win32::System::Threading::{CREATE_NEW_PROCESS_GROUP, DETACHED_PROCESS};

    let script = "Wait-Process -Id $args[0] -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 150; schtasks.exe /Run /TN $args[1] | Out-Null";
    let mut command = Command::new(powershell_executable());
    command
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            script,
            &parent_pid.to_string(),
            WINDOWS_TASK,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    let program = command.get_program().to_string_lossy().into_owned();
    command
        .spawn()
        .map(|_| ())
        .map_err(|source| ServiceError::CommandUnavailable { program, source })
}

fn require_installed() -> Result<(), ServiceError> {
    if state()? == ServiceState::NotInstalled {
        Err(super::not_installed_error())
    } else {
        Ok(())
    }
}

fn run_task() -> Result<(), ServiceError> {
    let mut command = Command::new(system_executable("schtasks.exe"));
    command.args(["/Run", "/TN", WINDOWS_TASK]);
    run_required(&mut command)
}

fn task_exists() -> Result<bool, ServiceError> {
    let mut command = Command::new(system_executable("schtasks.exe"));
    command.args(["/Query", "/TN", WINDOWS_TASK]);
    run_allow_failure(&mut command)
}

fn task_running() -> Result<bool, ServiceError> {
    let script = "$task = Get-ScheduledTask -TaskName $args[0] -ErrorAction SilentlyContinue; if ($null -eq $task) { exit 3 }; if ($task.State -eq 'Running') { exit 0 }; exit 2";
    let mut command = Command::new(powershell_executable());
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        script,
        WINDOWS_TASK,
    ]);
    let program = command.get_program().to_string_lossy().into_owned();
    let status = run_status(&mut command)?;
    match status.code() {
        Some(0) => Ok(true),
        Some(2 | 3) => Ok(false),
        _ => Err(ServiceError::CommandFailed {
            program,
            code: exit_code(status),
        }),
    }
}

fn command_line(arguments: &[OsString]) -> Result<String, ServiceError> {
    arguments
        .iter()
        .map(|argument| {
            argument
                .to_str()
                .ok_or_else(|| ServiceError::NonUnicodePath(PathBuf::from(argument)))
                .and_then(|argument| {
                    validate_value(argument)?;
                    Ok(quote(argument))
                })
        })
        .collect::<Result<Vec<_>, _>>()
        .map(|arguments| arguments.join(" "))
}

fn validate_value(value: &str) -> Result<(), ServiceError> {
    if value.chars().any(char::is_control) {
        Err(ServiceError::InvalidValue("command"))
    } else {
        Ok(())
    }
}

fn quote(value: &str) -> String {
    let mut output = String::with_capacity(value.len() + 2);
    output.push('"');
    let mut backslashes = 0;
    for character in value.chars() {
        match character {
            '\\' => backslashes += 1,
            '"' => {
                output.extend(std::iter::repeat_n('\\', backslashes * 2 + 1));
                output.push('"');
                backslashes = 0;
            }
            _ => {
                output.extend(std::iter::repeat_n('\\', backslashes));
                output.push(character);
                backslashes = 0;
            }
        }
    }
    output.extend(std::iter::repeat_n('\\', backslashes * 2));
    output.push('"');
    output
}

fn system_executable(name: &str) -> PathBuf {
    trimmed_environment("SystemRoot")
        .map(PathBuf::from)
        .map(|root| root.join("System32").join(name))
        .unwrap_or_else(|| PathBuf::from(name))
}

fn powershell_executable() -> PathBuf {
    trimmed_environment("SystemRoot")
        .map(PathBuf::from)
        .map(|root| {
            root.join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe")
        })
        .unwrap_or_else(|| PathBuf::from("powershell.exe"))
}

fn trimmed_environment(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

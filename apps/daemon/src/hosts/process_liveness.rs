pub(crate) fn is_process_running(pid: u32) -> bool {
    platform_process_running(pid)
}

pub(crate) fn matches_dev_supervisor(
    pid: u32,
    birth_identity: &str,
    ownership_token: Option<&str>,
) -> bool {
    if !is_process_running(pid) || !platform_birth_identity_matches(pid, birth_identity) {
        return false;
    }
    ownership_token.is_none_or(|token| platform_command_contains(pid, token))
}

#[cfg(unix)]
fn platform_process_running(pid: u32) -> bool {
    use nix::errno::Errno;
    use nix::sys::signal::kill;
    use nix::unistd::Pid;

    let Ok(pid) = i32::try_from(pid) else {
        return false;
    };
    if pid <= 0 {
        return false;
    }
    matches!(kill(Pid::from_raw(pid), None), Ok(()) | Err(Errno::EPERM))
}

#[cfg(target_os = "linux")]
fn platform_birth_identity_matches(pid: u32, expected: &str) -> bool {
    use std::path::Path;

    let proc_root = Path::new("/proc");
    let Ok(boot_id) = std::fs::read_to_string(
        proc_root
            .join("sys")
            .join("kernel")
            .join("random")
            .join("boot_id"),
    ) else {
        return false;
    };
    let Ok(stat) = std::fs::read_to_string(proc_root.join(pid.to_string()).join("stat")) else {
        return false;
    };
    let Some(command_end) = stat.rfind(')') else {
        return false;
    };
    let Some(start_ticks) = stat[command_end + 1..].split_whitespace().nth(19) else {
        return false;
    };
    expected == format!("{}:{start_ticks}", boot_id.trim())
}

#[cfg(all(unix, not(target_os = "linux")))]
fn platform_birth_identity_matches(pid: u32, expected: &str) -> bool {
    inspect_process(pid, |process| process.start_time().to_string() == expected)
}

#[cfg(unix)]
fn platform_command_contains(pid: u32, token: &str) -> bool {
    inspect_process(pid, |process| {
        process
            .cmd()
            .iter()
            .any(|argument| argument.to_string_lossy().contains(token))
            || process.name().to_string_lossy().contains(token)
    })
}

#[cfg(unix)]
fn inspect_process(pid: u32, inspect: impl FnOnce(&sysinfo::Process) -> bool) -> bool {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

    let pid = Pid::from_u32(pid);
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::everything().without_tasks(),
    );
    system.process(pid).is_some_and(inspect)
}

#[cfg(windows)]
fn platform_process_running(pid: u32) -> bool {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

    if pid == 0 {
        return false;
    }
    let pid = Pid::from_u32(pid);
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::nothing().without_tasks(),
    );
    system.process(pid).is_some()
}

#[cfg(windows)]
fn platform_birth_identity_matches(pid: u32, expected: &str) -> bool {
    let script = "$process = Get-Process -Id $args[0] -ErrorAction SilentlyContinue; if ($null -eq $process) { exit 3 }; [Console]::Out.Write($process.StartTime.ToUniversalTime().Ticks)";
    powershell_process_value(script, pid).is_some_and(|value| value == expected)
}

#[cfg(windows)]
fn platform_command_contains(pid: u32, token: &str) -> bool {
    let script = "$process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $args[0]) -ErrorAction SilentlyContinue; if ($null -eq $process) { exit 3 }; [Console]::Out.Write($process.CommandLine)";
    powershell_process_value(script, pid).is_some_and(|value| value.contains(token))
}

#[cfg(windows)]
fn powershell_process_value(script: &str, pid: u32) -> Option<String> {
    use std::path::PathBuf;
    use std::process::Command;

    let executable = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .map(|root| {
            root.join("System32")
                .join("WindowsPowerShell")
                .join("v1.0")
                .join("powershell.exe")
        })
        .unwrap_or_else(|| PathBuf::from("powershell.exe"));
    let pid_text = pid.to_string();
    let output = Command::new(executable)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
            &pid_text,
        ])
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .filter(|value| !value.is_empty())
}

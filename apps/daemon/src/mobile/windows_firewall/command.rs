#[cfg(windows)]
use std::process::{Command, Stdio};

use crate::hosts::{ExecutionHost, HostCommand, LocalHost};

pub(super) async fn run_powershell(script: String, timeout_ms: u64) -> Result<String, ()> {
    let mut command = HostCommand::new(
        powershell_path(),
        [
            "-NoProfile".to_owned(),
            "-NonInteractive".to_owned(),
            "-EncodedCommand".to_owned(),
            super::scripts::encode(&script),
        ],
    );
    command.timeout_ms = Some(timeout_ms);
    let output = LocalHost::new().exec(command).await.map_err(|_| ())?;
    if output.exit_code != 0 {
        return Err(());
    }
    Ok(output.stdout)
}

pub(super) fn powershell_path() -> String {
    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_owned());
    std::path::Path::new(&system_root)
        .join("System32")
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe")
        .to_string_lossy()
        .into_owned()
}

#[cfg(windows)]
pub(super) fn open_network_settings() -> bool {
    use std::os::windows::process::CommandExt;
    use windows_sys::Win32::System::Threading::{CREATE_NEW_PROCESS_GROUP, DETACHED_PROCESS};

    Command::new("explorer.exe")
        .arg("ms-settings:network")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
        .spawn()
        .is_ok()
}

#[cfg(not(windows))]
pub(super) fn open_network_settings() -> bool {
    false
}

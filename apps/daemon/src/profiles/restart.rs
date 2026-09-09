use std::process::{Command, Stdio};

use thiserror::Error;

use crate::entry::RESTART_PARENT_ENV;

#[derive(Debug, Error)]
pub(crate) enum RestartError {
    #[error("daemon restart executable lookup failed: {0}")]
    Executable(#[source] std::io::Error),
    #[error("daemon replacement launch failed: {0}")]
    Launch(#[source] std::io::Error),
}

pub(crate) fn request() -> Result<(), RestartError> {
    let executable = std::env::current_exe().map_err(RestartError::Executable)?;
    Command::new(executable)
        .args(std::env::args_os().skip(1))
        .env(RESTART_PARENT_ENV, std::process::id().to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(RestartError::Launch)?;
    tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        terminate_for_restart();
    });
    Ok(())
}

#[cfg(unix)]
fn terminate_for_restart() {
    let _ = nix::sys::signal::kill(
        nix::unistd::Pid::from_raw(std::process::id() as i32),
        nix::sys::signal::Signal::SIGHUP,
    );
}

#[cfg(not(unix))]
fn terminate_for_restart() {
    std::process::exit(75);
}

use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::Duration;

use tokio::sync::watch;

use super::UpdateError;
#[cfg(target_os = "windows")]
use crate::entry::schedule_restart_after_exit;
use crate::entry::{
    RESTART_PARENT_ENV, ServiceState, daemon_service_state, restart_daemon_service,
};

// Why: a process-local signal preserves graceful runtime flushing on Windows, where SIGHUP is
// unavailable, while the external supervisor still observes the final restart exit code.
static RUNTIME_RESTART: OnceLock<watch::Sender<bool>> = OnceLock::new();

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RestartMode {
    ManagedService,
    Replacement,
}

pub(crate) fn runtime_mode(user_data_path: &Path) -> RestartMode {
    let is_default = crate::paths::resolve_default_user_data_path()
        .ok()
        .is_some_and(|default| paths_equal(&default, user_data_path));
    if is_default && daemon_service_state().is_ok_and(|state| state == ServiceState::Running) {
        RestartMode::ManagedService
    } else {
        RestartMode::Replacement
    }
}

pub(crate) fn request_runtime_restart(mode: RestartMode) -> Result<(), UpdateError> {
    match mode {
        RestartMode::ManagedService => {
            #[cfg(target_os = "windows")]
            schedule_restart_after_exit(std::process::id())
                .map_err(|error| UpdateError::Service(error.to_string()))?;
        }
        RestartMode::Replacement => launch_replacement()?,
    }
    let restart = runtime_restart().clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(150)).await;
        restart.send_replace(true);
    });
    Ok(())
}

pub(crate) fn subscribe_runtime_restart() -> watch::Receiver<bool> {
    runtime_restart().subscribe()
}

pub(crate) async fn wait_for_runtime_restart(restart: &mut watch::Receiver<bool>) {
    if *restart.borrow() {
        return;
    }
    while restart.changed().await.is_ok() {
        if *restart.borrow_and_update() {
            return;
        }
    }
}

pub(crate) fn restart_installed_service() -> Result<bool, UpdateError> {
    if daemon_service_state().map_err(|error| UpdateError::Service(error.to_string()))?
        != ServiceState::Running
    {
        return Ok(false);
    }
    restart_daemon_service().map_err(|error| UpdateError::Service(error.to_string()))?;
    Ok(true)
}

fn launch_replacement() -> Result<(), UpdateError> {
    let executable = std::env::current_exe().map_err(UpdateError::Io)?;
    Command::new(executable)
        .args(std::env::args_os().skip(1))
        .env(RESTART_PARENT_ENV, std::process::id().to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(UpdateError::ReplacementLaunch)?;
    Ok(())
}

fn paths_equal(left: &Path, right: &Path) -> bool {
    let left = std::fs::canonicalize(left).unwrap_or_else(|_| left.to_owned());
    let right = std::fs::canonicalize(right).unwrap_or_else(|_| right.to_owned());
    left == right
}

fn runtime_restart() -> &'static watch::Sender<bool> {
    RUNTIME_RESTART.get_or_init(|| watch::channel(false).0)
}

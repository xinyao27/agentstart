use std::ffi::OsString;
use std::time::{Duration, Instant};

use thiserror::Error;

use crate::process_liveness::is_process_running;

const RESTART_PARENT_TIMEOUT: Duration = Duration::from_secs(30);
const RESTART_POLL_INTERVAL: Duration = Duration::from_millis(50);

#[derive(Debug, Error)]
pub(super) enum RestartParentError {
    #[error("daemon_restart_parent_invalid")]
    Invalid,
    #[error("daemon_restart_parent_timeout")]
    Timeout,
}

pub(super) async fn wait(raw_pid: Option<OsString>) -> Result<(), RestartParentError> {
    let Some(raw_pid) = raw_pid else {
        return Ok(());
    };
    let parent_pid = raw_pid
        .to_str()
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|pid| *pid > 0 && *pid != std::process::id())
        .ok_or(RestartParentError::Invalid)?;
    let deadline = Instant::now() + RESTART_PARENT_TIMEOUT;
    while is_process_running(parent_pid) {
        if Instant::now() >= deadline {
            return Err(RestartParentError::Timeout);
        }
        tokio::time::sleep(RESTART_POLL_INTERVAL).await;
    }
    Ok(())
}

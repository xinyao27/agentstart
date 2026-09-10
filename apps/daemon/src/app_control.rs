use std::io::Write;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::time::Instant;

use thiserror::Error;

use crate::update::restart::{RestartMode, request_runtime_restart, runtime_mode};

const STARTUP_DIAGNOSTICS_ENV: &str = "AGENTSTART_STARTUP_DIAGNOSTICS";
const MAX_STARTUP_EVENT_BYTES: usize = 96;
const MAX_STARTUP_DIAGNOSTICS: u32 = 128;

#[derive(Clone)]
pub(crate) struct AppControlAuthority {
    state: Arc<AppControlState>,
}

struct AppControlState {
    is_restart_pending: AtomicBool,
    restart_mode: RestartMode,
    started_at: Instant,
    startup_diagnostic_count: AtomicU32,
    startup_diagnostics_enabled: bool,
}

pub(crate) struct PendingAppRestart {
    state: Arc<AppControlState>,
    restart_mode: Option<RestartMode>,
}

#[derive(Debug, Error)]
pub(crate) enum AppControlError {
    #[error("app_restart_already_pending")]
    RestartAlreadyPending,
    #[error("startup_diagnostic_event_invalid")]
    InvalidStartupDiagnosticEvent,
    #[error("startup_diagnostic_write_failed")]
    StartupDiagnosticWrite,
}

impl AppControlAuthority {
    pub(crate) fn new(user_data_path: &Path) -> Self {
        Self {
            state: Arc::new(AppControlState {
                is_restart_pending: AtomicBool::new(false),
                restart_mode: runtime_mode(user_data_path),
                started_at: Instant::now(),
                startup_diagnostic_count: AtomicU32::new(0),
                startup_diagnostics_enabled: std::env::var_os(STARTUP_DIAGNOSTICS_ENV)
                    .is_some_and(|value| value == "1"),
            }),
        }
    }

    pub(crate) fn begin_restart(&self) -> Result<PendingAppRestart, AppControlError> {
        self.state
            .is_restart_pending
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| AppControlError::RestartAlreadyPending)?;
        Ok(PendingAppRestart {
            state: self.state.clone(),
            restart_mode: Some(self.state.restart_mode),
        })
    }

    pub(crate) fn record_startup_diagnostic(
        &self,
        event: &str,
        renderer_elapsed_ms: Option<u32>,
        duration_ms: Option<u32>,
    ) -> Result<bool, AppControlError> {
        if !is_valid_startup_event(event) {
            return Err(AppControlError::InvalidStartupDiagnosticEvent);
        }
        if !self.state.startup_diagnostics_enabled {
            return Ok(false);
        }
        if self
            .state
            .startup_diagnostic_count
            .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |count| {
                (count < MAX_STARTUP_DIAGNOSTICS).then_some(count + 1)
            })
            .is_err()
        {
            return Ok(false);
        }
        let stderr = std::io::stderr();
        let mut sink = stderr.lock();
        let daemon_elapsed_ms = self.state.started_at.elapsed().as_millis();
        write!(sink, "[startup] {event} t={daemon_elapsed_ms}")
            .and_then(|()| {
                if let Some(value) = renderer_elapsed_ms {
                    write!(sink, " rendererT={value}")?;
                }
                if let Some(value) = duration_ms {
                    write!(sink, " durationMs={value}")?;
                }
                writeln!(sink)
            })
            .map_err(|_| AppControlError::StartupDiagnosticWrite)?;
        Ok(true)
    }
}

impl PendingAppRestart {
    pub(crate) fn confirm(mut self) {
        let Some(mode) = self.restart_mode.take() else {
            return;
        };
        if let Err(error) = request_runtime_restart(mode) {
            self.state
                .is_restart_pending
                .store(false, Ordering::Release);
            eprintln!("[daemon] App restart failed after response delivery: {error}");
        }
    }
}

impl Drop for PendingAppRestart {
    fn drop(&mut self) {
        if self.restart_mode.is_some() {
            self.state
                .is_restart_pending
                .store(false, Ordering::Release);
        }
    }
}

fn is_valid_startup_event(event: &str) -> bool {
    event.starts_with("renderer-")
        && event.len() <= MAX_STARTUP_EVENT_BYTES
        && event
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b':'))
}

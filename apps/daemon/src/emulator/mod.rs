mod actions;
mod devices;
#[path = "serve-sim.rs"]
mod serve_sim;
mod sessions;
mod stream;

use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;
use thiserror::Error;
use tokio::sync::Mutex;

use crate::settings::SettingsAuthority;
use crate::worktrees::WorktreeCatalog;

pub(crate) use actions::{GesturePoint, GesturePointKind};
pub(crate) use devices::DeviceRecord;
use serve_sim::ServeSim;
pub(crate) use stream::{extract_frames, stream_url};

#[derive(Clone)]
pub(crate) struct EmulatorAuthority {
    http: reqwest::Client,
    serve_sim: ServeSim,
    settings: SettingsAuthority,
    state: Arc<Mutex<EmulatorState>>,
    worktrees: WorktreeCatalog,
}

#[derive(Default)]
struct EmulatorState {
    active_by_worktree: HashMap<String, String>,
    sessions: HashMap<String, EmulatorSession>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EmulatorSession {
    pub(crate) device_udid: String,
    pub(crate) ws_url: String,
    pub(crate) stream_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) ax_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "helperPid")]
    pub(crate) pid: Option<u32>,
    #[serde(skip)]
    managed: bool,
}

/// Availability summary shared by the legacy JSON `emulator.availability`
/// reply and `EmulatorService.Availability`, so platform gating and the
/// simctl/serve-sim health checks live in exactly one place.
pub(crate) struct Availability {
    pub(crate) platform: &'static str,
    pub(crate) available: bool,
    pub(crate) devices: Vec<DeviceRecord>,
    pub(crate) simctl_ok: bool,
    pub(crate) simctl_message: Option<String>,
    pub(crate) serve_sim_ok: bool,
    pub(crate) serve_sim_message: Option<String>,
    pub(crate) message: String,
}

#[derive(Debug, Error)]
#[error("{message}")]
pub(crate) struct EmulatorError {
    code: &'static str,
    message: String,
}

impl EmulatorError {
    pub(crate) fn domain(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub(crate) fn code(&self) -> &'static str {
        self.code
    }

    pub(crate) fn message(&self) -> &str {
        &self.message
    }
}

impl EmulatorAuthority {
    pub(crate) fn new(settings: SettingsAuthority, worktrees: WorktreeCatalog) -> Self {
        Self {
            http: reqwest::Client::new(),
            serve_sim: ServeSim::resolve(),
            settings,
            state: Arc::new(Mutex::new(EmulatorState::default())),
            worktrees,
        }
    }

    pub(crate) async fn list_sessions(&self) -> Result<Value, EmulatorError> {
        self.serve_sim.list().await
    }

    pub(crate) async fn tap(
        &self,
        x: f64,
        y: f64,
        device: Option<&str>,
        worktree: Option<&str>,
    ) -> Result<(), EmulatorError> {
        if !is_normalized(x) || !is_normalized(y) {
            return Err(EmulatorError::domain(
                "emulator_error",
                "Invalid coordinate",
            ));
        }
        let udid = self.resolve_target(device, worktree).await?;
        self.serve_sim
            .action(vec![
                "tap".to_owned(),
                x.to_string(),
                y.to_string(),
                "-d".to_owned(),
                udid,
            ])
            .await?;
        Ok(())
    }

    pub(crate) async fn list_simulators(&self) -> Result<Vec<DeviceRecord>, EmulatorError> {
        devices::list().await
    }

    pub(crate) async fn availability(&self) -> Availability {
        if !cfg!(target_os = "macos") {
            return Availability {
                platform: platform(),
                available: false,
                devices: Vec::new(),
                simctl_ok: false,
                simctl_message: None,
                serve_sim_ok: false,
                serve_sim_message: None,
                message: "iOS Simulator requires macOS.".to_owned(),
            };
        }
        let (devices_result, serve_sim_result) =
            tokio::join!(devices::list(), self.serve_sim.check());
        let (devices, simctl_ok, simctl_message) = match devices_result {
            Ok(devices) if devices.is_empty() => (
                devices,
                false,
                Some("No iOS simulators found. Add one in Xcode Settings > Platforms.".to_owned()),
            ),
            Ok(devices) => (devices, true, None),
            Err(error) => (Vec::new(), false, Some(error.to_string())),
        };
        let (serve_sim_ok, serve_sim_message) = match serve_sim_result {
            Ok(()) => (true, None),
            Err(error) => (false, Some(error.to_string())),
        };
        let available = simctl_ok && serve_sim_ok && !devices.is_empty();
        let message = if available {
            "Ready".to_owned()
        } else {
            simctl_message
                .clone()
                .or_else(|| serve_sim_message.clone())
                .unwrap_or_else(|| "iOS Simulator is not available.".to_owned())
        };
        Availability {
            platform: platform(),
            available,
            devices,
            simctl_ok,
            simctl_message,
            serve_sim_ok,
            serve_sim_message,
            message,
        }
    }

    pub(crate) async fn unregister_active(
        &self,
        worktree: Option<&str>,
    ) -> Result<(), EmulatorError> {
        if let Some(worktree_id) = self.resolve_worktree(worktree).await? {
            self.state
                .lock()
                .await
                .active_by_worktree
                .remove(&worktree_id);
        }
        Ok(())
    }
}

fn is_normalized(value: f64) -> bool {
    value.is_finite() && (0.0..=1.0).contains(&value)
}

const fn platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

use serde_json::Value;
use tokio::time::{Duration, sleep};

use super::{EmulatorAuthority, EmulatorError, EmulatorSession, devices};

pub(crate) struct AttachOutcome {
    pub(crate) attached: bool,
    pub(crate) info: EmulatorSession,
}

pub(crate) struct StopOutcome {
    pub(crate) device_udid: Option<String>,
}

impl EmulatorAuthority {
    pub(crate) async fn attach(
        &self,
        worktree: Option<&str>,
        device: Option<&str>,
    ) -> Result<AttachOutcome, EmulatorError> {
        if self
            .settings
            .get()
            .get("mobileEmulatorEnabled")
            .and_then(Value::as_bool)
            == Some(false)
        {
            return Err(EmulatorError::domain(
                "emulator_disabled",
                "Mobile Emulator is disabled in Settings.",
            ));
        }
        let worktree_id = self.resolve_worktree(worktree).await?;
        let settings = self.settings.get();
        let requested = device.map(str::to_owned).or_else(|| {
            settings
                .get("mobileEmulatorDefaultDeviceUdid")
                .and_then(Value::as_str)
                .map(str::to_owned)
        });
        let selected = match requested {
            Some(device) => device,
            None => devices::default_device(&devices::list().await?).ok_or_else(|| {
                EmulatorError::domain(
                    "emulator_device_not_found",
                    "No emulator device specified. Choose a default device in Settings > Mobile Emulator or pass a device.",
                )
            })?,
        };
        let udid = devices::resolve(&selected).await?;
        if let Some(worktree_id) = worktree_id.as_deref()
            && let Some(active) = self.active_for(worktree_id).await
        {
            if active.device_udid == udid && self.session_reusable(&active).await {
                return Ok(AttachOutcome {
                    attached: true,
                    info: active,
                });
            }
            self.stop_worktree(worktree_id, true, false).await?;
        }
        let info = self.start_session(&udid).await?;
        if let Some(worktree_id) = worktree_id {
            let mut managed = info.clone();
            managed.managed = true;
            let mut state = self.state.lock().await;
            state
                .active_by_worktree
                .insert(worktree_id.clone(), udid.clone());
            state.sessions.insert(udid, managed.clone());
            drop(state);
        } else {
            self.state.lock().await.sessions.insert(udid, info.clone());
        }
        Ok(AttachOutcome {
            attached: true,
            info,
        })
    }

    async fn start_session(&self, udid: &str) -> Result<EmulatorSession, EmulatorError> {
        devices::ensure_booted(udid).await?;
        for attempt in 0..2 {
            let raw = self.serve_sim.start(udid).await?;
            let info = parse_session(raw, udid).await?;
            if self.session_reusable(&info).await {
                return Ok(info);
            }
            self.stop_helper(&info.device_udid, info.pid).await;
            if attempt == 0 {
                sleep(Duration::from_millis(250)).await;
            }
        }
        Err(EmulatorError::domain(
            "emulator_helper_failed",
            "serve-sim started but its stream endpoint is not reachable.",
        ))
    }

    async fn session_reusable(&self, info: &EmulatorSession) -> bool {
        if info
            .pid
            .is_some_and(|pid| !crate::process_liveness::is_process_running(pid))
        {
            return false;
        }
        tokio::time::timeout(
            Duration::from_secs(10),
            self.http
                .get(&info.stream_url)
                .header("accept", "application/octet-stream, image/jpeg")
                .send(),
        )
        .await
        .is_ok_and(|result| result.is_ok_and(|response| response.status().is_success()))
    }

    pub(super) async fn resolve_worktree(
        &self,
        worktree: Option<&str>,
    ) -> Result<Option<String>, EmulatorError> {
        let Some(selector) = worktree else {
            return Ok(None);
        };
        let worktree = self
            .worktrees
            .resolve_managed(selector)
            .await
            .map_err(|error| {
                EmulatorError::domain(
                    "emulator_error",
                    format!("Could not resolve worktree: {error}"),
                )
            })?;
        if worktree.host_id != "local" {
            return Err(EmulatorError::domain(
                "emulator_unsupported",
                "iOS Simulator automation is available only on the daemon's local macOS host.",
            ));
        }
        Ok(Some(worktree.id))
    }

    pub(super) async fn resolve_target(
        &self,
        device: Option<&str>,
        worktree: Option<&str>,
    ) -> Result<String, EmulatorError> {
        if let Some(device) = device {
            return devices::resolve(device).await;
        }
        if let Some(worktree_id) = self.resolve_worktree(worktree).await?
            && let Some(active) = self.active_for(&worktree_id).await
        {
            return Ok(active.device_udid);
        }
        Err(EmulatorError::domain(
            "emulator_no_active",
            "No active emulator for this worktree — use yiru emulator attach or open the pane",
        ))
    }

    async fn active_for(&self, worktree_id: &str) -> Option<EmulatorSession> {
        let state = self.state.lock().await;
        let key = state.active_by_worktree.get(worktree_id)?;
        state.sessions.get(key).cloned()
    }

    pub(crate) async fn stop(
        &self,
        worktree: Option<&str>,
        device: Option<&str>,
        managed_only: bool,
        shutdown: bool,
    ) -> Result<StopOutcome, EmulatorError> {
        let worktree_id = self.resolve_worktree(worktree).await?;
        if shutdown && managed_only && worktree_id.is_some() && device.is_none() {
            let udid = self
                .stop_worktree(worktree_id.as_deref().unwrap_or_default(), true, true)
                .await?;
            return Ok(StopOutcome { device_udid: udid });
        }
        let udid = self.resolve_target(device, worktree).await?;
        let pid = self
            .state
            .lock()
            .await
            .sessions
            .get(&udid)
            .and_then(|session| session.pid);
        self.stop_helper(&udid, pid).await;
        if shutdown {
            devices::shutdown(&udid).await?;
        }
        self.clear_session(&udid).await;
        Ok(StopOutcome {
            device_udid: Some(udid),
        })
    }

    async fn stop_worktree(
        &self,
        worktree_id: &str,
        shutdown: bool,
        managed_only: bool,
    ) -> Result<Option<String>, EmulatorError> {
        let session = {
            let mut state = self.state.lock().await;
            let Some(key) = state.active_by_worktree.remove(worktree_id) else {
                return Ok(None);
            };
            state.sessions.get(&key).cloned()
        };
        let Some(session) = session else {
            return Ok(None);
        };
        if managed_only && !session.managed {
            return Ok(None);
        }
        self.stop_helper(&session.device_udid, session.pid).await;
        if shutdown {
            let _ = devices::shutdown(&session.device_udid).await;
        }
        self.clear_session(&session.device_udid).await;
        Ok(Some(session.device_udid))
    }

    async fn stop_helper(&self, udid: &str, pid: Option<u32>) {
        self.serve_sim.kill(udid).await;
        if let Some(pid) = pid {
            let _ = tokio::process::Command::new("/bin/kill")
                .arg("-TERM")
                .arg(pid.to_string())
                .status()
                .await;
        }
    }

    async fn clear_session(&self, udid: &str) {
        let mut state = self.state.lock().await;
        state.sessions.remove(udid);
        state
            .active_by_worktree
            .retain(|_, active_udid| active_udid != udid);
    }

    pub(crate) async fn shutdown_all(&self) {
        let sessions: Vec<_> = self
            .state
            .lock()
            .await
            .sessions
            .values()
            .filter(|session| session.managed)
            .cloned()
            .collect();
        for session in sessions {
            self.stop_helper(&session.device_udid, session.pid).await;
            let _ = devices::shutdown(&session.device_udid).await;
        }
        let mut state = self.state.lock().await;
        state.sessions.clear();
        state.active_by_worktree.clear();
    }
}

async fn parse_session(raw: Value, fallback_udid: &str) -> Result<EmulatorSession, EmulatorError> {
    let object = raw.as_object().ok_or_else(|| {
        EmulatorError::domain(
            "emulator_helper_failed",
            "serve-sim did not return stream endpoints.",
        )
    })?;
    let device_udid = object
        .get("device")
        .and_then(Value::as_str)
        .unwrap_or(fallback_udid)
        .to_owned();
    let ws_url = object
        .get("wsUrl")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let stream_url = object
        .get("streamUrl")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| {
            object.get("url").and_then(Value::as_str).map(|url| {
                if url.ends_with("/stream.mjpeg") {
                    url.to_owned()
                } else {
                    format!("{}/stream.mjpeg", url.trim_end_matches('/'))
                }
            })
        })
        .unwrap_or_default();
    if ws_url.is_empty() || stream_url.is_empty() {
        return Err(EmulatorError::domain(
            "emulator_helper_failed",
            "serve-sim did not return stream endpoints.",
        ));
    }
    Ok(EmulatorSession {
        pid: read_helper_pid(&device_udid).await,
        device_udid,
        ws_url,
        stream_url,
        ax_url: object
            .get("axUrl")
            .and_then(Value::as_str)
            .map(str::to_owned),
        managed: false,
    })
}

async fn read_helper_pid(udid: &str) -> Option<u32> {
    let path = std::env::temp_dir()
        .join("serve-sim")
        .join(format!("server-{udid}.json"));
    let bytes = tokio::fs::read(path).await.ok()?;
    serde_json::from_slice::<Value>(&bytes)
        .ok()?
        .get("pid")?
        .as_u64()
        .and_then(|pid| u32::try_from(pid).ok())
}

use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde_json::Value;
use tokio::sync::broadcast;
use tokio::sync::{mpsc, oneshot, watch};

use crate::account_usage::{CodexRuntimeHome, StatsAuthority};
use crate::diagnostics::{DiagnosticsTrace, TraceSpan};
use crate::host_registry::HostRegistry;
use crate::settings::SettingsAuthority;
use crate::shell_services::ShellServicesRegistry;
use crate::terminal_scrollback::TerminalScrollbackSnapshots;
use crate::workspace_ports::WorkspacePortsRegistry;
use crate::workspace_session::{PtyScrollback, WorkspaceSessionAuthority};
use crate::worktrees::WorktreeCatalog;

use super::TerminalSessionError;
use super::agent_activity::AgentActivity;
use super::auto_restore_fit::AutoRestoreFit;
use super::model::TerminalStreamSubscription;
use super::multiplex_admission::TerminalMultiplexAdmission;
use super::process::{ProcessEvent, TerminalEvent};
use super::state::{TerminalState, TerminalViewerDeparture};

const EVENT_QUEUE_DEPTH: usize = 512;

#[derive(Clone)]
pub(crate) struct TerminalSessionAuthority {
    pub(super) auto_restore_fit: AutoRestoreFit,
    pub(super) worktree_gate: super::worktree_gate::WorktreeGate,
    pub(super) codex_runtime: CodexRuntimeHome,
    pub(super) diagnostics: DiagnosticsTrace,
    pub(super) events: mpsc::Sender<TerminalEvent>,
    pub(super) driver_events: broadcast::Sender<serde_json::Value>,
    pub(super) hosts: HostRegistry,
    pub(super) multiplex: TerminalMultiplexAdmission,
    pub(super) revision: watch::Sender<u64>,
    pub(super) shells: ShellServicesRegistry,
    pub(super) settings: SettingsAuthority,
    pub(super) snapshots: TerminalScrollbackSnapshots,
    pub(super) state: Arc<TerminalState>,
    pub(super) agent_hook_environment: Arc<Mutex<Vec<(String, String)>>>,
    view_attributes: Arc<Mutex<Option<Value>>>,
    event_loop: Arc<EventLoop>,
    stats: Arc<OnceLock<StatsAuthority>>,
    pub(super) workspace_session: WorkspaceSessionAuthority,
    pub(super) workspace_ports: WorkspacePortsRegistry,
    pub(super) worktrees: WorktreeCatalog,
}

pub(crate) struct TerminalRuntimeContext {
    pub(crate) codex_runtime: CodexRuntimeHome,
    pub(crate) diagnostics: DiagnosticsTrace,
    pub(crate) settings: SettingsAuthority,
}

struct EventLoop {
    completed: Mutex<Option<oneshot::Receiver<()>>>,
    shutdown: watch::Sender<bool>,
}

struct EventTerminalState {
    stats: Arc<OnceLock<StatsAuthority>>,
    auto_restore_fit: AutoRestoreFit,
    sessions: Arc<TerminalState>,
}

impl TerminalSessionAuthority {
    pub(crate) fn agent_bindings(&self) -> Vec<Value> {
        self.state.agent_bindings()
    }

    pub(crate) fn multiplex(&self) -> &TerminalMultiplexAdmission {
        &self.multiplex
    }

    pub(crate) fn start_trace_span(
        &self,
        name: &'static str,
        attributes: serde_json::Map<String, Value>,
    ) -> TraceSpan {
        self.diagnostics.start_span(name, attributes)
    }

    pub(crate) fn diagnostics_trace(&self) -> DiagnosticsTrace {
        self.diagnostics.clone()
    }

    pub(crate) fn subscribe(
        &self,
        handle: &str,
        last_sequence: u64,
    ) -> Result<TerminalStreamSubscription, TerminalSessionError> {
        self.state
            .subscribe(handle, last_sequence)
            .ok_or(TerminalSessionError::NotFound)
    }

    pub(crate) fn register_viewer(
        &self,
        handle: &str,
        client: super::model::TerminalClient,
    ) -> bool {
        let is_mobile = client.kind == super::model::TerminalClientType::Mobile;
        let registered = self.state.register_viewer(handle, client);
        if registered && is_mobile {
            self.auto_restore_fit.cancel(handle);
        }
        registered
    }

    pub(crate) fn unregister_viewer(&self, handle: &str, client_id: &str) {
        let (departure, driver_changed) = self.state.unregister_viewer(handle, client_id);
        if driver_changed {
            self.publish_driver(handle);
        }
        match departure {
            TerminalViewerDeparture::None => {}
            TerminalViewerDeparture::RestoreImmediately => {
                let authority = self.clone();
                let handle = handle.to_owned();
                let client_id = client_id.to_owned();
                tokio::spawn(async move {
                    let _ = authority.restore_fit(&handle, &client_id).await;
                });
            }
            TerminalViewerDeparture::RestoreMobileAfterDelay => {
                let Some(milliseconds) = self.settings.mobile_auto_restore_fit_ms() else {
                    return;
                };
                self.auto_restore_fit.schedule(
                    self.clone(),
                    handle.to_owned(),
                    client_id.to_owned(),
                    Duration::from_secs_f64(milliseconds / 1000.0),
                );
                if self.state.has_mobile_viewer(handle) {
                    self.auto_restore_fit.cancel(handle);
                }
            }
        }
    }

    pub(crate) fn new(
        user_data_path: &Path,
        worktrees: WorktreeCatalog,
        hosts: HostRegistry,
        workspace_session: WorkspaceSessionAuthority,
        workspace_ports: WorkspacePortsRegistry,
        shells: ShellServicesRegistry,
        runtime: TerminalRuntimeContext,
    ) -> Self {
        let state = Arc::new(TerminalState::new());
        let snapshots = TerminalScrollbackSnapshots::for_profile(user_data_path);
        let (events, receiver) = mpsc::channel(EVENT_QUEUE_DEPTH);
        let (revision, _) = watch::channel(0_u64);
        let (driver_events, _) = broadcast::channel(64);
        let (shutdown, shutdown_receiver) = watch::channel(false);
        let (completed, completion) = oneshot::channel();
        let event_loop = Arc::new(EventLoop {
            completed: Mutex::new(Some(completion)),
            shutdown,
        });
        let stats = Arc::new(OnceLock::new());
        let event_stats = stats.clone();
        let event_revision = revision.clone();
        let auto_restore_fit = AutoRestoreFit::default();
        let event_auto_restore_fit = auto_restore_fit.clone();
        let event_snapshots = snapshots.clone();
        let event_state = state.clone();
        let event_workspace_session = workspace_session.clone();
        let event_workspace_ports = workspace_ports.clone();
        tokio::spawn(async move {
            run_events(
                EventTerminalState {
                    stats: event_stats,
                    auto_restore_fit: event_auto_restore_fit,
                    sessions: event_state,
                },
                event_snapshots,
                event_workspace_session,
                event_workspace_ports,
                event_revision,
                receiver,
                shutdown_receiver,
            )
            .await;
            let _ = completed.send(());
        });
        Self {
            auto_restore_fit,
            worktree_gate: super::worktree_gate::WorktreeGate::default(),
            codex_runtime: runtime.codex_runtime,
            diagnostics: runtime.diagnostics.clone(),
            events,
            driver_events,
            event_loop,
            stats,
            hosts,
            multiplex: TerminalMultiplexAdmission::new(runtime.diagnostics),
            revision,
            shells,
            settings: runtime.settings,
            snapshots,
            state,
            agent_hook_environment: Arc::new(Mutex::new(Vec::new())),
            view_attributes: Arc::new(Mutex::new(None)),
            worktrees,
            workspace_session,
            workspace_ports,
        }
    }

    pub(crate) fn configure_stats(&self, stats: StatsAuthority) {
        let _ = self.stats.set(stats);
    }

    pub(crate) fn update_view_attributes(&self, attributes: Value) {
        *self
            .view_attributes
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(attributes);
    }

    pub(crate) fn set_agent_hook_environment(&self, environment: Vec<(String, String)>) {
        *self
            .agent_hook_environment
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = environment;
    }

    pub(crate) fn subscribe_driver_events(&self) -> broadcast::Receiver<serde_json::Value> {
        self.driver_events.subscribe()
    }

    pub(crate) async fn send(
        &self,
        handle: &str,
        text: Option<String>,
        enter: bool,
        interrupt: bool,
    ) -> Result<usize, TerminalSessionError> {
        let control = self
            .state
            .with(handle, |record| {
                record
                    .exit
                    .borrow()
                    .is_none()
                    .then(|| record.control.clone())
                    .flatten()
            })
            .flatten()
            .ok_or(TerminalSessionError::NotWritable)?;
        let text = text.unwrap_or_default();
        if text.is_empty() && !enter && !interrupt {
            return Err(TerminalSessionError::InvalidInput("empty terminal input"));
        }
        let mut bytes_written = text.len();
        let mut suffix = Vec::with_capacity(2);
        if enter {
            suffix.push(b'\r');
        }
        if interrupt {
            suffix.push(3);
        }
        let delay_before_suffix = !text.is_empty() && !suffix.is_empty();
        bytes_written += suffix.len();
        control
            .write(text.into_bytes(), suffix, delay_before_suffix)
            .await?;
        Ok(bytes_written)
    }

    pub(crate) async fn close(&self, handle: &str) -> Result<bool, TerminalSessionError> {
        let mut trace = self.start_trace_span("terminal.session.close", serde_json::Map::new());
        let result = self.close_inner(handle).await;
        match &result {
            Ok(was_running) => {
                trace.set_attribute("was_running", Value::Bool(*was_running));
                trace.success();
            }
            Err(_) => trace.failure("terminal close failed"),
        }
        result
    }

    async fn close_inner(&self, handle: &str) -> Result<bool, TerminalSessionError> {
        self.auto_restore_fit.cancel(handle);
        let (control, mut exit, was_running) = self
            .state
            .with_mut(handle, |record| {
                let was_running = record.process_exit_code.is_none();
                (
                    was_running.then(|| record.control.take()).flatten(),
                    record.exit.subscribe(),
                    was_running,
                )
            })
            .ok_or(TerminalSessionError::NotFound)?;
        if was_running {
            let control = control.ok_or(TerminalSessionError::NotWritable)?;
            if let Err(error) = control.kill().await {
                if self.state.is_live(handle) != Some(false) {
                    self.state.with_mut(handle, |record| {
                        if record.process_exit_code.is_none() && record.control.is_none() {
                            record.control = Some(control.clone());
                        }
                    });
                    return Err(error);
                }
                return Ok(false);
            }
        }
        if exit.borrow().is_none() {
            let _ = tokio::time::timeout(Duration::from_secs(5), exit.changed()).await;
        }
        Ok(was_running)
    }

    pub(crate) fn prune_disconnected(&self) -> usize {
        let removed = self
            .state
            .prune_disconnected(&self.workspace_session.terminal_pty_references());
        for handle in &removed {
            self.auto_restore_fit.cancel(handle);
        }
        removed.len()
    }

    pub(crate) fn forget_worktree_ports(&self, host_id: &str, worktree_id: &str) {
        self.workspace_ports.forget_worktree(host_id, worktree_id);
    }

    pub(crate) async fn clear(&self, handle: &str) -> Result<(), TerminalSessionError> {
        let snapshot_provider = self
            .state
            .with(handle, |record| record.snapshot_provider.clone())
            .ok_or(TerminalSessionError::NotFound)?;
        let (host_id, tab_id, leaf_id) = snapshot_provider
            .clear()
            .await
            .ok_or(TerminalSessionError::NotWritable)?;
        let snapshots = self.snapshots.clone();
        let snapshot_tab_id = tab_id.clone();
        let snapshot_leaf_id = leaf_id.clone();
        tokio::task::spawn_blocking(move || {
            snapshots.delete_for_blocking(&snapshot_tab_id, &snapshot_leaf_id);
        })
        .await?;
        self.workspace_session
            .clear_pty_scrollback(host_id.as_deref(), &tab_id, &leaf_id)
            .await?;
        Ok(())
    }

    pub(crate) async fn shutdown(&self) {
        self.auto_restore_fit.cancel_all();
        let active = self.state.active();
        let mut tasks = tokio::task::JoinSet::new();
        for (control, mut exit) in active {
            tasks.spawn(async move {
                if let Some(control) = control {
                    let _ = control.kill().await;
                }
                if exit.borrow().is_none() {
                    let _ = tokio::time::timeout(Duration::from_secs(5), exit.changed()).await;
                }
            });
        }
        while tasks.join_next().await.is_some() {}
        let (barrier, completed) = oneshot::channel();
        if self
            .events
            .send(TerminalEvent::Barrier(barrier))
            .await
            .is_ok()
        {
            let _ = tokio::time::timeout(Duration::from_secs(5), completed).await;
        }
        self.event_loop.shutdown().await;
    }
}

impl EventLoop {
    async fn shutdown(&self) {
        self.shutdown.send_replace(true);
        let completed = self
            .completed
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take();
        if let Some(completed) = completed {
            let _ = completed.await;
        }
    }
}

async fn run_events(
    terminal: EventTerminalState,
    snapshots: TerminalScrollbackSnapshots,
    workspace_session: WorkspaceSessionAuthority,
    workspace_ports: WorkspacePortsRegistry,
    revision: watch::Sender<u64>,
    mut events: mpsc::Receiver<TerminalEvent>,
    mut shutdown: watch::Receiver<bool>,
) {
    let EventTerminalState {
        stats,
        auto_restore_fit,
        sessions: state,
    } = terminal;
    let mut agent_activity = AgentActivity::default();
    let mut side_effect_timer = tokio::time::interval(Duration::from_millis(100));
    side_effect_timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        let event = tokio::select! {
            biased;
            () = wait_for_shutdown(&mut shutdown) => return,
            _ = side_effect_timer.tick() => { state.expire_side_effects(); continue; },
            event = events.recv() => event,
        };
        let Some(event) = event else {
            return;
        };
        let event = match event {
            TerminalEvent::Barrier(completed) => {
                let _ = completed.send(());
                continue;
            }
            TerminalEvent::Clear { pty_id, result } => {
                let _ = result.send(state.clear_pty(&pty_id));
                continue;
            }
            TerminalEvent::Process(event) => event,
        };
        if let ProcessEvent::Output {
            bytes,
            observed_at,
            pty_id,
        } = &event
        {
            workspace_ports.ingest_pty_output(pty_id, bytes, *observed_at);
            if let Some(stats) = stats.get() {
                agent_activity.output(stats, pty_id, bytes, *observed_at);
            }
        }
        if let ProcessEvent::ReaderFinished {
            observed_at,
            pty_id,
            ..
        } = &event
        {
            workspace_ports.finish_pty_output(pty_id, *observed_at);
            if let Some(stats) = stats.get() {
                agent_activity.exit(stats, pty_id);
            }
        }
        let completed_pty_id = match &event {
            ProcessEvent::Exited { pty_id, .. } | ProcessEvent::ReaderFinished { pty_id, .. } => {
                Some(pty_id.clone())
            }
            ProcessEvent::Output { .. } => None,
        };
        let publishes_lifecycle = matches!(event, ProcessEvent::Exited { .. });
        if let Some((host_id, tab_id, leaf_id, buffer)) = state.accept(event) {
            if let Some(pty_id) = completed_pty_id {
                workspace_ports.unbind_pty(&pty_id);
            }
            let snapshots = snapshots.clone();
            let snapshot_tab_id = tab_id.clone();
            let snapshot_leaf_id = leaf_id.clone();
            let stored = tokio::task::spawn_blocking(move || {
                snapshots.store_blocking(&snapshot_tab_id, &snapshot_leaf_id, &buffer)
            })
            .await;
            if let Ok(Some(reference)) = stored {
                let _ = workspace_session
                    .bind_pty_scrollback(PtyScrollback {
                        host_id,
                        leaf_id,
                        reference,
                        tab_id,
                    })
                    .await;
            }
            for handle in state.prune_disconnected(&workspace_session.terminal_pty_references()) {
                auto_restore_fit.cancel(&handle);
            }
        }
        if publishes_lifecycle {
            revision.send_modify(|value| *value = value.saturating_add(1));
        }
    }
}

async fn wait_for_shutdown(shutdown: &mut watch::Receiver<bool>) {
    if *shutdown.borrow() {
        return;
    }
    while shutdown.changed().await.is_ok() {
        if *shutdown.borrow() {
            return;
        }
    }
}

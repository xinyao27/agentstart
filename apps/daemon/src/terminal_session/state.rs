use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Mutex, MutexGuard};

use tokio::sync::{broadcast, watch};

use super::model::{
    TerminalClient, TerminalClientType, TerminalDriverSnapshot, TerminalDriverState,
    TerminalFitOverrideMode, TerminalFitOverrideSnapshot, TerminalHeadlessBinding,
    TerminalMobileBinding, TerminalStreamEvent, TerminalStreamOutput, TerminalStreamSubscription,
    TerminalSummary,
};
use super::path_provenance::TerminalPathProvenance;
use super::process::{ProcessControl, ProcessEvent, TerminalClear};
use super::snapshot::TerminalSnapshotProvider;
use super::tail::TerminalTail;
use super::terminal_title::AgentStatus;

pub(super) struct TerminalState {
    data: Mutex<TerminalStateData>,
}

struct TerminalStateData {
    disconnected_order: VecDeque<String>,
    handles_by_pty: HashMap<String, String>,
    records: HashMap<String, TerminalRecord>,
}

pub(super) struct TerminalRecord {
    pub(super) branch: String,
    pub(super) cols: u16,
    pub(super) control: Option<ProcessControl>,
    pub(super) created_at: i64,
    pub(super) cwd: String,
    pub(super) exit: watch::Sender<Option<i32>>,
    pub(super) handle: String,
    pub(super) host_id: Option<String>,
    pub(super) input_reservation: Option<u64>,
    pub(super) input_revision: u64,
    pub(super) has_agent: bool,
    pub(super) launch_agent: Option<String>,
    pub(super) launch_token: Option<String>,
    pub(super) launch_config: Option<super::model::TerminalLaunchConfig>,
    pub(super) restored_checkpoint: Option<serde_json::Value>,
    pub(super) last_output_at: Option<i64>,
    pub(super) leaf_id: String,
    pub(super) pending_utf8: Vec<u8>,
    pub(super) path_provenance: TerminalPathProvenance,
    pub(super) process_exit_code: Option<i32>,
    pub(super) pty_id: String,
    pub(super) reader_finished: bool,
    pub(super) final_history: Option<String>,
    pub(super) raw_output: VecDeque<TerminalStreamOutput>,
    pub(super) raw_output_bytes: usize,
    pub(super) rows: u16,
    pub(super) sequence: u64,
    pub(super) snapshot_provider: TerminalSnapshotProvider,
    pub(super) tail: TerminalTail,
    pub(super) tab_id: String,
    pub(super) title: Option<String>,
    pub(super) transport_generation: String,
    pub(super) stream_events: broadcast::Sender<TerminalStreamEvent>,
    pub(super) side_effects: super::side_effects::SideEffectObserver,
    pub(super) agent_status: Option<AgentStatus>,
    pub(super) driver: TerminalDriver,
    pub(super) viewport_owner: Option<ViewportOwner>,
    pub(super) viewport_revision: u64,
    pub(super) viewer_activity: u64,
    pub(super) viewers: HashMap<String, TerminalViewer>,
    pub(super) query_reply_client: Option<String>,
    pub(super) display_mode: TerminalDisplayMode,
    pub(super) desktop_viewport_owner: Option<String>,
    pub(super) worktree_id: String,
    pub(super) worktree_path: String,
}

#[derive(Clone)]
pub(super) struct ViewportOwner {
    pub(super) client_id: String,
    pub(super) kind: ViewportOwnerKind,
    pub(super) previous_cols: u16,
    pub(super) previous_rows: u16,
}

#[derive(Clone, Copy)]
pub(super) enum ViewportOwnerKind {
    Mobile,
    RemoteDesktop,
}

#[derive(Clone, Copy, Eq, PartialEq)]
pub(super) enum TerminalDisplayMode {
    Auto,
    Desktop,
}

#[derive(Clone)]
pub(super) struct TerminalViewer {
    pub(super) activity: u64,
    pub(super) client: TerminalClient,
    pub(super) cols: Option<u16>,
    pub(super) rows: Option<u16>,
}

#[derive(Clone, Eq, PartialEq)]
pub(super) enum TerminalDriver {
    Idle,
    Desktop,
    Mobile(String),
}

pub(super) struct TerminalReattach {
    pub(super) cwd: String,
    pub(super) handle: String,
    pub(super) leaf_id: String,
    pub(super) pty_id: String,
    pub(super) tab_id: String,
    pub(super) title: Option<String>,
    pub(super) transport_generation: String,
    pub(super) worktree_id: String,
    pub(super) worktree_path: String,
}

pub(super) enum TerminalViewerDeparture {
    None,
    RestoreImmediately,
    RestoreMobileAfterDelay,
}

impl TerminalState {
    pub(super) fn new() -> Self {
        Self {
            data: Mutex::new(TerminalStateData {
                disconnected_order: VecDeque::new(),
                handles_by_pty: HashMap::new(),
                records: HashMap::new(),
            }),
        }
    }

    pub(super) fn insert(&self, record: TerminalRecord) {
        let mut data = lock(&self.data);
        let handle = record.handle.clone();
        let pty_id = record.pty_id.clone();
        if let Some(replaced) = data.records.insert(record.handle.clone(), record) {
            data.handles_by_pty.remove(&replaced.pty_id);
            data.disconnected_order
                .retain(|candidate| candidate != &handle);
        }
        data.handles_by_pty.insert(pty_id, handle);
    }

    pub(super) fn prune_disconnected(&self, referenced_pty_ids: &HashSet<String>) -> Vec<String> {
        let mut data = lock(&self.data);
        let stale_count = data
            .disconnected_order
            .iter()
            .filter_map(|handle| data.records.get(handle))
            .filter(|record| !referenced_pty_ids.contains(&record.pty_id))
            .count();
        let mut remove_remaining = stale_count.saturating_sub(DISCONNECTED_RECORD_MAX);
        if remove_remaining == 0 {
            return Vec::new();
        }
        let mut removed = Vec::with_capacity(remove_remaining);
        for handle in &data.disconnected_order {
            if remove_remaining == 0 {
                break;
            }
            let Some(record) = data.records.get(handle) else {
                continue;
            };
            if referenced_pty_ids.contains(&record.pty_id) {
                continue;
            }
            removed.push((handle.clone(), record.pty_id.clone()));
            remove_remaining -= 1;
        }
        for (handle, pty_id) in &removed {
            data.records.remove(handle);
            if data.handles_by_pty.get(pty_id) == Some(handle) {
                data.handles_by_pty.remove(pty_id);
            }
        }
        data.disconnected_order
            .retain(|handle| !removed.iter().any(|(removed, _)| removed == handle));
        removed.into_iter().map(|(handle, _)| handle).collect()
    }

    pub(super) fn remove_worktree(&self, host_id: Option<&str>, worktree_id: &str) -> Vec<String> {
        let mut data = lock(&self.data);
        let removed = data
            .records
            .iter()
            .filter(|(_, record)| {
                record.host_id.as_deref() == host_id && record.worktree_id == worktree_id
            })
            .map(|(handle, record)| (handle.clone(), record.pty_id.clone()))
            .collect::<Vec<_>>();
        for (handle, pty_id) in &removed {
            data.records.remove(handle);
            if data.handles_by_pty.get(pty_id) == Some(handle) {
                data.handles_by_pty.remove(pty_id);
            }
        }
        data.disconnected_order
            .retain(|handle| !removed.iter().any(|(removed, _)| removed == handle));
        removed.into_iter().map(|(handle, _)| handle).collect()
    }

    pub(super) fn with<T>(
        &self,
        handle: &str,
        operation: impl FnOnce(&TerminalRecord) -> T,
    ) -> Option<T> {
        lock(&self.data).records.get(handle).map(operation)
    }

    pub(super) fn with_mut<T>(
        &self,
        handle: &str,
        operation: impl FnOnce(&mut TerminalRecord) -> T,
    ) -> Option<T> {
        lock(&self.data).records.get_mut(handle).map(operation)
    }

    pub(super) fn active(&self) -> Vec<(Option<ProcessControl>, watch::Receiver<Option<i32>>)> {
        lock(&self.data)
            .records
            .values()
            .filter(|record| record.exit.borrow().is_none())
            .map(|record| (record.control.clone(), record.exit.subscribe()))
            .collect()
    }

    pub(super) fn terminal_drivers(&self) -> Vec<TerminalDriverSnapshot> {
        let mut drivers = lock(&self.data)
            .records
            .values()
            .filter(|record| record.process_exit_code.is_none())
            .filter_map(|record| {
                let driver = match &record.driver {
                    TerminalDriver::Idle => return None,
                    TerminalDriver::Desktop => TerminalDriverState::Desktop,
                    TerminalDriver::Mobile(client_id) => {
                        TerminalDriverState::Mobile(client_id.clone())
                    }
                };
                Some(TerminalDriverSnapshot {
                    driver,
                    pty_id: record.pty_id.clone(),
                })
            })
            .collect::<Vec<_>>();
        drivers.sort_unstable_by(|left, right| left.pty_id.cmp(&right.pty_id));
        drivers
    }

    pub(super) fn terminal_fit_overrides(&self) -> Vec<TerminalFitOverrideSnapshot> {
        let mut overrides = lock(&self.data)
            .records
            .values()
            .filter(|record| record.process_exit_code.is_none())
            .filter_map(|record| {
                let mode = record
                    .viewport_owner
                    .as_ref()
                    .map(|owner| match owner.kind {
                        ViewportOwnerKind::Mobile => TerminalFitOverrideMode::Mobile,
                        ViewportOwnerKind::RemoteDesktop => TerminalFitOverrideMode::RemoteDesktop,
                    })
                    .or_else(|| {
                        record
                            .desktop_viewport_owner
                            .as_ref()
                            .map(|_| TerminalFitOverrideMode::RemoteDesktop)
                    })?;
                Some(TerminalFitOverrideSnapshot {
                    cols: record.cols,
                    mode,
                    pty_id: record.pty_id.clone(),
                    rows: record.rows,
                })
            })
            .collect::<Vec<_>>();
        overrides.sort_unstable_by(|left, right| left.pty_id.cmp(&right.pty_id));
        overrides
    }

    pub(super) fn reattach(
        &self,
        host_id: Option<&str>,
        worktree_id: &str,
        tab_id: &str,
        leaf_id: &str,
    ) -> Option<TerminalReattach> {
        lock(&self.data)
            .records
            .values()
            .find(|record| {
                record.host_id.as_deref() == host_id
                    && record.worktree_id == worktree_id
                    && record.tab_id == tab_id
                    && record.leaf_id == leaf_id
                    && record.process_exit_code.is_none()
                    && record.control.is_some()
            })
            .map(|record| TerminalReattach {
                cwd: record.cwd.clone(),
                handle: record.handle.clone(),
                leaf_id: record.leaf_id.clone(),
                pty_id: record.pty_id.clone(),
                tab_id: record.tab_id.clone(),
                title: record.title.clone(),
                transport_generation: record.transport_generation.clone(),
                worktree_id: record.worktree_id.clone(),
                worktree_path: record.worktree_path.clone(),
            })
    }

    pub(super) fn agent_bindings(&self) -> Vec<serde_json::Value> {
        lock(&self.data)
            .records
            .values()
            .filter(|record| {
                record.process_exit_code.is_none()
                    && record.control.as_ref().is_some_and(ProcessControl::is_live)
            })
            .map(|record| {
                serde_json::json!({
                    "handle": record.handle,
                    "paneKey": format!("{}:{}", record.tab_id, record.leaf_id),
                    "tabId": record.tab_id,
                    "hostId": record.host_id.as_deref().unwrap_or("local"),
                    "worktreeId": record.worktree_id,
                    "worktreePath": record.worktree_path,
                    "launchToken": record.launch_token,
                    "createdAt": record.created_at,
                    "oscStatus": record.side_effects.agent_status(),
                })
            })
            .collect()
    }

    pub(super) fn summaries(&self) -> Vec<(TerminalSummary, Option<String>)> {
        lock(&self.data)
            .records
            .values()
            .map(|record| (record.summary(), record.host_id.clone()))
            .collect()
    }

    pub(super) fn management_sessions(&self) -> Vec<super::model::TerminalManagementSession> {
        let mut sessions = lock(&self.data)
            .records
            .values()
            .map(|record| {
                let is_alive = record.process_exit_code.is_none()
                    && record.control.as_ref().is_some_and(ProcessControl::is_live);
                super::model::TerminalManagementSession {
                    session_id: record.pty_id.clone(),
                    state: if is_alive { "running" } else { "exited" },
                    shell_state: "unsupported",
                    is_alive,
                    pid: record.control.as_ref().and_then(ProcessControl::pid),
                    cwd: record.cwd.clone(),
                    cols: record.cols,
                    rows: record.rows,
                    created_at: record.created_at,
                    protocol_version: 1,
                }
            })
            .collect::<Vec<_>>();
        sessions.sort_unstable_by(|left, right| left.session_id.cmp(&right.session_id));
        sessions
    }

    pub(super) fn mobile_binding(
        &self,
        pty_id: &str,
        worktree_id: &str,
    ) -> Option<TerminalMobileBinding> {
        let data = lock(&self.data);
        let handle = data.handles_by_pty.get(pty_id)?;
        let record = data.records.get(handle)?;
        let is_ambiguous = data.records.values().any(|candidate| {
            candidate.worktree_id == worktree_id
                && candidate.host_id != record.host_id
                && candidate.process_exit_code.is_none()
        });
        (record.worktree_id == worktree_id && record.process_exit_code.is_none() && !is_ambiguous)
            .then(|| TerminalMobileBinding {
                handle: record.handle.clone(),
                title: record.title.clone(),
            })
    }

    pub(super) fn handle_for_pty(&self, pty_id: &str) -> Option<String> {
        lock(&self.data).handles_by_pty.get(pty_id).cloned()
    }

    pub(super) fn headless_bindings(&self) -> Vec<TerminalHeadlessBinding> {
        let mut bindings = lock(&self.data)
            .records
            .values()
            .filter(|record| {
                record.process_exit_code.is_none()
                    && record.control.as_ref().is_some_and(ProcessControl::is_live)
            })
            .map(|record| TerminalHeadlessBinding {
                host_id: record.host_id.clone(),
                leaf_id: record.leaf_id.clone(),
                pty_id: record.pty_id.clone(),
                tab_id: record.tab_id.clone(),
                title: record.title.clone(),
                worktree_id: record.worktree_id.clone(),
            })
            .collect::<Vec<_>>();
        bindings.sort_unstable_by(|left, right| left.pty_id.cmp(&right.pty_id));
        bindings
    }

    pub(super) fn active_targets(
        &self,
        host_id: Option<&str>,
        worktree_id: &str,
    ) -> Vec<(String, String)> {
        let mut targets = lock(&self.data)
            .records
            .values()
            .filter(|record| {
                record.host_id.as_deref() == host_id
                    && record.worktree_id == worktree_id
                    && record.process_exit_code.is_none()
            })
            .map(|record| (record.handle.clone(), record.pty_id.clone()))
            .collect::<Vec<_>>();
        targets.sort_unstable_by(|left, right| left.1.cmp(&right.1));
        targets
    }

    pub(super) fn clear_pty(&self, pty_id: &str) -> Option<TerminalClear> {
        let mut data = lock(&self.data);
        let handle = data.handles_by_pty.get(pty_id)?.clone();
        let record = data.records.get_mut(&handle)?;
        record.tail.clear();
        record.raw_output.clear();
        record.raw_output_bytes = 0;
        let _ = record.stream_events.send(TerminalStreamEvent::Cleared {
            sequence: record.sequence,
        });
        Some((
            record.host_id.clone(),
            record.tab_id.clone(),
            record.leaf_id.clone(),
        ))
    }

    pub(super) fn is_live(&self, handle: &str) -> Option<bool> {
        self.with(handle, |record| record.process_exit_code.is_none())
    }

    pub(super) fn has_mobile_viewer(&self, handle: &str) -> bool {
        self.with(handle, |record| {
            record
                .viewers
                .values()
                .any(|viewer| viewer.client.kind == TerminalClientType::Mobile)
        })
        .unwrap_or(false)
    }

    pub(super) fn release_input(&self, handle: &str, reservation: u64) {
        self.with_mut(handle, |record| {
            if record.input_reservation == Some(reservation) {
                record.input_reservation = None;
            }
        });
    }

    pub(super) fn register_viewer(&self, handle: &str, client: TerminalClient) -> bool {
        self.with_mut(handle, |record| {
            if record.process_exit_code.is_some() {
                return false;
            }
            record.viewer_activity = record.viewer_activity.saturating_add(1);
            let activity = record.viewer_activity;
            if client.kind == TerminalClientType::Mobile {
                record.query_reply_client = Some(client.id.clone());
            }
            record.viewers.insert(
                client.id.clone(),
                TerminalViewer {
                    activity,
                    client,
                    cols: None,
                    rows: None,
                },
            );
            true
        })
        .unwrap_or(false)
    }

    pub(super) fn unregister_viewer(
        &self,
        handle: &str,
        client_id: &str,
    ) -> (TerminalViewerDeparture, bool) {
        self.with_mut(handle, |record| {
            let prior_driver = record.driver.clone();
            let owns_fit = record
                .viewport_owner
                .as_ref()
                .is_some_and(|owner| owner.client_id == client_id);
            let removed = record.viewers.remove(client_id);
            let removed_is_mobile = removed
                .as_ref()
                .is_some_and(|viewer| viewer.client.kind == TerminalClientType::Mobile);
            let surviving_mobile = record
                .viewers
                .values()
                .filter(|viewer| viewer.client.kind == TerminalClientType::Mobile)
                .max_by(|left, right| {
                    left.activity
                        .cmp(&right.activity)
                        .then_with(|| left.client.id.cmp(&right.client.id))
                })
                .map(|viewer| viewer.client.id.clone());
            if record.query_reply_client.as_deref() == Some(client_id) {
                record.query_reply_client = surviving_mobile.clone();
            }
            if record.desktop_viewport_owner.as_deref() == Some(client_id) {
                record.desktop_viewport_owner = None;
            }
            if matches!(&record.driver, TerminalDriver::Mobile(owner) if owner == client_id) {
                record.driver = surviving_mobile
                    .clone()
                    .map_or(TerminalDriver::Idle, TerminalDriver::Mobile);
            }
            let departure = if owns_fit && removed_is_mobile {
                if let Some(survivor) = surviving_mobile {
                    if let Some(owner) = record.viewport_owner.as_mut() {
                        owner.client_id = survivor;
                    }
                    TerminalViewerDeparture::None
                } else {
                    TerminalViewerDeparture::RestoreMobileAfterDelay
                }
            } else if owns_fit && removed.is_some() {
                TerminalViewerDeparture::RestoreImmediately
            } else {
                TerminalViewerDeparture::None
            };
            (departure, record.driver != prior_driver)
        })
        .unwrap_or((TerminalViewerDeparture::None, false))
    }

    pub(super) fn expire_side_effects(&self) {
        let now = std::time::Instant::now();
        let mut data = lock(&self.data);
        for record in data.records.values_mut() {
            if record.process_exit_code.is_none() && !record.reader_finished {
                let facts = record.side_effects.expire(now);
                publish_side_effects(record, facts);
            }
        }
    }

    pub(super) fn accept(
        &self,
        event: ProcessEvent,
    ) -> Option<(Option<String>, String, String, String)> {
        match event {
            ProcessEvent::Output {
                bytes,
                observed_at,
                pty_id,
            } => {
                let mut data = lock(&self.data);
                let handle = data.handles_by_pty.get(&pty_id)?.clone();
                let record = data.records.get_mut(&handle)?;
                let start_sequence = record.sequence;
                record.sequence = record.sequence.saturating_add(bytes.len() as u64);
                record.last_output_at = Some(observed_at);
                let facts =
                    record
                        .side_effects
                        .observe(&bytes, std::time::Instant::now(), observed_at);
                publish_side_effects(record, facts);
                append_utf8(record, &bytes);
                let output = TerminalStreamOutput {
                    bytes,
                    end_sequence: record.sequence,
                    start_sequence,
                };
                record.raw_output_bytes =
                    record.raw_output_bytes.saturating_add(output.bytes.len());
                record.raw_output.push_back(output.clone());
                while record.raw_output_bytes > MAX_RAW_OUTPUT_BYTES {
                    let Some(removed) = record.raw_output.pop_front() else {
                        break;
                    };
                    record.raw_output_bytes =
                        record.raw_output_bytes.saturating_sub(removed.bytes.len());
                }
                let _ = record
                    .stream_events
                    .send(TerminalStreamEvent::Output(output));
                None
            }
            ProcessEvent::Exited { exit_code, pty_id } => {
                let mut data = lock(&self.data);
                let handle = data.handles_by_pty.get(&pty_id)?.clone();
                let completed = {
                    let record = data.records.get_mut(&handle)?;
                    record.side_effects.close();
                    record.control.take();
                    record.process_exit_code = Some(exit_code);
                    complete_exit(record)
                };
                if completed.is_some() {
                    data.disconnected_order.push_back(handle);
                }
                completed
            }
            ProcessEvent::ReaderFinished {
                pty_id, history, ..
            } => {
                let mut data = lock(&self.data);
                let handle = data.handles_by_pty.get(&pty_id)?.clone();
                let completed = {
                    let record = data.records.get_mut(&handle)?;
                    record.side_effects.close();
                    record.reader_finished = true;
                    record.final_history = Some(history);
                    if !record.pending_utf8.is_empty() {
                        record.tail.append("�");
                        record.path_provenance.append_invalid_marker();
                        record.pending_utf8.clear();
                    }
                    complete_exit(record)
                };
                if completed.is_some() {
                    data.disconnected_order.push_back(handle);
                }
                completed
            }
        }
    }
}

fn snapshot(record: &TerminalRecord) -> (Option<String>, String, String, String) {
    (
        record.host_id.clone(),
        record.tab_id.clone(),
        record.leaf_id.clone(),
        record
            .final_history
            .clone()
            .unwrap_or_else(|| record.tail.snapshot()),
    )
}

fn append_utf8(record: &mut TerminalRecord, bytes: &[u8]) {
    record.pending_utf8.extend_from_slice(bytes);
    loop {
        match std::str::from_utf8(&record.pending_utf8) {
            Ok(text) => {
                record.tail.append(text);
                if let Some(cwd) = record.path_provenance.observe(text) {
                    record.cwd = cwd;
                }
                record.pending_utf8.clear();
                return;
            }
            Err(error) => {
                let valid = error.valid_up_to();
                if valid > 0 {
                    if let Ok(text) = std::str::from_utf8(&record.pending_utf8[..valid]) {
                        record.tail.append(text);
                        if let Some(cwd) = record.path_provenance.observe(text) {
                            record.cwd = cwd;
                        }
                    }
                    record.pending_utf8.drain(..valid);
                }
                let Some(invalid) = error.error_len() else {
                    return;
                };
                record.tail.append("�");
                record.path_provenance.append_invalid_marker();
                record.pending_utf8.drain(..invalid);
            }
        }
    }
}

impl TerminalRecord {
    pub(super) fn summary(&self) -> TerminalSummary {
        let connected = self.process_exit_code.is_none();
        TerminalSummary {
            branch: self.branch.clone(),
            connected,
            handle: self.handle.clone(),
            last_output_at: self.last_output_at,
            leaf_id: self.leaf_id.clone(),
            preview: self.tail.preview(),
            pty_id: Some(self.pty_id.clone()),
            tab_id: self.tab_id.clone(),
            title: self.title.clone(),
            worktree_id: self.worktree_id.clone(),
            worktree_path: self.worktree_path.clone(),
            writable: connected && self.control.is_some(),
        }
    }
}

fn complete_exit(record: &mut TerminalRecord) -> Option<(Option<String>, String, String, String)> {
    let exit_code = record.process_exit_code?;
    if !record.reader_finished || record.exit.borrow().is_some() {
        return None;
    }
    let _ = record.exit.send(Some(exit_code));
    let _ = record.stream_events.send(TerminalStreamEvent::Exited {
        exit_code,
        sequence: record.sequence,
    });
    let snapshot = snapshot(record);
    record.path_provenance.clear_recent();
    Some(snapshot)
}

const MAX_RAW_OUTPUT_BYTES: usize = 2 * 1024 * 1024;
const DISCONNECTED_RECORD_MAX: usize = 128;

impl TerminalState {
    pub(super) fn subscribe(
        &self,
        handle: &str,
        last_sequence: u64,
    ) -> Option<TerminalStreamSubscription> {
        self.with(handle, |record| {
            let receiver = record.stream_events.subscribe();
            let oldest_sequence = record
                .raw_output
                .front()
                .map_or(record.sequence, |output| output.start_sequence);
            let resume_sequence = last_sequence.max(oldest_sequence).min(record.sequence);
            let backlog = record
                .raw_output
                .iter()
                .filter_map(|output| resume_output(output, resume_sequence))
                .collect();
            TerminalStreamSubscription {
                backlog,
                cols: record.cols,
                exit_code: *record.exit.borrow(),
                receiver,
                rows: record.rows,
                sequence: record.sequence,
                transport_generation: record.transport_generation.clone(),
            }
        })
    }
}

fn resume_output(output: &TerminalStreamOutput, sequence: u64) -> Option<TerminalStreamOutput> {
    if output.end_sequence <= sequence {
        return None;
    }
    let offset = usize::try_from(sequence.saturating_sub(output.start_sequence))
        .unwrap_or(usize::MAX)
        .min(output.bytes.len());
    Some(TerminalStreamOutput {
        bytes: output.bytes[offset..].to_vec(),
        end_sequence: output.end_sequence,
        start_sequence: output.start_sequence.saturating_add(offset as u64),
    })
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn publish_side_effects(
    record: &mut TerminalRecord,
    facts: Vec<super::side_effects::TerminalSideEffect>,
) {
    if facts.is_empty() {
        return;
    }
    for fact in &facts {
        if let super::side_effects::TerminalSideEffect::Title { raw_title, .. } = fact {
            record.title = Some(raw_title.clone());
            record.agent_status = super::terminal_title::detect_agent_status(raw_title);
        }
    }
    let _ = record.stream_events.send(TerminalStreamEvent::SideEffects {
        sequence: record.sequence,
        facts,
    });
}

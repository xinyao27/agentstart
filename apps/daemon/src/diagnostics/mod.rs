mod bundle;
mod model;
mod policy;
mod support;
mod system;
mod trace;
mod trace_context;
mod trace_file;

use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use tokio::sync::{Mutex, watch};

pub(crate) use model::{
    AppMemory, DiagnosticBundle, DiagnosticUpload, DiagnosticsDisabledReason, DiagnosticsStatus,
    HostMemory, MemorySnapshot, SessionMemory, UsageValues, WorktreeMemory,
};
use support::SupportDiagnostics;
pub(crate) use support::SupportDiagnosticsError;
use system::{ProcessSample, SystemCollector, SystemSnapshot};
pub(crate) use trace::{DiagnosticsTrace, TraceSpan};
pub(crate) use trace_context::scope_optional;

const HISTORY_CAPACITY: usize = 60;

#[derive(Clone)]
pub(crate) struct MemoryDiagnostics {
    state: Arc<Mutex<CollectorState>>,
    support: SupportDiagnostics,
    system: SystemCollector,
}

struct CollectorState {
    history: VecDeque<u64>,
    previous_cpu: Option<CpuBaseline>,
    inflight: Option<InflightCapture>,
    next_capture_id: u64,
}

#[derive(Clone)]
struct InflightCapture {
    id: u64,
    receiver: watch::Receiver<Option<MemorySnapshot>>,
}

struct CpuBaseline {
    sampled_at: Instant,
    by_pid: HashMap<u32, ProcessCpuPoint>,
}

struct ProcessCpuPoint {
    started_at: u64,
    accumulated_millis: u64,
}

impl MemoryDiagnostics {
    pub(crate) fn new(
        user_data_path: &Path,
        telemetry: crate::telemetry::TelemetryAuthority,
        trace: DiagnosticsTrace,
    ) -> Self {
        Self {
            state: Arc::new(Mutex::new(CollectorState {
                history: VecDeque::with_capacity(HISTORY_CAPACITY),
                previous_cpu: None,
                inflight: None,
                next_capture_id: 0,
            })),
            support: SupportDiagnostics::new(
                user_data_path,
                telemetry,
                crate::shell_platform::ShellPlatformAuthority::new(),
                trace,
            ),
            system: SystemCollector::new(),
        }
    }

    pub(crate) fn support_status(&self) -> DiagnosticsStatus {
        self.support.status()
    }

    pub(crate) fn start_trace_span(
        &self,
        name: &'static str,
        attributes: serde_json::Map<String, serde_json::Value>,
    ) -> TraceSpan {
        self.support.trace().start_span(name, attributes)
    }

    /// Starts a span that ignores any ambient parent. See `start_root_span` for
    /// why a boundary would want this.
    pub(crate) fn start_root_trace_span(
        &self,
        name: &'static str,
        attributes: serde_json::Map<String, serde_json::Value>,
    ) -> TraceSpan {
        self.support.trace().start_root_span(name, attributes)
    }

    pub(crate) async fn collect_bundle(
        &self,
        lookback_minutes: Option<u32>,
    ) -> Result<DiagnosticBundle, SupportDiagnosticsError> {
        self.support.collect(lookback_minutes).await
    }

    pub(crate) async fn collect_crash_report_diagnostics(
        &self,
        lookback_minutes: u32,
    ) -> Result<crate::telemetry::SupportDiagnosticReport, SupportDiagnosticsError> {
        self.support.collect_report(Some(lookback_minutes)).await
    }

    pub(crate) async fn open_bundle_preview(
        &self,
        bundle_submission_id: &str,
    ) -> Result<(), SupportDiagnosticsError> {
        self.support.open_preview(bundle_submission_id).await
    }

    pub(crate) fn discard_bundle_preview(
        &self,
        bundle_submission_id: &str,
    ) -> Result<(), SupportDiagnosticsError> {
        self.support.discard(bundle_submission_id)
    }

    pub(crate) async fn upload_bundle(
        &self,
        bundle_submission_id: &str,
    ) -> Result<DiagnosticUpload, SupportDiagnosticsError> {
        self.support.upload(bundle_submission_id).await
    }

    pub(crate) async fn snapshot(&self) -> MemorySnapshot {
        let (id, mut receiver, sender) = {
            let mut state = self.state.lock().await;
            if let Some(inflight) = &state.inflight {
                (inflight.id, inflight.receiver.clone(), None)
            } else {
                state.next_capture_id = state.next_capture_id.wrapping_add(1);
                let id = state.next_capture_id;
                let (sender, receiver) = watch::channel(None);
                state.inflight = Some(InflightCapture {
                    id,
                    receiver: receiver.clone(),
                });
                (id, receiver, Some(sender))
            }
        };

        if let Some(sender) = sender {
            let diagnostics = self.clone();
            tokio::spawn(async move {
                let snapshot = diagnostics.collect_once().await;
                let _ = sender.send(Some(snapshot));
                diagnostics.clear_inflight(id).await;
            });
        }

        loop {
            if let Some(snapshot) = receiver.borrow_and_update().clone() {
                return snapshot;
            }
            if receiver.changed().await.is_err() {
                self.clear_inflight(id).await;
                return empty_snapshot();
            }
        }
    }

    async fn collect_once(&self) -> MemorySnapshot {
        let Some(system) = self.system.capture().await else {
            return empty_snapshot();
        };
        let mut state = self.state.lock().await;
        snapshot_from_system(&mut state, system)
    }

    async fn clear_inflight(&self, capture_id: u64) {
        let mut state = self.state.lock().await;
        if state
            .inflight
            .as_ref()
            .is_some_and(|inflight| inflight.id == capture_id)
        {
            state.inflight = None;
        }
    }
}

fn snapshot_from_system(state: &mut CollectorState, system: SystemSnapshot) -> MemorySnapshot {
    let mut daemon = UsageValues {
        cpu: 0.0,
        memory: 0,
    };
    let mut other = UsageValues {
        cpu: 0.0,
        memory: 0,
    };
    for process in &system.processes {
        let usage = UsageValues {
            cpu: process_cpu(state.previous_cpu.as_ref(), process, system.sampled_at),
            memory: process.memory,
        };
        if process.is_daemon {
            daemon.cpu = usage.cpu;
            daemon.memory = usage.memory;
        } else {
            other.cpu += usage.cpu;
            other.memory = other.memory.saturating_add(usage.memory);
        }
    }
    state.previous_cpu = Some(cpu_baseline(&system));

    let cpu = system::finite_nonnegative(daemon.cpu + other.cpu);
    let memory = daemon.memory.saturating_add(other.memory);
    push_history(&mut state.history, memory);
    let history = state.history.iter().copied().collect();
    let total_memory = system.total_memory;
    let free_memory = system.free_memory.min(total_memory);
    let used_memory = total_memory.saturating_sub(free_memory);
    MemorySnapshot {
        app: AppMemory {
            cpu,
            memory,
            daemon,
            other,
            history,
        },
        // Why: neither daemon currently has a durable terminal PID-to-worktree authority.
        worktrees: Vec::new(),
        host: HostMemory {
            total_memory,
            free_memory,
            used_memory,
            memory_usage_percent: percentage(used_memory, total_memory),
            cpu_core_count: system.cpu_core_count.max(1),
            load_average_1m: system::finite_nonnegative(system.load_average_1m),
        },
        total_cpu: cpu,
        total_memory: memory,
        collected_at: epoch_millis(),
    }
}

fn process_cpu(
    previous: Option<&CpuBaseline>,
    process: &ProcessSample,
    sampled_at: Instant,
) -> f64 {
    let Some(previous) = previous else {
        return 0.0;
    };
    let Some(point) = previous.by_pid.get(&process.pid) else {
        return 0.0;
    };
    if point.started_at != process.started_at {
        return 0.0;
    }
    let elapsed_millis = sampled_at
        .saturating_duration_since(previous.sampled_at)
        .as_secs_f64()
        * 1_000.0;
    if elapsed_millis == 0.0 {
        return 0.0;
    }
    let consumed_millis = process
        .accumulated_cpu_millis
        .saturating_sub(point.accumulated_millis);
    system::finite_nonnegative(consumed_millis as f64 / elapsed_millis * 100.0)
}

fn cpu_baseline(system: &SystemSnapshot) -> CpuBaseline {
    CpuBaseline {
        sampled_at: system.sampled_at,
        by_pid: system
            .processes
            .iter()
            .map(|process| {
                (
                    process.pid,
                    ProcessCpuPoint {
                        started_at: process.started_at,
                        accumulated_millis: process.accumulated_cpu_millis,
                    },
                )
            })
            .collect(),
    }
}

fn empty_snapshot() -> MemorySnapshot {
    let zero = UsageValues {
        cpu: 0.0,
        memory: 0,
    };
    MemorySnapshot {
        app: AppMemory {
            cpu: 0.0,
            memory: 0,
            daemon: zero.clone(),
            other: zero,
            history: Vec::new(),
        },
        worktrees: Vec::new(),
        host: HostMemory {
            total_memory: 0,
            free_memory: 0,
            used_memory: 0,
            memory_usage_percent: 0.0,
            cpu_core_count: system::available_parallelism(),
            load_average_1m: 0.0,
        },
        total_cpu: 0.0,
        total_memory: 0,
        collected_at: epoch_millis(),
    }
}

fn percentage(part: u64, whole: u64) -> f64 {
    if whole == 0 {
        return 0.0;
    }
    (part as f64 / whole as f64) * 100.0
}

fn push_history(history: &mut VecDeque<u64>, value: u64) {
    if history.len() == HISTORY_CAPACITY {
        history.pop_front();
    }
    history.push_back(value);
}

fn epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

#[derive(Clone)]
pub(crate) struct UsageValues {
    pub(crate) cpu: f64,
    pub(crate) memory: u64,
}

#[derive(Clone)]
pub(crate) struct AppMemory {
    pub(crate) cpu: f64,
    pub(crate) memory: u64,
    pub(crate) daemon: UsageValues,
    pub(crate) other: UsageValues,
    pub(crate) history: Vec<u64>,
}

#[derive(Clone)]
pub(crate) struct SessionMemory {
    pub(crate) cpu: f64,
    pub(crate) memory: u64,
    pub(crate) session_id: String,
    pub(crate) pane_key: Option<String>,
    pub(crate) pid: u32,
}

#[derive(Clone)]
pub(crate) struct WorktreeMemory {
    pub(crate) cpu: f64,
    pub(crate) memory: u64,
    pub(crate) worktree_id: String,
    pub(crate) worktree_name: String,
    pub(crate) repo_id: String,
    pub(crate) repo_name: String,
    pub(crate) sessions: Vec<SessionMemory>,
    pub(crate) history: Vec<u64>,
}

#[derive(Clone)]
pub(crate) struct HostMemory {
    pub(crate) total_memory: u64,
    pub(crate) free_memory: u64,
    pub(crate) used_memory: u64,
    pub(crate) memory_usage_percent: f64,
    pub(crate) cpu_core_count: usize,
    pub(crate) load_average_1m: f64,
}

#[derive(Clone)]
pub(crate) struct MemorySnapshot {
    pub(crate) app: AppMemory,
    pub(crate) worktrees: Vec<WorktreeMemory>,
    pub(crate) host: HostMemory,
    pub(crate) total_cpu: f64,
    pub(crate) total_memory: u64,
    pub(crate) collected_at: u64,
}

#[derive(Clone, Copy)]
pub(crate) enum DiagnosticsDisabledReason {
    DoNotTrack,
    AgentStartTelemetryDisabled,
    AgentStartDiagnosticsDisabled,
    Ci,
}

pub(crate) struct DiagnosticsStatus {
    pub(crate) local_file_enabled: bool,
    pub(crate) bundle_enabled: bool,
    pub(crate) trace_file_path: String,
    pub(crate) trace_family_size: u64,
    pub(crate) disabled_reason: Option<DiagnosticsDisabledReason>,
}

pub(crate) struct DiagnosticBundle {
    pub(crate) bundle_submission_id: String,
    pub(crate) bytes: u64,
    pub(crate) span_count: u32,
}

pub(crate) struct DiagnosticUpload {
    pub(crate) ticket_id: String,
}

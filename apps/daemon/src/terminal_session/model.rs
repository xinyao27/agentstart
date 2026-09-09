use serde::Serialize;
use tokio::sync::broadcast;

#[derive(Clone)]
pub(crate) struct TerminalLaunchConfig {
    pub(crate) omp_resume_file_path: Option<String>,
    pub(crate) agent_args: String,
    pub(crate) agent_command: Option<String>,
    pub(crate) agent_env: Vec<(String, String)>,
}

pub(crate) struct TerminalAgentStartup {
    pub(crate) command: String,
    pub(crate) environment: Vec<(String, String)>,
    pub(crate) launch_config: TerminalLaunchConfig,
    pub(crate) startup_command_delivery: Option<TerminalStartupCommandDelivery>,
}

#[derive(Clone, Copy, Eq, PartialEq)]
pub(crate) enum TerminalPresentation {
    Background,
    Focused,
    Visible,
}

#[derive(Clone, Copy)]
pub(crate) enum TerminalStartupCommandDelivery {
    Fast,
    ShellReady,
}

#[derive(Clone)]
pub(crate) struct TerminalCreateRequest {
    pub(crate) activate: bool,
    pub(crate) cols: u16,
    pub(crate) command: Option<String>,
    pub(crate) cwd: Option<String>,
    pub(crate) cwd_fallback: bool,
    pub(crate) env: Vec<(String, String)>,
    pub(crate) env_to_delete: Vec<String>,
    pub(crate) focus: bool,
    pub(crate) launch_agent: Option<String>,
    pub(crate) launch_config: Option<TerminalLaunchConfig>,
    pub(crate) launch_token: Option<String>,
    pub(crate) leaf_id: Option<String>,
    pub(crate) presentation: Option<TerminalPresentation>,
    pub(crate) rows: u16,
    pub(crate) startup_command_delivery: Option<TerminalStartupCommandDelivery>,
    pub(crate) renderer_backed: bool,
    pub(crate) tab_id: Option<String>,
    pub(crate) title: Option<String>,
    pub(crate) split_direction: Option<&'static str>,
    pub(crate) split_from_leaf_id: Option<String>,
    pub(crate) split_telemetry_source: Option<String>,
    pub(crate) worktree: Option<String>,
}

#[derive(Clone, Copy, Eq, PartialEq)]
pub(crate) enum TerminalClientType {
    Cli,
    Daemon,
    Desktop,
    Extension,
    Mobile,
}

#[derive(Clone)]
pub(crate) struct TerminalClient {
    pub(crate) id: String,
    pub(crate) kind: TerminalClientType,
}

#[derive(Clone)]
pub(crate) struct TerminalDriverSnapshot {
    pub(crate) driver: TerminalDriverState,
    pub(crate) pty_id: String,
}

#[derive(Clone)]
pub(crate) enum TerminalDriverState {
    Desktop,
    Mobile(String),
}

#[derive(Clone)]
pub(crate) struct TerminalFitOverrideSnapshot {
    pub(crate) cols: u16,
    pub(crate) mode: TerminalFitOverrideMode,
    pub(crate) pty_id: String,
    pub(crate) rows: u16,
}

#[derive(Clone, Copy)]
pub(crate) enum TerminalFitOverrideMode {
    Mobile,
    RemoteDesktop,
}

#[derive(Clone, Copy, Eq, PartialEq)]
pub(crate) enum TerminalSendInputKind {
    QueryReply,
}

#[derive(Clone)]
pub(crate) struct TerminalSendRequest {
    pub(crate) claim_viewport: bool,
    pub(crate) client: Option<TerminalClient>,
    pub(crate) enter: bool,
    pub(crate) input_kind: Option<TerminalSendInputKind>,
    pub(crate) interrupt: bool,
    pub(crate) require_agent_sendable: bool,
    pub(crate) terminal: String,
    pub(crate) text: Option<String>,
    pub(crate) viewport: Option<TerminalViewport>,
}

#[derive(Clone, Copy)]
pub(crate) struct TerminalViewport {
    pub(crate) cols: u16,
    pub(crate) rows: u16,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalSendResult {
    pub(crate) accepted: bool,
    pub(crate) bytes_written: usize,
    pub(crate) handle: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) refused_reason: Option<&'static str>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalCreateResult {
    pub(crate) handle: String,
    pub(crate) is_reattach: bool,
    pub(crate) pane_key: String,
    pub(crate) pty_id: String,
    pub(crate) restore: TerminalRestore,
    pub(crate) session_expired: bool,
    pub(crate) surface: &'static str,
    pub(crate) tab_id: String,
    pub(crate) title: Option<String>,
    pub(crate) transport_generation: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) warning: Option<String>,
    pub(crate) worktree_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalRestore {
    pub(crate) is_alternate_screen: bool,
    pub(crate) kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) startup_cwd_fallback: Option<TerminalStartupCwdFallback>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalStartupCwdFallback {
    pub(crate) cwd: String,
    pub(crate) kind: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalSummary {
    pub(crate) branch: String,
    pub(crate) connected: bool,
    pub(crate) handle: String,
    pub(crate) last_output_at: Option<i64>,
    pub(crate) leaf_id: String,
    pub(crate) preview: String,
    pub(crate) pty_id: Option<String>,
    pub(crate) tab_id: String,
    pub(crate) title: Option<String>,
    pub(crate) worktree_id: String,
    pub(crate) worktree_path: String,
    pub(crate) writable: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalShow {
    #[serde(flatten)]
    pub(crate) summary: TerminalSummary,
    pub(crate) pane_runtime_id: i64,
    pub(crate) renderer_graph_epoch: u64,
    pub(crate) transport_generation: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalAgentState {
    pub(crate) handle: String,
    pub(crate) is_running_agent: bool,
    pub(crate) status: Option<&'static str>,
}

#[derive(Clone, Debug)]
pub(crate) struct TerminalAgentStatusSnapshot {
    pub(crate) agent_type: Option<String>,
    pub(crate) created_at: i64,
    pub(crate) handle: String,
    pub(crate) is_running_agent: bool,
    pub(crate) process_exited: bool,
    pub(crate) status: Option<&'static str>,
    pub(crate) title: Option<String>,
    pub(crate) updated_at: i64,
    pub(crate) worktree_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalRenameResult {
    pub(crate) handle: String,
    pub(crate) tab_id: String,
    pub(crate) title: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalFocusResult {
    pub(crate) handle: String,
    pub(crate) tab_id: String,
    pub(crate) worktree_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalSplitResult {
    pub(crate) handle: String,
    pub(crate) pane_runtime_id: i64,
    pub(crate) tab_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalManagementSession {
    pub(crate) session_id: String,
    pub(crate) state: &'static str,
    pub(crate) shell_state: &'static str,
    pub(crate) is_alive: bool,
    pub(crate) pid: Option<u32>,
    pub(crate) cwd: String,
    pub(crate) cols: u16,
    pub(crate) rows: u16,
    pub(crate) created_at: i64,
    pub(crate) protocol_version: u8,
}

pub(crate) struct TerminalManagementKillResult {
    pub(crate) killed_count: usize,
    pub(crate) killed_session_ids: Vec<String>,
    pub(crate) remaining_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalListResult {
    pub(crate) terminals: Vec<TerminalSummary>,
    pub(crate) total_count: usize,
    pub(crate) truncated: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(crate) visual_layouts: Vec<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalReadResult {
    pub(crate) handle: String,
    pub(crate) latest_cursor: String,
    pub(crate) limited: bool,
    pub(crate) next_cursor: String,
    pub(crate) oldest_cursor: String,
    pub(crate) returned_line_count: usize,
    pub(crate) status: &'static str,
    pub(crate) tail: Vec<String>,
    pub(crate) truncated: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum WaitCondition {
    Exit,
    TuiIdle,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalWaitResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) blocked_reason: Option<&'static str>,
    pub(crate) condition: &'static str,
    pub(crate) exit_code: Option<i32>,
    pub(crate) handle: String,
    pub(crate) satisfied: bool,
    pub(crate) status: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalResizeResult {
    pub(crate) cols: u16,
    pub(crate) mode: &'static str,
    pub(crate) previous_cols: Option<u16>,
    pub(crate) previous_rows: Option<u16>,
    pub(crate) rows: u16,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalProcessInspection {
    pub(crate) foreground_process: Option<String>,
    pub(crate) has_child_processes: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalResolvePane {
    pub(crate) handle: String,
    pub(crate) leaf_id: String,
    pub(crate) pty_id: Option<String>,
    pub(crate) tab_id: String,
}

#[derive(Clone)]
pub(crate) struct TerminalMobileBinding {
    pub(crate) handle: String,
    pub(crate) title: Option<String>,
}

#[derive(Clone)]
pub(crate) struct TerminalHeadlessBinding {
    pub(crate) host_id: Option<String>,
    pub(crate) leaf_id: String,
    pub(crate) pty_id: String,
    pub(crate) tab_id: String,
    pub(crate) title: Option<String>,
    pub(crate) worktree_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalStopExactResult {
    pub(crate) live_pty_ids: Vec<String>,
    pub(crate) post_stop_verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) post_stop_failure: Option<&'static str>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(crate) remaining_live_pty_ids: Vec<String>,
    pub(crate) stopped: usize,
    pub(crate) stopped_pty_ids: Vec<String>,
}

#[derive(Clone)]
pub(crate) enum TerminalStreamEvent {
    SideEffects {
        sequence: u64,
        facts: Vec<super::side_effects::TerminalSideEffect>,
    },
    Cleared {
        sequence: u64,
    },
    Exited {
        exit_code: i32,
        sequence: u64,
    },
    Output(TerminalStreamOutput),
    Resized {
        cols: u16,
        rows: u16,
        sequence: u64,
    },
}

#[derive(Clone)]
pub(crate) struct TerminalStreamOutput {
    pub(crate) bytes: Vec<u8>,
    pub(crate) end_sequence: u64,
    pub(crate) start_sequence: u64,
}

pub(crate) struct TerminalStreamSubscription {
    pub(crate) backlog: Vec<TerminalStreamOutput>,
    pub(crate) cols: u16,
    pub(crate) exit_code: Option<i32>,
    pub(crate) receiver: broadcast::Receiver<TerminalStreamEvent>,
    pub(crate) rows: u16,
    pub(crate) sequence: u64,
    pub(crate) transport_generation: String,
}

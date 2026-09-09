// Why: these typed inputs are the shared authority contract between the
// protobuf decoder (`protocol.rs`) and the append authority (`super`), so the
// protobuf and any future surface cannot drift apart on validation inputs.
pub(in crate::rpc) struct ConsoleEntry {
    pub(super) occurred_at: f64,
    pub(super) source: String,
    pub(super) stack: Option<String>,
    pub(super) text: String,
}

pub(in crate::rpc) struct ConsoleInput {
    pub(super) entries: Vec<ConsoleEntry>,
    pub(super) page_url: String,
    pub(super) project_id: String,
    pub(super) worktree_id: String,
}

pub(in crate::rpc) struct PerformanceInput {
    pub(super) artifact_id: String,
    pub(super) metric_count: usize,
    pub(super) page_url: String,
    pub(super) project_id: String,
    pub(super) worktree_id: String,
}

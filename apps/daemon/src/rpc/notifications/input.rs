// Why: this input crosses the protobuf decoder (`protocol.rs`) and the
// presentation builder (`presentation.rs`), so it lives at the namespace root
// rather than inside either module.
pub(in crate::rpc) struct ReportInput {
    pub(super) agent_interrupted: Option<bool>,
    pub(super) agent_last_assistant_message: Option<String>,
    pub(super) agent_prompt: Option<String>,
    pub(super) agent_state: Option<String>,
    pub(super) agent_tool_input: Option<String>,
    pub(super) agent_tool_name: Option<String>,
    pub(super) agent_type: Option<String>,
    pub(super) has_multiple_active_repos: Option<bool>,
    pub(super) is_active_worktree: Option<bool>,
    pub(super) notification_id: Option<String>,
    pub(super) pane_key: Option<String>,
    pub(super) repo_label: Option<String>,
    pub(super) require_display_confirmation: Option<bool>,
    pub(super) source: NotificationSource,
    pub(super) terminal_title: Option<String>,
    pub(super) worktree_id: Option<String>,
    pub(super) worktree_label: Option<String>,
}

use crate::notifications::NotificationSource;

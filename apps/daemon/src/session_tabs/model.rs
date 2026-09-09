use serde_json::Value;

use crate::terminal_session::{TerminalLaunchConfig, TerminalStartupCommandDelivery};

#[derive(Clone, Eq, PartialEq)]
pub(crate) enum RendererHost {
    KnownLocal,
    KnownRemote(String),
    Unknown,
}

impl RendererHost {
    pub(crate) fn from_scope(host_id: Option<&str>) -> Self {
        match host_id {
            Some(host_id) => Self::KnownRemote(host_id.to_owned()),
            None => Self::KnownLocal,
        }
    }

    pub(crate) fn matches(&self, host_id: Option<&str>) -> bool {
        match (self, host_id) {
            (Self::KnownLocal, None) => true,
            (Self::KnownRemote(expected), Some(actual)) => expected == actual,
            (Self::KnownLocal | Self::KnownRemote(_) | Self::Unknown, _) => false,
        }
    }

    pub(crate) fn is_unknown(&self) -> bool {
        self == &Self::Unknown
    }
}

#[derive(Clone)]
pub(crate) struct RendererSnapshot {
    pub(crate) host: RendererHost,
    pub(crate) publication_epoch: String,
    pub(crate) snapshot_version: f64,
    pub(crate) value: Value,
    pub(crate) worktree: String,
}

pub(crate) struct RendererProjection {
    pub(crate) snapshots: Option<Vec<RendererSnapshot>>,
}

#[derive(Clone)]
pub(crate) struct SessionTabsUpdate {
    pub(crate) worktrees: Option<Vec<SessionTabsWorktreeUpdate>>,
}

#[derive(Clone)]
pub(crate) struct SessionTabsWorktreeUpdate {
    pub(crate) removed: bool,
    pub(crate) removed_epoch: Option<String>,
    pub(crate) worktree: String,
}

pub(crate) struct SessionTabCreate {
    pub(crate) activate: bool,
    pub(crate) after_tab_id: Option<String>,
    pub(crate) agent: Option<String>,
    pub(crate) agent_prompt: Option<String>,
    pub(crate) client_mutation_id: Option<String>,
    pub(crate) command: Option<String>,
    pub(crate) cwd: Option<String>,
    pub(crate) env: Vec<(String, String)>,
    pub(crate) env_to_delete: Vec<String>,
    pub(crate) launch_agent: Option<String>,
    pub(crate) launch_config: Option<TerminalLaunchConfig>,
    pub(crate) launch_token: Option<String>,
    pub(crate) startup_command_delivery: Option<TerminalStartupCommandDelivery>,
    pub(crate) target_group_id: Option<String>,
}

pub(crate) enum SessionTabMove {
    MoveToGroup { index: Option<usize> },
    Reorder { tab_order: Vec<String> },
    Split { direction: String },
}

mod agent_activity;
mod authority;
mod auto_restore_fit;
mod creation;
mod error;
mod identity;
mod input;
mod launch;
mod lifecycle;
mod model;
mod multiplex_admission;
mod path_provenance;
mod process;
mod query;
mod read_handler;
mod read_history;
mod read_position;
mod reveal;
mod scope;
mod side_effects;
mod sleep;
mod sleep_records;
mod snapshot;
mod state;
mod tail;
mod tail_control;
mod tail_redraw;
mod terminal_title;
mod viewport;
mod visual_layout;
mod wait;
mod wait_readiness;
mod wake;
mod wake_plan;
mod worktree_gate;

pub(crate) use authority::{TerminalRuntimeContext, TerminalSessionAuthority};
pub(crate) use error::TerminalSessionError;
pub(crate) use identity::random_id;
pub(crate) use model::{
    TerminalAgentStatusSnapshot, TerminalClient, TerminalClientType, TerminalCreateRequest,
    TerminalCreateResult, TerminalDriverSnapshot, TerminalDriverState, TerminalFitOverrideMode,
    TerminalFitOverrideSnapshot, TerminalFocusResult, TerminalHeadlessBinding,
    TerminalLaunchConfig, TerminalManagementSession, TerminalPresentation, TerminalReadResult,
    TerminalResizeResult, TerminalSendInputKind, TerminalSendRequest, TerminalSendResult,
    TerminalStartupCommandDelivery, TerminalStreamEvent, TerminalSummary, TerminalViewport,
    WaitCondition,
};
pub(crate) use multiplex_admission::TerminalMultiplexClose;
pub(crate) use snapshot::TerminalSnapshotResult;

#[derive(Clone, Debug)]
pub(crate) struct TerminalFileContext {
    pub(crate) cwd: String,
    pub(crate) host_id: String,
    pub(crate) worktree_id: String,
}

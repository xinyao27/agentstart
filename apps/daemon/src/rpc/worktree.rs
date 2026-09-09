mod input;
pub(super) mod protocol;
mod protocol_values;

use thiserror::Error;

use crate::client_events::ClientEventsAuthority;
use crate::persistence::WorkspaceJournal;
use crate::repositories::RepositoryAuthority;
use crate::terminal_session::TerminalSessionAuthority;
use crate::workspace_session::WorkspaceSessionAuthority;
use crate::worktrees::{
    WorktreeArchiveAuthority, WorktreeArchiveAuthorityError, WorktreeAuthority,
    WorktreeAuthorityError, WorktreeCatalog,
};
use input::{
    WorktreeInputFailure, parse_activate, parse_archive, parse_archive_list, parse_archive_restore,
    parse_create, parse_force_delete_branch, parse_list, parse_order, parse_prefetch_create_base,
    parse_ps, parse_remove, parse_repo_selector, parse_resolve_pr_base, parse_selector, parse_set,
};

// Why: the worktree legacy METHODS table retired with the legacy dispatch
// mechanism; the protobuf WorktreeService handlers in `protocol` are the only
// surface left.
#[derive(Clone)]
pub(super) struct WorktreeRpc {
    archives: WorktreeArchiveAuthority,
    authority: WorktreeAuthority,
    agent_status: super::AgentStatusAuthority,
    orchestration: crate::orchestration::OrchestrationAuthority,
}

#[derive(Debug, Error)]
enum WorktreeRpcError {
    #[error(transparent)]
    Authority(#[from] WorktreeAuthorityError),
    #[error(transparent)]
    Archive(#[from] WorktreeArchiveAuthorityError),
}

pub(super) struct WorktreeRpcInputs {
    pub(super) archives: WorktreeArchiveAuthority,
    pub(super) worktrees: WorktreeCatalog,
    pub(super) client_events: ClientEventsAuthority,
    pub(super) journal: WorkspaceJournal,
    pub(super) terminals: TerminalSessionAuthority,
    pub(super) workspace_session: WorkspaceSessionAuthority,
    pub(super) repositories: RepositoryAuthority,
    pub(super) agent_status: super::AgentStatusAuthority,
    pub(super) orchestration: crate::orchestration::OrchestrationAuthority,
}

impl WorktreeRpc {
    pub(super) fn new(input: WorktreeRpcInputs) -> Self {
        Self {
            archives: input.archives,
            authority: WorktreeAuthority::new(
                input.worktrees,
                input.client_events,
                input.journal,
                input.terminals,
                input.workspace_session,
                input.repositories,
            ),
            agent_status: input.agent_status,
            orchestration: input.orchestration,
        }
    }
}

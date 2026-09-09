use crate::host_registry::HostRegistry;
use crate::layouts::LayoutAuthority;
use crate::persistence::WorkspaceJournal;
use crate::terminal_session::TerminalSessionAuthority;
use crate::worktrees::WorktreeCatalog;

// Why: rpc::layout is a descendant of rpc, so it can name this module-private sibling directly
// without the crate-wide re-export layouts::authority needs (see that file's own Why comment).
use super::agent_session::AgentSessionAuthority;

pub(super) mod protocol;

#[derive(Clone)]
pub(super) struct LayoutRpc {
    authority: LayoutAuthority,
}

impl LayoutRpc {
    pub(super) fn new(
        worktrees: WorktreeCatalog,
        hosts: HostRegistry,
        terminals: TerminalSessionAuthority,
        journal: WorkspaceJournal,
        agent_sessions: AgentSessionAuthority,
    ) -> Self {
        Self {
            authority: LayoutAuthority::new(worktrees, hosts, terminals, journal, agent_sessions),
        }
    }
}

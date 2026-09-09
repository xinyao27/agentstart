mod input;
pub(in crate::rpc) mod protocol;
pub(in crate::rpc) mod protocol_values;

use crate::workspace_session::WorkspaceSessionAuthority;

#[derive(Clone)]
pub(super) struct WorkspaceSessionRpc {
    authority: WorkspaceSessionAuthority,
}

impl WorkspaceSessionRpc {
    pub(super) fn new(authority: WorkspaceSessionAuthority) -> Self {
        Self { authority }
    }
}

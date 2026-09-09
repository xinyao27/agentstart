pub(in crate::rpc) mod protocol;
pub(in crate::rpc) mod protocol_values;

use crate::workspace_space::WorkspaceSpaceAuthority;

#[derive(Clone)]
pub(super) struct WorkspaceSpaceRpc {
    pub(super) authority: WorkspaceSpaceAuthority,
}

impl WorkspaceSpaceRpc {
    pub(super) fn new(authority: WorkspaceSpaceAuthority) -> Self {
        Self { authority }
    }
}

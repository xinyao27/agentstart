mod input;
pub(in crate::rpc) mod protocol;
pub(in crate::rpc) mod protocol_values;

use crate::folder_workspaces::FolderWorkspaceAuthority;

#[derive(Clone)]
pub(crate) struct FolderWorkspaceRpc {
    pub(crate) authority: FolderWorkspaceAuthority,
}

impl FolderWorkspaceRpc {
    pub(crate) fn new(authority: FolderWorkspaceAuthority) -> Self {
        Self { authority }
    }
}

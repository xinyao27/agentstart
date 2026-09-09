mod import_input;
mod input;
pub(super) mod protocol;
mod scan_input;

use crate::project_groups::ProjectGroupAuthority;

#[derive(Clone)]
pub(crate) struct ProjectGroupRpc {
    pub(super) authority: ProjectGroupAuthority,
}

impl ProjectGroupRpc {
    pub(crate) fn new(authority: ProjectGroupAuthority) -> Self {
        Self { authority }
    }
}

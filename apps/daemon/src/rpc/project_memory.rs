pub(in crate::rpc) mod protocol;

use crate::project_memory::ProjectMemoryAuthority;

#[derive(Clone)]
pub(super) struct ProjectMemoryRpc {
    pub(super) memory: ProjectMemoryAuthority,
}

impl ProjectMemoryRpc {
    pub(super) fn new(memory: ProjectMemoryAuthority) -> Self {
        Self { memory }
    }
}

pub(in crate::rpc) mod protocol;

use crate::projects::RemoteProjectResolver;

#[derive(Clone)]
pub(super) struct ProjectContextRpc {
    pub(super) projects: RemoteProjectResolver,
}

impl ProjectContextRpc {
    pub(super) fn new(projects: RemoteProjectResolver) -> Self {
        Self { projects }
    }
}

pub(in crate::rpc) mod protocol;
pub(in crate::rpc) mod protocol_values;

use crate::projects::ProjectCatalog;

#[derive(Clone)]
pub(crate) struct ProjectRpc {
    pub(super) catalog: ProjectCatalog,
}

impl ProjectRpc {
    pub(crate) fn new(catalog: ProjectCatalog) -> Self {
        Self { catalog }
    }
}

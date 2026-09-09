pub(super) mod protocol;

use crate::repository_refs::RepositoryRefs;

#[derive(Clone)]
pub(super) struct RepositoryRefsRpc {
    refs: RepositoryRefs,
}

impl RepositoryRefsRpc {
    pub(super) fn new(refs: RepositoryRefs) -> Self {
        Self { refs }
    }

    pub(super) fn authority(&self) -> RepositoryRefs {
        self.refs.clone()
    }
}

mod input;
pub(super) mod protocol;

use crate::repo_host::RepoHostAuthority;

#[derive(Clone)]
pub(super) struct RepoHostRpc {
    pub(super) authority: RepoHostAuthority,
}

impl RepoHostRpc {
    pub(crate) fn new(authority: RepoHostAuthority) -> Self {
        Self { authority }
    }
}

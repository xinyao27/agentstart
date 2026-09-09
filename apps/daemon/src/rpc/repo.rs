pub(super) mod protocol;
pub(super) mod protocol_mutations;
pub(super) mod protocol_presets;
pub(crate) mod protocol_values;

mod input;

use crate::repositories::RepositoryAuthority;

// Why: the legacy JSON surface for the repo namespace is retired; only the
// protobuf handlers remain, backed by the same repository authority. The
// `input::source_ai` and `input::update` submodules survive because the
// protobuf update handler reuses their exact sanitizers.

#[derive(Clone)]
pub(super) struct RepoRpc {
    repositories: RepositoryAuthority,
}

impl RepoRpc {
    pub(super) fn new(repositories: RepositoryAuthority) -> Self {
        Self { repositories }
    }
}

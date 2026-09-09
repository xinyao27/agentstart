pub(super) mod protocol;
pub(super) mod protocol_values;

use crate::persistence::ArtifactStore;

#[derive(Clone)]
pub(super) struct ArtifactRpc {
    pub(super) store: ArtifactStore,
}

impl ArtifactRpc {
    pub(super) fn new(store: ArtifactStore) -> Self {
        Self { store }
    }
}

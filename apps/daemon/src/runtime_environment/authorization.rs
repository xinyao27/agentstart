use super::RuntimeEnvironmentError;
use super::authority::RuntimeEnvironmentAuthority;

#[derive(Clone)]
pub(crate) struct RuntimeAuthorization {
    authority: RuntimeEnvironmentAuthority,
    peer_id: String,
}

impl RuntimeAuthorization {
    pub(super) fn new(authority: RuntimeEnvironmentAuthority, peer_id: String) -> Self {
        Self { authority, peer_id }
    }

    pub(super) fn belongs_to(&self, authority: &RuntimeEnvironmentAuthority) -> bool {
        self.authority.is_same_authority(authority)
    }

    pub(crate) fn peer_id(&self) -> &str {
        &self.peer_id
    }

    pub(crate) fn is_authorized(&self) -> bool {
        self.authority.peer_is_authorized(&self.peer_id)
    }

    pub(crate) async fn note_seen(&self) -> Result<(), RuntimeEnvironmentError> {
        self.authority.note_peer_seen(&self.peer_id).await
    }
}

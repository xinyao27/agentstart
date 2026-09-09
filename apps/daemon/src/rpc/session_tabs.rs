mod input;
pub(super) mod protocol;
pub(super) mod protocol_values;

use crate::session_tabs::SessionTabsAuthority;

// Why: the legacy JSON METHODS table is retired — every browser and mobile
// caller moved to `SessionTabsService` — but the typed handle stays because
// the protobuf router (`protocol.rs`) publishes through the same authority.
#[derive(Clone)]
pub(super) struct SessionTabsRpc {
    authority: SessionTabsAuthority,
}

impl SessionTabsRpc {
    pub(super) fn new(authority: SessionTabsAuthority) -> Self {
        Self { authority }
    }

    pub(super) fn close_connection(&self, connection_id: &str) {
        self.authority.close_connection(connection_id);
    }
}

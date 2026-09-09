pub(in crate::rpc) mod protocol;
pub(in crate::rpc) mod protocol_values;

use crate::client_events::ClientEventsAuthority;

#[derive(Clone)]
pub(super) struct ClientEventsRpc {
    pub(super) authority: ClientEventsAuthority,
}

impl ClientEventsRpc {
    pub(super) fn new(authority: ClientEventsAuthority) -> Self {
        Self { authority }
    }
}

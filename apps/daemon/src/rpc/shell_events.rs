pub(in crate::rpc) mod protocol;

use crate::shell_events::ShellEventAuthority;

#[derive(Clone)]
pub(super) struct ShellEventsRpc {
    pub(super) authority: ShellEventAuthority,
}

impl ShellEventsRpc {
    pub(super) fn new(authority: ShellEventAuthority) -> Self {
        Self { authority }
    }
}

pub(in crate::rpc) mod protocol;

use crate::host_progress::HostProgressAuthority;

#[derive(Clone)]
pub(super) struct HostProgressRpc {
    pub(super) authority: HostProgressAuthority,
}

impl HostProgressRpc {
    pub(super) fn new(authority: HostProgressAuthority) -> Self {
        Self { authority }
    }
}

pub(in crate::rpc) mod protocol;

use crate::runtime::RuntimeStatus;
use crate::session_tabs::SessionTabsAuthority;

#[derive(Clone)]
pub(super) struct ShellRuntimeRpc {
    pub(super) session_tabs: SessionTabsAuthority,
    pub(super) status: RuntimeStatus,
}

impl ShellRuntimeRpc {
    pub(super) fn new(session_tabs: SessionTabsAuthority, status: RuntimeStatus) -> Self {
        Self {
            session_tabs,
            status,
        }
    }
}

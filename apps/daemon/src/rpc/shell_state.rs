pub(in crate::rpc) mod protocol;
pub(in crate::rpc) mod protocol_values;

use crate::shell_state::ShellStateAuthority;

#[derive(Clone)]
pub(super) struct ShellStateRpc {
    pub(super) state: ShellStateAuthority,
}

impl ShellStateRpc {
    pub(super) fn new(state: ShellStateAuthority) -> Self {
        Self { state }
    }
}

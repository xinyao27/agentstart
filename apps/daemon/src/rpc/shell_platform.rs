pub(super) mod protocol;

use crate::shell_platform::ShellPlatformAuthority;

#[derive(Clone, Copy)]
pub(super) struct ShellPlatformRpc {
    pub(super) authority: ShellPlatformAuthority,
}

impl ShellPlatformRpc {
    pub(super) const fn new(authority: ShellPlatformAuthority) -> Self {
        Self { authority }
    }
}

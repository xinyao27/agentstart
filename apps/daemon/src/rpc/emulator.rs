pub(super) mod protocol;
pub(crate) mod protocol_values;

use crate::emulator::EmulatorAuthority;

// Why: the legacy JSON surface for the emulator namespace (including the
// binary-side-channel frame stream) is retired; only the protobuf handlers
// remain, backed by the same emulator authority.

#[derive(Clone)]
pub(super) struct EmulatorRpc {
    authority: EmulatorAuthority,
}

impl EmulatorRpc {
    pub(super) fn new(authority: EmulatorAuthority) -> Self {
        Self { authority }
    }
}

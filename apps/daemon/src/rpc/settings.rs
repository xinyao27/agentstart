pub(super) mod protocol;
pub(super) mod protocol_values;

use crate::settings::SettingsAuthority;

// Why: the legacy JSON surface for the settings namespace is retired; only the
// protobuf handlers remain, backed by the same settings authority.

#[derive(Clone)]
pub(super) struct SettingsRpc {
    pub(super) authority: SettingsAuthority,
}

impl SettingsRpc {
    pub(super) fn new(authority: SettingsAuthority) -> Self {
        Self { authority }
    }
}

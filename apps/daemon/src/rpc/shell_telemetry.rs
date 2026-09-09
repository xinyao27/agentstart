mod input;
pub(in crate::rpc) mod protocol;

use crate::telemetry::TelemetryAuthority;

#[derive(Clone)]
pub(super) struct ShellTelemetryRpc {
    authority: TelemetryAuthority,
}

impl ShellTelemetryRpc {
    pub(super) fn new(authority: TelemetryAuthority) -> Self {
        Self { authority }
    }
}

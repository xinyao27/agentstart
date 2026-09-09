pub(in crate::rpc) mod protocol;

use crate::preflight::{Preflight, PreflightError, PreflightRequest, PreflightResponse};

// Why: the legacy JSON surface for the preflight namespace is retired; only the
// protobuf handlers remain, backed by the same preflight authority.

#[derive(Clone)]
pub(super) struct PreflightRpc {
    preflight: Preflight,
}

impl PreflightRpc {
    pub(super) fn new(preflight: Preflight) -> Self {
        Self { preflight }
    }

    pub(in crate::rpc) async fn execute(
        &self,
        request: PreflightRequest,
    ) -> Result<PreflightResponse, PreflightError> {
        self.preflight.execute(request).await
    }
}

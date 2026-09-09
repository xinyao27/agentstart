pub(super) mod protocol;
mod request;
mod response;

use serde_json::Value;

use crate::computer::{ComputerAuthority, ComputerError};

#[derive(Clone)]
pub(super) struct ComputerRpc {
    authority: ComputerAuthority,
}

impl ComputerRpc {
    pub(super) fn new(authority: ComputerAuthority) -> Self {
        Self { authority }
    }

    // Why: every protobuf handler in `computer/protocol.rs` reuses this exact
    // JSON-shaped call so validation, provider dispatch, and error codes have
    // one implementation, shared with `ComputerAuthority` directly rather than
    // duplicated per typed rpc.
    pub(super) async fn invoke_typed(
        &self,
        method: &str,
        body: Value,
    ) -> Result<Value, ComputerError> {
        match self.authority.invoke(method, body).await? {
            Some(value) => Ok(value),
            None => Err(ComputerError::domain(
                "",
                format!("computer method {method} is not mounted"),
            )),
        }
    }
}

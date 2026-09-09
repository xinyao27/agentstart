mod input;
pub(in crate::rpc) mod protocol;

use serde_json::{Map, Value};

use crate::ui::{UiAuthority, UiError};

// Why: the legacy JSON surface for the ui namespace is retired; only the
// protobuf handlers remain, backed by the same UI authority.

#[derive(Clone)]
pub(super) struct UiRpc {
    authority: UiAuthority,
}

impl UiRpc {
    pub(super) fn new(authority: UiAuthority) -> Self {
        Self { authority }
    }

    pub(in crate::rpc) fn get_document(&self) -> Value {
        self.authority.get()
    }

    pub(in crate::rpc) fn set_document(
        &self,
        updates: Map<String, Value>,
    ) -> Result<Value, UiError> {
        Ok(self.authority.set(updates))
    }

    pub(in crate::rpc) fn record_feature_interaction(&self, id: &str) -> Result<Value, UiError> {
        self.authority.record_feature_interaction(id)
    }
}

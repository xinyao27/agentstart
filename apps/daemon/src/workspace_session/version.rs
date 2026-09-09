use serde_json::{Map, Value, json};

use super::WorkspaceSessionError;

pub(super) const VERSION_KEY: &str = "workspaceSessionVersion";

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct SessionVersion {
    pub(crate) epoch: String,
    pub(crate) revision: u64,
}

pub(crate) struct SessionSnapshot {
    pub(crate) session: Value,
    pub(crate) version: SessionVersion,
}

impl SessionVersion {
    pub(super) fn load(
        document: &Map<String, Value>,
    ) -> Result<(Self, bool), WorkspaceSessionError> {
        let Some(value) = document.get(VERSION_KEY) else {
            let mut bytes = [0u8; 16];
            getrandom::fill(&mut bytes)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            return Ok((
                Self {
                    epoch: bytes.iter().map(|byte| format!("{byte:02x}")).collect(),
                    revision: 0,
                },
                true,
            ));
        };
        let epoch = value
            .get("epoch")
            .and_then(Value::as_str)
            .filter(|value| value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
            .ok_or(WorkspaceSessionError::InvalidDocument)?;
        let revision = value
            .get("revision")
            .and_then(Value::as_u64)
            .ok_or(WorkspaceSessionError::InvalidDocument)?;
        Ok((
            Self {
                epoch: epoch.to_owned(),
                revision,
            },
            false,
        ))
    }

    pub(super) fn store(&self, document: &mut Map<String, Value>) {
        document.insert(
            VERSION_KEY.to_owned(),
            json!({
                "epoch": self.epoch,
                "revision": self.revision
            }),
        );
    }
}

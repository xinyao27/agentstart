use std::collections::HashSet;

use serde::Deserialize;
use thiserror::Error;

const EMBEDDED_METADATA: &str = include_str!(concat!(env!("OUT_DIR"), "/runtime-metadata.json"));

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMetadata {
    pub schema_version: u32,
    pub protocol: ProtocolCompatibility,
    pub keybindings: Vec<KeybindingDescriptor>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeybindingDescriptor {
    pub id: String,
    pub title: String,
    pub scope: String,
    pub conflict_group: Option<String>,
    #[serde(default)]
    pub allow_bare_keybindings: bool,
    pub default_bindings: KeybindingPlatformBindings,
}

#[derive(Clone, Debug, Deserialize)]
pub struct KeybindingPlatformBindings {
    pub darwin: Vec<String>,
    pub linux: Vec<String>,
    pub win32: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolCompatibility {
    pub version: u32,
    pub min_compatible_client_version: u32,
    pub min_compatible_server_version: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CallerClass {
    Local,
    Mobile,
    Runtime,
}

#[derive(Debug, Error)]
pub enum RuntimeMetadataError {
    #[error("runtime metadata is invalid JSON: {0}")]
    InvalidJson(#[from] serde_json::Error),
    #[error("runtime metadata invariant failed: {0}")]
    InvalidInvariant(String),
}

pub fn embedded_metadata() -> Result<RuntimeMetadata, RuntimeMetadataError> {
    let metadata = serde_json::from_str::<RuntimeMetadata>(EMBEDDED_METADATA)?;
    if metadata.schema_version != 1 {
        return Err(RuntimeMetadataError::InvalidInvariant(
            "unsupported schema version".to_owned(),
        ));
    }
    let mut ids = HashSet::new();
    if metadata.keybindings.is_empty()
        || metadata.keybindings.iter().any(|definition| {
            definition.id.is_empty()
                || definition.title.is_empty()
                || definition.scope.is_empty()
                || !ids.insert(&definition.id)
        })
    {
        return Err(RuntimeMetadataError::InvalidInvariant(
            "keybinding definitions are empty, invalid or duplicated".to_owned(),
        ));
    }
    let protocol = &metadata.protocol;
    if protocol.version == 0
        || protocol.min_compatible_client_version > protocol.version
        || protocol.min_compatible_server_version > protocol.version
    {
        return Err(RuntimeMetadataError::InvalidInvariant(
            "protocol compatibility range is invalid".to_owned(),
        ));
    }
    Ok(metadata)
}

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::{Deserialize, Serialize};

use super::RuntimeEnvironmentError;

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct AuthorityFile {
    pub(super) environments: Vec<StoredEnvironment>,
    pub(super) keypair: StoredKeypair,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) pending_active_environment_cleanup_ids: Vec<String>,
    pub(super) peers: Vec<StoredPeer>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) resolved_legacy_environment_ids: Vec<String>,
    pub(super) version: u8,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct StoredKeypair {
    pub(super) public_key_b64: String,
    pub(super) secret_key_b64: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct StoredPeer {
    pub(super) created_at_unix_ms: i64,
    pub(super) id: String,
    pub(super) last_seen_at_unix_ms: Option<i64>,
    pub(super) name: String,
    pub(super) token_hash_b64: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct StoredEnvironment {
    pub(super) created_at_unix_ms: i64,
    pub(super) endpoints: Vec<StoredEndpoint>,
    pub(super) id: String,
    pub(super) last_used_at_unix_ms: Option<i64>,
    pub(super) name: String,
    pub(super) preferred_endpoint_id: String,
    pub(super) runtime_id: Option<String>,
    pub(super) updated_at_unix_ms: i64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct StoredEndpoint {
    pub(super) endpoint: String,
    pub(super) id: String,
    pub(super) label: String,
    pub(super) pinned_public_key_b64: String,
    pub(super) token: String,
}

#[derive(Clone)]
pub(crate) struct RuntimeEnvironmentSummary {
    pub(crate) created_at_unix_ms: i64,
    pub(crate) endpoints: Vec<RuntimeEnvironmentPublicEndpoint>,
    pub(crate) id: String,
    pub(crate) last_used_at_unix_ms: Option<i64>,
    pub(crate) name: String,
    pub(crate) preferred_endpoint_id: String,
    pub(crate) runtime_id: Option<String>,
    pub(crate) updated_at_unix_ms: i64,
    pub(crate) pairing_required: bool,
}
#[derive(Clone)]
pub(crate) struct RuntimeEnvironmentPublicEndpoint {
    pub(crate) endpoint: String,
    pub(crate) id: String,
    pub(crate) label: String,
}
impl From<RuntimeEnvironmentProfile> for RuntimeEnvironmentSummary {
    fn from(profile: RuntimeEnvironmentProfile) -> Self {
        Self {
            created_at_unix_ms: profile.created_at_unix_ms,
            endpoints: profile
                .endpoints
                .into_iter()
                .map(|endpoint| RuntimeEnvironmentPublicEndpoint {
                    endpoint: endpoint.endpoint,
                    id: endpoint.id,
                    label: endpoint.label,
                })
                .collect(),
            id: profile.id,
            last_used_at_unix_ms: profile.last_used_at_unix_ms,
            name: profile.name,
            preferred_endpoint_id: profile.preferred_endpoint_id,
            runtime_id: profile.runtime_id,
            updated_at_unix_ms: profile.updated_at_unix_ms,
            pairing_required: false,
        }
    }
}

#[derive(Clone)]
pub(crate) struct RuntimeEnvironmentProfile {
    pub(crate) created_at_unix_ms: i64,
    pub(crate) endpoints: Vec<RuntimeEnvironmentEndpoint>,
    pub(crate) id: String,
    pub(crate) last_used_at_unix_ms: Option<i64>,
    pub(crate) name: String,
    pub(crate) preferred_endpoint_id: String,
    pub(crate) runtime_id: Option<String>,
    pub(crate) updated_at_unix_ms: i64,
}

#[derive(Clone)]
pub(crate) struct RuntimeEnvironmentEndpoint {
    pub(crate) endpoint: String,
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) pinned_public_key: [u8; 32],
    pub(crate) token: String,
}

#[derive(Clone)]
pub(crate) struct AuthorizedRuntimePeer {
    pub(crate) created_at_unix_ms: i64,
    pub(crate) id: String,
    pub(crate) last_seen_at_unix_ms: Option<i64>,
    pub(crate) name: String,
}

pub(super) fn public_environment(
    environment: &StoredEnvironment,
) -> Result<RuntimeEnvironmentProfile, RuntimeEnvironmentError> {
    Ok(RuntimeEnvironmentProfile {
        created_at_unix_ms: environment.created_at_unix_ms,
        endpoints: environment
            .endpoints
            .iter()
            .map(|endpoint| {
                Ok(RuntimeEnvironmentEndpoint {
                    endpoint: endpoint.endpoint.clone(),
                    id: endpoint.id.clone(),
                    label: endpoint.label.clone(),
                    pinned_public_key: decode_canonical_32(&endpoint.pinned_public_key_b64)?,
                    token: endpoint.token.clone(),
                })
            })
            .collect::<Result<Vec<_>, RuntimeEnvironmentError>>()?,
        id: environment.id.clone(),
        last_used_at_unix_ms: environment.last_used_at_unix_ms,
        name: environment.name.clone(),
        preferred_endpoint_id: environment.preferred_endpoint_id.clone(),
        runtime_id: environment.runtime_id.clone(),
        updated_at_unix_ms: environment.updated_at_unix_ms,
    })
}

pub(super) fn public_peer(peer: &StoredPeer) -> AuthorizedRuntimePeer {
    AuthorizedRuntimePeer {
        created_at_unix_ms: peer.created_at_unix_ms,
        id: peer.id.clone(),
        last_seen_at_unix_ms: peer.last_seen_at_unix_ms,
        name: peer.name.clone(),
    }
}

pub(super) fn resolve_environment<'a>(
    environments: &'a [StoredEnvironment],
    selector: &str,
) -> Result<&'a StoredEnvironment, RuntimeEnvironmentError> {
    if let Some(environment) = environments
        .iter()
        .find(|environment| environment.id == selector)
    {
        return Ok(environment);
    }
    let mut matches = environments
        .iter()
        .filter(|environment| environment.name == selector);
    let environment = matches
        .next()
        .ok_or_else(|| RuntimeEnvironmentError::EnvironmentNotFound(selector.to_owned()))?;
    if matches.next().is_some() {
        return Err(RuntimeEnvironmentError::EnvironmentAmbiguous(
            selector.to_owned(),
        ));
    }
    Ok(environment)
}

pub(super) fn validate_name(value: &str) -> Result<String, RuntimeEnvironmentError> {
    let name = value.trim();
    if name.is_empty() || name.encode_utf16().count() > 128 || name.chars().any(char::is_control) {
        return Err(RuntimeEnvironmentError::NameInvalid);
    }
    Ok(name.to_owned())
}

pub(super) fn is_valid_legacy_id(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 256 && !value.chars().any(char::is_control)
}

pub(super) fn is_valid_runtime_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 256 && !value.chars().any(char::is_control)
}

pub(super) fn decode_canonical_32(value: &str) -> Result<[u8; 32], RuntimeEnvironmentError> {
    let bytes = BASE64
        .decode(value)
        .map_err(|_| RuntimeEnvironmentError::InvalidState)?;
    let bytes = <[u8; 32]>::try_from(bytes).map_err(|_| RuntimeEnvironmentError::InvalidState)?;
    if BASE64.encode(bytes) != value {
        return Err(RuntimeEnvironmentError::InvalidState);
    }
    Ok(bytes)
}

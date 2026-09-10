use super::{
    RuntimeEnvironmentError,
    records::{
        RuntimeEnvironmentPublicEndpoint, RuntimeEnvironmentSummary, is_valid_legacy_id,
        validate_name,
    },
};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
};
use url::Url;

const FILE_NAME: &str = "agentstart-environments.json";
const MAX_FILE_BYTES: u64 = 1024 * 1024;
const MAX_TOTAL_BYTES: usize = 16 * 1024 * 1024;
const MAX_RECORDS: usize = 1000;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyEnvironment {
    id: String,
    name: String,
    created_at: i64,
    updated_at: i64,
    last_used_at: Option<i64>,
    runtime_id: Option<String>,
    endpoints: Vec<LegacyEndpoint>,
    preferred_endpoint_id: String,
}
#[derive(Deserialize)]
struct LegacyEndpoint {
    id: String,
    label: String,
    endpoint: String,
}

pub(super) fn list(
    root: &Path,
    resolved: &[String],
    current_ids: &HashSet<String>,
) -> Result<Vec<RuntimeEnvironmentSummary>, RuntimeEnvironmentError> {
    let mut records = BTreeMap::<String, ([u8; 32], RuntimeEnvironmentSummary)>::new();
    let mut total = 0usize;
    for path in sources(root)? {
        let Some(bytes) = read(&path)? else {
            continue;
        };
        total = total.saturating_add(bytes.len());
        if total > MAX_TOTAL_BYTES {
            return Err(RuntimeEnvironmentError::StateCapacity);
        }
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| RuntimeEnvironmentError::LegacyInvalid)?;
        if value["version"].as_u64() != Some(1) {
            return Err(RuntimeEnvironmentError::LegacyInvalid);
        }
        let entries = value["environments"]
            .as_array()
            .ok_or(RuntimeEnvironmentError::LegacyInvalid)?;
        if entries.len() > MAX_RECORDS {
            return Err(RuntimeEnvironmentError::StateCapacity);
        }
        for value in entries {
            let record: LegacyEnvironment = serde_json::from_value(value.clone())
                .map_err(|_| RuntimeEnvironmentError::LegacyInvalid)?;
            if resolved.contains(&record.id) {
                continue;
            }
            let digest: [u8; 32] = Sha256::digest(serde_json::to_vec(value)?).into();
            let summary = summary(record)?;
            if current_ids.contains(&summary.id) {
                return Err(RuntimeEnvironmentError::LegacyConflict);
            }
            if let Some((existing, _)) = records.get(&summary.id) {
                if existing != &digest {
                    return Err(RuntimeEnvironmentError::LegacyConflict);
                }
                continue;
            }
            records.insert(summary.id.clone(), (digest, summary));
            if records.len() > MAX_RECORDS {
                return Err(RuntimeEnvironmentError::StateCapacity);
            }
        }
    }
    Ok(records.into_values().map(|(_, summary)| summary).collect())
}
fn sources(root: &Path) -> Result<Vec<PathBuf>, RuntimeEnvironmentError> {
    let mut sources = vec![root.join(FILE_NAME)];
    let profiles = root.join("profiles");
    match fs::symlink_metadata(&profiles) {
        Ok(m) if m.is_dir() && !m.file_type().is_symlink() => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(sources),
        _ => return Err(RuntimeEnvironmentError::LegacyInvalid),
    }
    for (index, entry) in fs::read_dir(profiles)?.enumerate() {
        if index >= 100 {
            return Err(RuntimeEnvironmentError::StateCapacity);
        }
        let entry = entry?;
        if entry.file_type()?.is_symlink() {
            continue;
        }
        if entry.file_type()?.is_dir() {
            sources.push(entry.path().join(FILE_NAME));
        }
    }
    sources.sort();
    Ok(sources)
}
fn read(path: &Path) -> Result<Option<Vec<u8>>, RuntimeEnvironmentError> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > MAX_FILE_BYTES {
        return Err(RuntimeEnvironmentError::LegacyInvalid);
    }
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(RuntimeEnvironmentError::LegacyInvalid);
    }
    Ok(Some(bytes))
}
fn summary(
    record: LegacyEnvironment,
) -> Result<RuntimeEnvironmentSummary, RuntimeEnvironmentError> {
    if !is_valid_legacy_id(&record.id)
        || record.created_at < 0
        || record.updated_at < 0
        || record.last_used_at.is_some_and(|v| v < 0)
        || record.endpoints.is_empty()
        || record.endpoints.len() > 32
    {
        return Err(RuntimeEnvironmentError::LegacyInvalid);
    }
    let name = validate_name(&record.name).map_err(|_| RuntimeEnvironmentError::LegacyInvalid)?;
    let mut ids = HashSet::new();
    let mut endpoints = Vec::new();
    for endpoint in record.endpoints {
        if endpoint.id.is_empty()
            || endpoint.id.len() > 256
            || !ids.insert(endpoint.id.clone())
            || endpoint.label.is_empty()
            || endpoint.label.len() > 256
        {
            return Err(RuntimeEnvironmentError::LegacyInvalid);
        }
        let mut url =
            Url::parse(&endpoint.endpoint).map_err(|_| RuntimeEnvironmentError::LegacyInvalid)?;
        if !matches!(url.scheme(), "ws" | "wss") || url.host_str().is_none() {
            return Err(RuntimeEnvironmentError::LegacyInvalid);
        }
        url.set_username("")
            .map_err(|_| RuntimeEnvironmentError::LegacyInvalid)?;
        url.set_password(None)
            .map_err(|_| RuntimeEnvironmentError::LegacyInvalid)?;
        url.set_query(None);
        url.set_fragment(None);
        endpoints.push(RuntimeEnvironmentPublicEndpoint {
            id: endpoint.id,
            label: endpoint.label,
            endpoint: url.into(),
        });
    }
    if !ids.contains(&record.preferred_endpoint_id) {
        return Err(RuntimeEnvironmentError::LegacyInvalid);
    }
    Ok(RuntimeEnvironmentSummary {
        id: record.id,
        name,
        created_at_unix_ms: record.created_at,
        updated_at_unix_ms: record.updated_at,
        last_used_at_unix_ms: record.last_used_at,
        runtime_id: record.runtime_id,
        preferred_endpoint_id: record.preferred_endpoint_id,
        endpoints,
        pairing_required: true,
    })
}

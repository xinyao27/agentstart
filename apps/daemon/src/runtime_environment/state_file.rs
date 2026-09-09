use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use x25519_dalek::{X25519_BASEPOINT_BYTES, x25519};

use super::RuntimeEnvironmentError;
use super::offer;
use super::records::{
    AuthorityFile, StoredKeypair, decode_canonical_32, is_valid_legacy_id, is_valid_runtime_id,
    validate_name,
};
use crate::transport::secure_file;

const STATE_FILE_NAME: &str = "runtime-environment-authority.json";
const STATE_FILE_VERSION: u8 = 1;
const MAX_STATE_FILE_BYTES: u64 = 1024 * 1024;
const MAX_PROFILE_SOURCES: usize = 100;

pub(super) fn load_or_create(
    root: &Path,
) -> Result<(PathBuf, AuthorityFile), RuntimeEnvironmentError> {
    migrate_profile_state(root)?;
    let path = root.join(STATE_FILE_NAME);
    if path.exists() {
        let metadata = fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() || metadata.len() > MAX_STATE_FILE_BYTES {
            return Err(RuntimeEnvironmentError::InvalidState);
        }
        secure_file::harden_existing_file(&path)?;
        let mut contents = Vec::new();
        fs::File::open(&path)?
            .take(MAX_STATE_FILE_BYTES + 1)
            .read_to_end(&mut contents)?;
        if contents.len() as u64 > MAX_STATE_FILE_BYTES {
            return Err(RuntimeEnvironmentError::InvalidState);
        }
        let file = serde_json::from_slice::<AuthorityFile>(&contents)
            .map_err(|_| RuntimeEnvironmentError::InvalidState)?;
        validate(&file)?;
        return Ok((path, file));
    }
    let secret_key = loop {
        let mut candidate = [0_u8; 32];
        getrandom::fill(&mut candidate)?;
        if candidate != [0_u8; 32] {
            break candidate;
        }
    };
    let file = AuthorityFile {
        environments: Vec::new(),
        keypair: StoredKeypair {
            public_key_b64: BASE64.encode(x25519(secret_key, X25519_BASEPOINT_BYTES)),
            secret_key_b64: BASE64.encode(secret_key),
        },
        pending_active_environment_cleanup_ids: Vec::new(),
        peers: Vec::new(),
        resolved_legacy_environment_ids: Vec::new(),
        version: STATE_FILE_VERSION,
    };
    secure_file::write_json(&path, &file)?;
    Ok((path, file))
}

fn migrate_profile_state(root: &Path) -> Result<(), RuntimeEnvironmentError> {
    let profiles_root = root.join("profiles");
    match fs::symlink_metadata(&profiles_root) {
        Ok(metadata) if metadata.file_type().is_dir() => {}
        Ok(_) => return Err(RuntimeEnvironmentError::InstallationConflict),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
    }
    let entries = fs::read_dir(&profiles_root)?;
    let target = root.join(STATE_FILE_NAME);
    let mut canonical = read_migration_value(&target)?;
    let mut sources = Vec::new();
    for (entry_index, entry) in entries.enumerate() {
        let entry = entry?;
        if entry_index >= MAX_PROFILE_SOURCES {
            return Err(RuntimeEnvironmentError::StateCapacity);
        }
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let source = entry.path().join(STATE_FILE_NAME);
        let Some(value) = read_migration_value(&source)? else {
            continue;
        };
        if canonical
            .as_ref()
            .is_some_and(|existing| existing != &value)
        {
            return Err(RuntimeEnvironmentError::InstallationConflict);
        }
        canonical = Some(value);
        sources.push(source);
    }
    let Some(canonical) = canonical else {
        return Ok(());
    };
    let file = serde_json::from_value::<AuthorityFile>(canonical.clone())
        .map_err(|_| RuntimeEnvironmentError::InvalidState)?;
    validate(&file)?;
    if !target.exists() {
        secure_file::write_json(&target, &canonical)?;
    }
    for source in sources {
        match fs::remove_file(source) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

fn read_migration_value(root: &Path) -> Result<Option<serde_json::Value>, RuntimeEnvironmentError> {
    let metadata = match fs::symlink_metadata(root) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if !metadata.file_type().is_file() || metadata.len() > MAX_STATE_FILE_BYTES {
        return Err(RuntimeEnvironmentError::InvalidState);
    }
    let mut contents = Vec::new();
    fs::File::open(root)?
        .take(MAX_STATE_FILE_BYTES + 1)
        .read_to_end(&mut contents)?;
    if contents.len() as u64 > MAX_STATE_FILE_BYTES {
        return Err(RuntimeEnvironmentError::InvalidState);
    }
    serde_json::from_slice(&contents)
        .map(Some)
        .map_err(|_| RuntimeEnvironmentError::InvalidState)
}

pub(super) fn serialize(file: &AuthorityFile) -> Result<Vec<u8>, RuntimeEnvironmentError> {
    validate(file)?;
    let mut contents = serde_json::to_string_pretty(file)?;
    contents.push('\n');
    if contents.len() as u64 > MAX_STATE_FILE_BYTES {
        return Err(RuntimeEnvironmentError::StateCapacity);
    }
    Ok(contents.into_bytes())
}

fn validate(file: &AuthorityFile) -> Result<(), RuntimeEnvironmentError> {
    if file.version != STATE_FILE_VERSION {
        return Err(RuntimeEnvironmentError::InvalidState);
    }
    let secret_key = decode_canonical_32(&file.keypair.secret_key_b64)?;
    let public_key = decode_canonical_32(&file.keypair.public_key_b64)?;
    if secret_key == [0_u8; 32]
        || public_key == [0_u8; 32]
        || public_key != x25519(secret_key, X25519_BASEPOINT_BYTES)
    {
        return Err(RuntimeEnvironmentError::InvalidState);
    }
    for environment in &file.environments {
        if validate_name(&environment.name)? != environment.name
            || (!is_canonical_id(&environment.id)
                && !file
                    .resolved_legacy_environment_ids
                    .contains(&environment.id))
            || environment.created_at_unix_ms < 0
            || environment.updated_at_unix_ms < environment.created_at_unix_ms
            || environment.endpoints.len() != 1
            || environment.preferred_endpoint_id != format!("ws-{}", environment.id)
            || environment.runtime_id.is_some() != environment.last_used_at_unix_ms.is_some()
            || environment
                .runtime_id
                .as_deref()
                .is_some_and(|id| !is_valid_runtime_id(id))
            || environment.last_used_at_unix_ms.is_some_and(|last_used| {
                last_used < environment.created_at_unix_ms
                    || last_used > environment.updated_at_unix_ms
            })
        {
            return Err(RuntimeEnvironmentError::InvalidState);
        }
        for endpoint in &environment.endpoints {
            offer::validate_endpoint(&endpoint.endpoint)?;
            let pinned_public_key = decode_canonical_32(&endpoint.pinned_public_key_b64)?;
            if endpoint.id != environment.preferred_endpoint_id
                || endpoint.label.trim().is_empty()
                || endpoint.label.trim() != endpoint.label
                || endpoint.label.encode_utf16().count() > 128
                || endpoint.label.chars().any(char::is_control)
                || pinned_public_key == [0_u8; 32]
                || endpoint.token.is_empty()
                || endpoint.token.len() > 256
                || !endpoint.token.is_ascii()
            {
                return Err(RuntimeEnvironmentError::InvalidState);
            }
        }
        if has_duplicates(environment.endpoints.iter().map(|endpoint| &endpoint.id)) {
            return Err(RuntimeEnvironmentError::InvalidState);
        }
    }
    if has_duplicates(file.environments.iter().map(|environment| &environment.id))
        || has_duplicates(
            file.environments
                .iter()
                .map(|environment| &environment.name),
        )
        || has_duplicates(file.peers.iter().map(|peer| &peer.id))
        || has_duplicates(file.pending_active_environment_cleanup_ids.iter())
        || has_duplicates(file.resolved_legacy_environment_ids.iter())
        || file.resolved_legacy_environment_ids.len() > 1000
        || file
            .resolved_legacy_environment_ids
            .iter()
            .any(|id| !is_valid_legacy_id(id))
    {
        return Err(RuntimeEnvironmentError::InvalidState);
    }
    if file
        .pending_active_environment_cleanup_ids
        .iter()
        .any(|id| {
            (!is_canonical_id(id) && !file.resolved_legacy_environment_ids.contains(id))
                || file
                    .environments
                    .iter()
                    .any(|environment| environment.id == *id)
        })
    {
        return Err(RuntimeEnvironmentError::InvalidState);
    }
    for peer in &file.peers {
        if validate_name(&peer.name)? != peer.name
            || !is_canonical_id(&peer.id)
            || peer.created_at_unix_ms < 0
            || peer
                .last_seen_at_unix_ms
                .is_some_and(|last_seen| last_seen < peer.created_at_unix_ms)
        {
            return Err(RuntimeEnvironmentError::InvalidState);
        }
        let hash = BASE64
            .decode(&peer.token_hash_b64)
            .map_err(|_| RuntimeEnvironmentError::InvalidState)?;
        if peer.id.is_empty() || hash.len() != 32 || BASE64.encode(&hash) != peer.token_hash_b64 {
            return Err(RuntimeEnvironmentError::InvalidState);
        }
    }
    Ok(())
}

fn is_canonical_id(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn has_duplicates<'a>(mut values: impl Iterator<Item = &'a String>) -> bool {
    let mut seen = std::collections::HashSet::new();
    values.any(|value| !seen.insert(value))
}

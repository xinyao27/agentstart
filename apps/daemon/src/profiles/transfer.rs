use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value};
use thiserror::Error;

use super::index::{ProfileError, ensure_profile_directory, validate_known};

const STATE_FILE: &str = "agentstart-data.json";
const MAX_STATE_BYTES: u64 = 128 * 1024 * 1024;
const OWNER_RECORDS: &[&str] = &[
    "tabsByWorktree",
    "openFilesByWorktree",
    "browserTabsByWorktree",
    "activeBrowserTabIdByWorktree",
    "activeTabTypeByWorktree",
    "activeTabIdByWorktree",
    "unifiedTabs",
    "tabGroups",
    "tabGroupLayouts",
    "activeGroupIdByWorktree",
    "lastVisitedAtByWorktreeId",
    "defaultTerminalTabsAppliedByWorktreeId",
    "activeFileIdByWorktree",
];

#[derive(Debug, Error)]
pub(crate) enum TransferError {
    #[error(transparent)]
    Profile(#[from] ProfileError),
    #[error("matching_agentstart_profile_transfer")]
    MatchingProfiles,
    #[error("unknown_source_repo")]
    UnknownRepo,
    #[error("invalid_agentstart_profile_project_transfer")]
    Invalid,
    #[error("profile transfer I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("profile transfer JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("profile transfer random identifier failed: {0}")]
    Random(#[from] getrandom::Error),
}

pub(crate) fn project(
    root: &Path,
    source_profile_id: &str,
    target_profile_id: &str,
    repo_id: &str,
    mode: &str,
) -> Result<Value, TransferError> {
    validate_known(root, source_profile_id)?;
    validate_known(root, target_profile_id)?;
    if source_profile_id == target_profile_id {
        return Err(TransferError::MatchingProfiles);
    }
    if !matches!(mode, "move" | "copy") || repo_id.trim().is_empty() {
        return Err(TransferError::Invalid);
    }
    let source_path = ensure_profile_directory(root, source_profile_id)?.join(STATE_FILE);
    let target_path = ensure_profile_directory(root, target_profile_id)?.join(STATE_FILE);
    let mut source = read_state(&source_path)?;
    let mut target = read_state(&target_path)?;
    let source_repos = array(&source, "repos");
    let source_repo = source_repos
        .iter()
        .find(|repo| repo.get("id").and_then(Value::as_str) == Some(repo_id))
        .cloned()
        .ok_or(TransferError::UnknownRepo)?;
    let target_repos = array(&target, "repos");
    if let Some(duplicate) = target_repos
        .iter()
        .find(|repo| physical_key(repo) == physical_key(&source_repo))
    {
        return Ok(serde_json::json!({
            "status": "duplicate-target",
            "sourceProfileId": source_profile_id,
            "targetProfileId": target_profile_id,
            "sourceRepoId": repo_id,
            "duplicateRepoId": duplicate.get("id").and_then(Value::as_str).unwrap_or_default()
        }));
    }
    let target_repo_id = if mode == "move"
        && !target_repos
            .iter()
            .any(|repo| repo.get("id").and_then(Value::as_str) == Some(repo_id))
    {
        repo_id.to_owned()
    } else {
        random_uuid()?
    };
    let mut target_repo = source_repo
        .as_object()
        .cloned()
        .ok_or(TransferError::Invalid)?;
    target_repo.insert("id".to_owned(), Value::String(target_repo_id.clone()));
    target_repo.insert("projectGroupId".to_owned(), Value::Null);
    target_repo.remove("projectGroupOrder");
    if mode == "copy" {
        target_repo.insert("addedAt".to_owned(), Value::from(now_millis()));
    }
    append_array(&mut target, "repos", Value::Object(target_repo.clone()));
    transfer_repo_state(
        &source,
        &mut target,
        repo_id,
        &target_repo_id,
        mode == "move",
    );
    if mode == "move" {
        remove_source_repo(&mut source, repo_id);
    }
    write_state(&target_path, &target)?;
    if mode == "move" {
        write_state(&source_path, &source)?;
    }
    Ok(serde_json::json!({
        "status": "transferred",
        "mode": mode,
        "sourceProfileId": source_profile_id,
        "targetProfileId": target_profile_id,
        "sourceRepoId": repo_id,
        "targetRepoId": target_repo_id,
        "targetProjectId": project_id(&Value::Object(target_repo))
    }))
}

fn transfer_repo_state(
    source: &Map<String, Value>,
    target: &mut Map<String, Value>,
    old_id: &str,
    new_id: &str,
    include_sessions: bool,
) {
    transfer_named_record(
        source,
        target,
        "sparsePresetsByRepo",
        old_id,
        new_id,
        old_id,
        new_id,
    );
    for name in [
        "worktreeMeta",
        "worktreeLineageById",
        "workspaceLineageByChildKey",
    ] {
        transfer_matching_record(source, target, name, old_id, new_id);
    }
    if include_sessions {
        transfer_session(source, target, "workspaceSession", old_id, new_id);
        transfer_host_sessions(source, target, old_id, new_id);
    }
}

fn transfer_named_record(
    source: &Map<String, Value>,
    target: &mut Map<String, Value>,
    name: &str,
    source_key: &str,
    target_key: &str,
    old_id: &str,
    new_id: &str,
) {
    let Some(value) = source
        .get(name)
        .and_then(Value::as_object)
        .and_then(|map| map.get(source_key))
    else {
        return;
    };
    if let Some(target) = object_mut(target, name) {
        target.insert(target_key.to_owned(), rekey_value(value, old_id, new_id));
    }
}

fn transfer_matching_record(
    source: &Map<String, Value>,
    target: &mut Map<String, Value>,
    name: &str,
    old_id: &str,
    new_id: &str,
) {
    let Some(values) = source.get(name).and_then(Value::as_object) else {
        return;
    };
    for (key, value) in values {
        if (owner_belongs(key, old_id) || value_mentions_owner(value, old_id))
            && let Some(target) = object_mut(target, name)
        {
            target.insert(
                rekey_owner(key, old_id, new_id),
                rekey_value(value, old_id, new_id),
            );
        }
    }
}

fn transfer_session(
    source: &Map<String, Value>,
    target: &mut Map<String, Value>,
    name: &str,
    old_id: &str,
    new_id: &str,
) {
    let Some(source_session) = source.get(name).and_then(Value::as_object) else {
        return;
    };
    let target_session = target
        .entry(name.to_owned())
        .or_insert_with(|| Value::Object(Map::new()));
    let Some(target_session) = target_session.as_object_mut() else {
        return;
    };
    for record_name in OWNER_RECORDS {
        transfer_matching_record(source_session, target_session, record_name, old_id, new_id);
    }
    if let Some(active) = source_session
        .get("activeWorktreeIdsOnShutdown")
        .and_then(Value::as_array)
    {
        let moved = active
            .iter()
            .filter_map(Value::as_str)
            .filter(|id| owner_belongs(id, old_id))
            .map(|id| Value::String(rekey_owner(id, old_id, new_id)))
            .collect();
        target_session.insert(
            "activeWorktreeIdsOnShutdown".to_owned(),
            Value::Array(moved),
        );
    }
}

fn transfer_host_sessions(
    source: &Map<String, Value>,
    target: &mut Map<String, Value>,
    old_id: &str,
    new_id: &str,
) {
    let Some(sessions) = source
        .get("workspaceSessionsByHostId")
        .and_then(Value::as_object)
    else {
        return;
    };
    let Some(target_sessions) = object_mut(target, "workspaceSessionsByHostId") else {
        return;
    };
    for (host, session) in sessions {
        let source_container = Map::from_iter([("session".to_owned(), session.clone())]);
        let mut transferred = Map::new();
        transfer_session(
            &source_container,
            &mut transferred,
            "session",
            old_id,
            new_id,
        );
        if let Some(incoming) = transferred.remove("session") {
            let existing = target_sessions
                .entry(host.clone())
                .or_insert_with(|| Value::Object(Map::new()));
            merge_session(existing, &incoming);
        }
    }
}

fn merge_session(existing: &mut Value, incoming: &Value) {
    let Some(incoming) = incoming.as_object() else {
        return;
    };
    if !existing.is_object() {
        *existing = Value::Object(Map::new());
    }
    let Some(existing) = existing.as_object_mut() else {
        return;
    };
    for (key, value) in incoming {
        if let Some(record) = value.as_object() {
            let target = existing
                .entry(key.clone())
                .or_insert_with(|| Value::Object(Map::new()));
            if !target.is_object() {
                *target = Value::Object(Map::new());
            }
            if let Some(target) = target.as_object_mut() {
                target.extend(record.clone());
            }
        } else if key == "activeWorktreeIdsOnShutdown" {
            let target = existing
                .entry(key.clone())
                .or_insert_with(|| Value::Array(Vec::new()));
            if let (Some(target), Some(values)) = (target.as_array_mut(), value.as_array()) {
                target.extend(values.iter().cloned());
            }
        } else {
            existing.entry(key.clone()).or_insert_with(|| value.clone());
        }
    }
}

fn remove_source_repo(source: &mut Map<String, Value>, repo_id: &str) {
    source.insert(
        "repos".to_owned(),
        Value::Array(
            array(source, "repos")
                .into_iter()
                .filter(|repo| repo.get("id").and_then(Value::as_str) != Some(repo_id))
                .collect(),
        ),
    );
    if let Some(presets) = source
        .get_mut("sparsePresetsByRepo")
        .and_then(Value::as_object_mut)
    {
        presets.remove(repo_id);
    }
    for name in [
        "worktreeMeta",
        "worktreeLineageById",
        "workspaceLineageByChildKey",
    ] {
        if let Some(record) = source.get_mut(name).and_then(Value::as_object_mut) {
            record.retain(|key, value| {
                !owner_belongs(key, repo_id) && !value_mentions_owner(value, repo_id)
            });
        }
    }
}

fn read_state(path: &Path) -> Result<Map<String, Value>, TransferError> {
    let Some(bytes) = super::leaf_file::read(path, MAX_STATE_BYTES)? else {
        return Ok(Map::new());
    };
    serde_json::from_slice::<Value>(&bytes)?
        .as_object()
        .cloned()
        .ok_or(TransferError::Invalid)
}

fn write_state(path: &Path, state: &Map<String, Value>) -> Result<(), TransferError> {
    let _ = path.parent().ok_or(TransferError::Invalid)?;
    let payload = serde_json::to_vec_pretty(state)?;
    super::leaf_file::write(path, &payload)?;
    Ok(())
}

fn append_array(document: &mut Map<String, Value>, key: &str, value: Value) {
    let values = document
        .entry(key.to_owned())
        .or_insert_with(|| Value::Array(Vec::new()));
    if let Some(values) = values.as_array_mut() {
        values.push(value);
    }
}

fn array(document: &Map<String, Value>, key: &str) -> Vec<Value> {
    document
        .get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn object_mut<'a>(
    document: &'a mut Map<String, Value>,
    key: &str,
) -> Option<&'a mut Map<String, Value>> {
    let value = document
        .entry(key.to_owned())
        .or_insert_with(|| Value::Object(Map::new()));
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    value.as_object_mut()
}

fn physical_key(repo: &Value) -> String {
    let path = repo.get("path").and_then(Value::as_str).unwrap_or_default();
    let path = path.trim_end_matches(['/', '\\']).replace('\\', "/");
    let path = if cfg!(target_os = "windows") {
        path.to_lowercase()
    } else {
        path
    };
    format!(
        "{}\0{}\0{path}",
        repo.get("executionHostId")
            .and_then(Value::as_str)
            .unwrap_or("local"),
        repo.get("connectionId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
    )
}

fn owner_belongs(value: &str, repo_id: &str) -> bool {
    let value = value.strip_prefix("worktree:").unwrap_or(value);
    value == repo_id || value.starts_with(&format!("{repo_id}::"))
}

fn rekey_owner(value: &str, old_id: &str, new_id: &str) -> String {
    let (prefix, value) = value
        .strip_prefix("worktree:")
        .map_or(("", value), |value| ("worktree:", value));
    if value == old_id {
        return format!("{prefix}{new_id}");
    }
    value.strip_prefix(&format!("{old_id}::")).map_or_else(
        || format!("{prefix}{value}"),
        |suffix| format!("{prefix}{new_id}::{suffix}"),
    )
}

fn value_mentions_owner(value: &Value, repo_id: &str) -> bool {
    match value {
        Value::String(value) => owner_belongs(value, repo_id),
        Value::Array(values) => values
            .iter()
            .any(|value| value_mentions_owner(value, repo_id)),
        Value::Object(values) => values
            .values()
            .any(|value| value_mentions_owner(value, repo_id)),
        _ => false,
    }
}

fn rekey_value(value: &Value, old_id: &str, new_id: &str) -> Value {
    match value {
        Value::String(value) if owner_belongs(value, old_id) => {
            Value::String(rekey_owner(value, old_id, new_id))
        }
        Value::Array(values) => Value::Array(
            values
                .iter()
                .map(|value| rekey_value(value, old_id, new_id))
                .collect(),
        ),
        Value::Object(values) => Value::Object(
            values
                .iter()
                .map(|(key, value)| {
                    (
                        rekey_owner(key, old_id, new_id),
                        rekey_value(value, old_id, new_id),
                    )
                })
                .collect(),
        ),
        _ => value.clone(),
    }
}

fn project_id(repo: &Value) -> String {
    if let (Some(owner), Some(name)) = (
        repo.pointer("/upstream/owner").and_then(Value::as_str),
        repo.pointer("/upstream/repo").and_then(Value::as_str),
    ) {
        return format!(
            "github:{}/{}",
            owner.trim().to_lowercase(),
            name.trim().to_lowercase()
        );
    }
    if let Some(key) = repo
        .pointer("/gitRemoteIdentity/canonicalKey")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    {
        return format!("git:{}", key.trim());
    }
    format!(
        "repo:{}",
        repo.get("id").and_then(Value::as_str).unwrap_or_default()
    )
}

fn random_uuid() -> Result<String, TransferError> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes)?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    ))
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|value| i64::try_from(value.as_millis()).ok())
        .unwrap_or(i64::MAX)
}

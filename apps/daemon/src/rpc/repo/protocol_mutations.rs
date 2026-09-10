use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::repo_service_create_response::Result as CreateResult;
use agentstart_protocol::runtime::v1::{
    RepoExternalWorktreeVisibility, RepoForgeRemotePreference, RepoForkSyncMode, RepoKind,
    RepoReorderStatus, RepoServiceCloneRequest, RepoServiceCloneResponse, RepoServiceCreateRequest,
    RepoServiceCreateResponse, RepoServiceCreateSuccess, RepoServiceGitAvailableRequest,
    RepoServiceGitAvailableResponse, RepoServiceReorderRequest, RepoServiceReorderResponse,
    RepoServiceRmRequest, RepoServiceRmResponse, RepoServiceUpdateRequest,
    RepoServiceUpdateResponse, RepoUpdateFields, repo_nullable_double,
    repo_nullable_source_control_ai,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::{Map, Value, json};

use super::RepoRpc;
use super::input::source_ai;
use super::input::update::{normalize_badge, sanitize_repo_icon};
use super::protocol::{repository_status, status};
use super::protocol_values::{
    hook_settings_value, icon_value, nullable_string_update_value, protocol_repo,
    source_control_ai_value, upstream_value,
};

pub(in crate::rpc) async fn clone(rpc: &RepoRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceCloneRequest>(payload)?;
    non_negative_revision(request.expected_revision)?;
    if request.url.is_empty() {
        return Err(status(StatusCode::InvalidArgument, "Missing clone URL"));
    }
    if request.destination.is_empty() {
        return Err(status(
            StatusCode::InvalidArgument,
            "Missing clone destination",
        ));
    }
    let result = rpc
        .repositories
        .clone_repo(request.expected_revision, request.url, request.destination)
        .await
        .map_err(repository_status)?;
    Ok(encode(&RepoServiceCloneResponse {
        repo: Some(protocol_repo(result.repo)?),
        revision: result.revision,
    }))
}

pub(in crate::rpc) async fn create(rpc: &RepoRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceCreateRequest>(payload)?;
    non_negative_revision(request.expected_revision)?;
    if request.parent_path.is_empty() {
        return Err(status(StatusCode::InvalidArgument, "Missing parent path"));
    }
    if request.name.is_empty() {
        return Err(status(StatusCode::InvalidArgument, "Missing repo name"));
    }
    let kind = project_kind(request.kind)?;
    let value = rpc
        .repositories
        .create(
            request.expected_revision,
            request.parent_path,
            request.name,
            kind,
        )
        .await
        .map_err(repository_status)?;
    if let Some(error) = value.get("error").and_then(Value::as_str) {
        return Ok(encode(&RepoServiceCreateResponse {
            result: Some(CreateResult::Error(error.to_owned())),
        }));
    }
    let repo = value.get("repo").cloned().ok_or_else(|| {
        status(
            StatusCode::Internal,
            "Repository creation response is missing repo",
        )
    })?;
    let revision = value
        .get("revision")
        .and_then(Value::as_i64)
        .ok_or_else(|| {
            status(
                StatusCode::Internal,
                "Repository creation response is missing revision",
            )
        })?;
    Ok(encode(&RepoServiceCreateResponse {
        result: Some(CreateResult::Success(RepoServiceCreateSuccess {
            repo: Some(protocol_repo(repo)?),
            revision,
        })),
    }))
}

pub(in crate::rpc) async fn git_available(
    rpc: &RepoRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<RepoServiceGitAvailableRequest>(payload)?;
    Ok(encode(&RepoServiceGitAvailableResponse {
        available: rpc.repositories.git_available().await,
    }))
}

pub(in crate::rpc) async fn reorder(rpc: &RepoRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceReorderRequest>(payload)?;
    non_negative_revision(request.expected_revision)?;
    let result = rpc
        .repositories
        .reorder(request.expected_revision, request.ordered_ids)
        .await
        .map_err(repository_status)?;
    let status = match result.status {
        crate::repositories::ReorderStatus::Applied => RepoReorderStatus::Applied,
        crate::repositories::ReorderStatus::Rejected => RepoReorderStatus::Rejected,
    };
    Ok(encode(&RepoServiceReorderResponse {
        revision: result.revision,
        status: status as i32,
    }))
}

pub(in crate::rpc) async fn rm(rpc: &RepoRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceRmRequest>(payload)?;
    non_negative_revision(request.expected_revision)?;
    if request.repo.is_empty() {
        return Err(status(StatusCode::InvalidArgument, "Missing repo selector"));
    }
    let result = rpc
        .repositories
        .remove(request.expected_revision, request.repo)
        .await
        .map_err(repository_status)?;
    Ok(encode(&RepoServiceRmResponse {
        removed: result.removed,
        revision: result.revision,
    }))
}

pub(in crate::rpc) async fn update(rpc: &RepoRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceUpdateRequest>(payload)?;
    non_negative_revision(request.expected_revision)?;
    if request.repo.is_empty() {
        return Err(status(StatusCode::InvalidArgument, "Missing repo selector"));
    }
    let updates = update_fields_map(request.updates.unwrap_or_default())?;
    let result = rpc
        .repositories
        .update(request.expected_revision, request.repo, updates)
        .await
        .map_err(repository_status)?;
    Ok(encode(&RepoServiceUpdateResponse {
        repo: Some(protocol_repo(result.repo)?),
        revision: result.revision,
    }))
}

/// Converts the wire's presence-tracked `RepoUpdateFields` into the
/// `Map<String, Value>` partial update `RepositoryAuthority::update` expects,
/// reusing the exact sanitizers (`sanitize_repo_icon`, `normalize_badge`,
/// `source_ai::normalize`) the legacy JSON path calls so a value accepted or
/// silently dropped by one surface is accepted or dropped by both.
fn update_fields_map(fields: RepoUpdateFields) -> Result<Map<String, Value>, Status> {
    let mut output = Map::new();
    if let Some(value) = fields.display_name.and_then(non_empty) {
        output.insert("displayName".to_owned(), Value::String(value));
    }
    if let Some(value) = fields.badge_color
        && let Some(normalized) = normalize_badge(&Value::String(value))
    {
        output.insert("badgeColor".to_owned(), Value::String(normalized));
    }
    if let Some(icon) = fields.repo_icon {
        let raw = icon_value(icon).map_err(|_| invalid("Repository icon is invalid"))?;
        if let Some(sanitized) = sanitize_repo_icon(&raw) {
            output.insert("repoIcon".to_owned(), sanitized);
        }
    }
    if let Some(upstream) = fields.upstream {
        let raw =
            upstream_value(upstream).map_err(|_| invalid("Repository upstream is invalid"))?;
        output.insert("upstream".to_owned(), non_empty_upstream(raw)?);
    }
    if let Some(settings) = fields.hook_settings {
        let raw = hook_settings_value(settings)
            .map_err(|_| invalid("Repository hook settings are invalid"))?;
        output.insert("hookSettings".to_owned(), raw);
    }
    if let Some(value) = fields.worktree_base_ref.and_then(non_empty) {
        output.insert("worktreeBaseRef".to_owned(), Value::String(value));
    }
    if let Some(value) = fields.worktree_base_path.and_then(non_empty) {
        output.insert("worktreeBasePath".to_owned(), Value::String(value));
    }
    if let Some(kind) = fields.kind {
        output.insert("kind".to_owned(), json!(strict_kind(kind)?));
    }
    if let Some(values) = fields.symlink_paths {
        output.insert("symlinkPaths".to_owned(), json!(values.values));
    }
    if let Some(value) = fields.forge_remote_preference {
        output.insert(
            "forgeRemotePreference".to_owned(),
            json!(strict_forge_remote_preference(value)?),
        );
    }
    if let Some(value) = fields.fork_sync_mode {
        output.insert(
            "forkSyncMode".to_owned(),
            json!(strict_fork_sync_mode(value)?),
        );
    }
    if let Some(value) = fields.external_worktree_visibility {
        output.insert(
            "externalWorktreeVisibility".to_owned(),
            json!(strict_external_worktree_visibility(value)?),
        );
    }
    if let Some(value) = fields.external_worktree_visibility_prompt_dismissed_at {
        output.insert(
            "externalWorktreeVisibilityPromptDismissedAt".to_owned(),
            json!(finite(value)?),
        );
    }
    if let Some(values) = fields.external_worktree_inbox_baseline_paths {
        output.insert(
            "externalWorktreeInboxBaselinePaths".to_owned(),
            json!(values.values),
        );
    }
    if let Some(values) = fields.imported_external_worktree_paths {
        output.insert(
            "importedExternalWorktreePaths".to_owned(),
            json!(values.values),
        );
    }
    if let Some(value) = fields.external_worktree_discovery_suppressed_at {
        output.insert(
            "externalWorktreeDiscoverySuppressedAt".to_owned(),
            nullable_finite(value)?,
        );
    }
    if let Some(value) = fields.project_group_id
        && let Some(value) = nullable_string_update_value(value)?
    {
        output.insert("projectGroupId".to_owned(), value);
    }
    if let Some(value) = fields.project_group_order
        && value.is_finite()
    {
        output.insert("projectGroupOrder".to_owned(), json!(value));
    }
    if let Some(overrides) = fields.source_control_ai {
        match overrides.value {
            Some(repo_nullable_source_control_ai::Value::Null(_)) => {
                output.insert("sourceControlAi".to_owned(), Value::Null);
            }
            Some(repo_nullable_source_control_ai::Value::Overrides(overrides)) => {
                let raw = source_control_ai_value(overrides)
                    .map_err(|_| invalid("Repository source control AI overrides are invalid"))?;
                if let Some(normalized) = source_ai::normalize(&raw) {
                    output.insert("sourceControlAi".to_owned(), normalized);
                }
            }
            None => {
                return Err(invalid(
                    "Repository source control AI overrides are missing",
                ));
            }
        }
    }
    Ok(output)
}

fn non_empty_upstream(raw: Value) -> Result<Value, Status> {
    if raw.is_null() {
        return Ok(Value::Null);
    }
    let owner = raw
        .get("owner")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());
    let repo = raw
        .get("repo")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty());
    match (owner, repo) {
        (Some(owner), Some(repo)) => Ok(json!({ "owner": owner, "repo": repo })),
        _ => Err(invalid(
            "Repository upstream owner and repo must not be empty",
        )),
    }
}

fn strict_kind(value: i32) -> Result<&'static str, Status> {
    match RepoKind::try_from(value) {
        Ok(RepoKind::Git) => Ok("git"),
        Ok(RepoKind::Folder) => Ok("folder"),
        _ => Err(invalid("Repo kind must be git or folder")),
    }
}

fn strict_forge_remote_preference(value: i32) -> Result<&'static str, Status> {
    match RepoForgeRemotePreference::try_from(value) {
        Ok(RepoForgeRemotePreference::Auto) => Ok("auto"),
        Ok(RepoForgeRemotePreference::Upstream) => Ok("upstream"),
        Ok(RepoForgeRemotePreference::Origin) => Ok("origin"),
        _ => Err(invalid(
            "Forge remote preference must be auto, upstream, or origin",
        )),
    }
}

fn strict_fork_sync_mode(value: i32) -> Result<&'static str, Status> {
    match RepoForkSyncMode::try_from(value) {
        Ok(RepoForkSyncMode::Ask) => Ok("ask"),
        Ok(RepoForkSyncMode::SafeAuto) => Ok("safe-auto"),
        Ok(RepoForkSyncMode::Off) => Ok("off"),
        _ => Err(invalid("Fork sync mode must be ask, safe-auto, or off")),
    }
}

fn strict_external_worktree_visibility(value: i32) -> Result<&'static str, Status> {
    match RepoExternalWorktreeVisibility::try_from(value) {
        Ok(RepoExternalWorktreeVisibility::Hide) => Ok("hide"),
        Ok(RepoExternalWorktreeVisibility::Show) => Ok("show"),
        _ => Err(invalid("External worktree visibility must be hide or show")),
    }
}

fn finite(value: f64) -> Result<f64, Status> {
    if value.is_finite() {
        Ok(value)
    } else {
        Err(invalid(
            "External worktree visibility prompt dismissal must be a finite number",
        ))
    }
}

fn nullable_finite(
    value: agentstart_protocol::runtime::v1::RepoNullableDouble,
) -> Result<Value, Status> {
    match value.value {
        Some(repo_nullable_double::Value::Null(_)) => Ok(Value::Null),
        Some(repo_nullable_double::Value::Number(value)) if value.is_finite() => Ok(json!(value)),
        Some(repo_nullable_double::Value::Number(_)) => Err(invalid(
            "External worktree discovery suppression must be a finite number",
        )),
        None => Err(invalid(
            "External worktree discovery suppression value is missing",
        )),
    }
}

fn non_empty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}

fn invalid(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn non_negative_revision(value: i64) -> Result<(), Status> {
    if value < 0 {
        Err(invalid("expected_revision must be non-negative"))
    } else {
        Ok(())
    }
}

pub(super) fn project_kind(value: i32) -> Result<crate::projects::ProjectKind, Status> {
    match RepoKind::try_from(value) {
        Ok(RepoKind::Unspecified | RepoKind::Git) => Ok(crate::projects::ProjectKind::Git),
        Ok(RepoKind::Folder) => Ok(crate::projects::ProjectKind::Folder),
        Err(_) => Err(invalid("Repo kind is invalid")),
    }
}

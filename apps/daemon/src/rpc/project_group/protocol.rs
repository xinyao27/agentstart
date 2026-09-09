use serde_json::Value;
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::project_group_service_event::Event;
use yiru_protocol::runtime::v1::{
    ProjectGroup, ProjectGroupCreatedFrom, ProjectGroupImportMode, ProjectGroupImportStatus,
    ProjectGroupNestedRepoCandidate, ProjectGroupRepo, ProjectGroupScanProgress,
    ProjectGroupServiceCancelNestedScanRequest, ProjectGroupServiceCancelNestedScanResponse,
    ProjectGroupServiceCreateRequest, ProjectGroupServiceDeleteRequest,
    ProjectGroupServiceDeleteResponse, ProjectGroupServiceEvent, ProjectGroupServiceGroupResponse,
    ProjectGroupServiceImportNestedRequest, ProjectGroupServiceImportNestedResponse,
    ProjectGroupServiceImportProjectResult, ProjectGroupServiceListRequest,
    ProjectGroupServiceListResponse, ProjectGroupServiceMoveProjectRequest,
    ProjectGroupServiceMoveProjectResponse, ProjectGroupServiceNullableGroupResponse,
    ProjectGroupServiceScanNestedRequest, ProjectGroupServiceScanNestedResponse,
    ProjectGroupServiceSubscribeEventsRequest, ProjectGroupServiceUpdateRequest,
    ProjectGroupSubscribeReady, RepoExternalWorktreeVisibility, RepoKind,
    project_group_service_update_fields,
};
use yiru_protocol::transport::{decode, encode};

use crate::project_groups::{
    CancelNestedRepoScanResult, NestedRepoScan, NestedRepoScanError, ProjectGroupImportError,
    ProjectGroupImportResult, ProjectGroupImportStatus as AuthorityImportStatus,
    ProjectGroupMoveProjectResult, RuntimeRepo,
};
use crate::projects::{GitRemoteIdentity, ProjectKind, ProjectWorktreeVisibility};
use crate::rpc::protocol_call::ProtocolCallContext;

use super::ProjectGroupRpc;
use super::import_input::parse_import;
use super::input::{parse_create, parse_delete, parse_move_project, parse_update};
use super::scan_input::{parse_cancel, parse_scan};

pub(in crate::rpc) async fn list(rpc: &ProjectGroupRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    decode::<ProjectGroupServiceListRequest>(payload)?;
    let result = rpc.authority.list().await.map_err(catalog_status)?;
    Ok(encode(&ProjectGroupServiceListResponse {
        groups: result.groups.into_iter().map(protocol_group).collect(),
        revision: result.revision,
    }))
}

pub(in crate::rpc) async fn create(
    rpc: &ProjectGroupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectGroupServiceCreateRequest>(payload)?;
    let input = parse_create(Some(&create_value(request)?)).map_err(input_status)?;
    let result = rpc.authority.create(input).await.map_err(catalog_status)?;
    Ok(encode(&ProjectGroupServiceGroupResponse {
        group: Some(protocol_group(result.group)),
        revision: result.revision,
    }))
}

pub(in crate::rpc) async fn update(
    rpc: &ProjectGroupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectGroupServiceUpdateRequest>(payload)?;
    let input = parse_update(Some(&update_value(request)?)).map_err(input_status)?;
    let result = rpc.authority.update(input).await.map_err(catalog_status)?;
    Ok(encode(&ProjectGroupServiceNullableGroupResponse {
        group: result.group.map(protocol_group),
        revision: result.revision,
    }))
}

pub(in crate::rpc) async fn delete(
    rpc: &ProjectGroupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectGroupServiceDeleteRequest>(payload)?;
    let input = parse_delete(Some(&delete_value(request)?)).map_err(input_status)?;
    let result = rpc.authority.delete(input).await.map_err(catalog_status)?;
    Ok(encode(&ProjectGroupServiceDeleteResponse {
        deleted: result.deleted,
        revision: result.revision,
    }))
}

pub(in crate::rpc) async fn move_project(
    rpc: &ProjectGroupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectGroupServiceMoveProjectRequest>(payload)?;
    let input = parse_move_project(Some(&move_project_value(request)?)).map_err(input_status)?;
    let result = rpc
        .authority
        .move_project(input)
        .await
        .map_err(catalog_status)?;
    Ok(encode(&project_group_move_response(result)))
}

pub(in crate::rpc) async fn scan_nested(
    rpc: &ProjectGroupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectGroupServiceScanNestedRequest>(payload)?;
    let input = parse_scan(Some(&scan_value(request)?)).map_err(input_status)?;
    let scan = rpc
        .authority
        .scan_nested(input.path, input.scan_id, input.options)
        .await
        .map_err(scan_status)?;
    Ok(encode(&protocol_scan(&scan)))
}

pub(in crate::rpc) async fn cancel_nested_scan(
    rpc: &ProjectGroupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectGroupServiceCancelNestedScanRequest>(payload)?;
    let scan_id = parse_cancel(Some(&cancel_value(request)?)).map_err(input_status)?;
    Ok(encode(&project_group_cancel_response(
        rpc.authority.cancel_nested(&scan_id),
    )))
}

pub(in crate::rpc) async fn import_nested(
    rpc: &ProjectGroupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectGroupServiceImportNestedRequest>(payload)?;
    let input = parse_import(Some(&import_value(request)?)).map_err(input_status)?;
    let result = rpc
        .authority
        .import_nested(input)
        .await
        .map_err(import_status)?;
    Ok(encode(&protocol_import(result)?))
}

/// Streams nested-scan progress until the authority drops the subscriber.
/// Cancellation, the deadline, or a closed connection end the stream by
/// dropping this future, like the other daemon-owned server streams.
pub(in crate::rpc) async fn subscribe_events(
    rpc: &ProjectGroupRpc,
    payload: &[u8],
    connection_id: Option<&str>,
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    decode::<ProjectGroupServiceSubscribeEventsRequest>(payload)?;
    let mut subscription = rpc.authority.subscribe(connection_id);
    while let Some(event) = subscription.next().await {
        let event = match event {
            crate::project_groups::ScanSubscriptionEvent::Ready { subscription_id } => {
                Event::Ready(ProjectGroupSubscribeReady { subscription_id })
            }
            crate::project_groups::ScanSubscriptionEvent::Progress { scan_id, scan } => {
                Event::Progress(ProjectGroupScanProgress {
                    scan_id,
                    scan: Some(protocol_scan(&scan)),
                })
            }
        };
        context
            .send_stream_payload(encode(&ProjectGroupServiceEvent { event: Some(event) }))
            .await?;
    }
    Ok(())
}

fn create_value(request: ProjectGroupServiceCreateRequest) -> Result<Value, Status> {
    let object = serde_json::Map::from_iter([
        (
            "expectedRevision".to_owned(),
            Value::from(request.expected_revision),
        ),
        ("name".to_owned(), Value::String(request.name)),
    ]);
    let mut value = Value::Object(object);
    insert_optional(&mut value, "parentPath", request.parent_path);
    insert_optional(&mut value, "parentGroupId", request.parent_group_id);
    insert_optional(&mut value, "connectionId", request.connection_id);
    if let Some(created_from) = request.created_from {
        let created_from = ProjectGroupCreatedFrom::try_from(created_from)
            .map_err(|_| invalid_argument("Project group created-from value is invalid"))?;
        let database_value = match created_from {
            ProjectGroupCreatedFrom::FolderScan => "folder-scan",
            ProjectGroupCreatedFrom::Manual => "manual",
            ProjectGroupCreatedFrom::Migration => "migration",
            ProjectGroupCreatedFrom::Unspecified => {
                return Err(invalid_argument(
                    "Project group created-from value is invalid",
                ));
            }
        };
        value["createdFrom"] = Value::String(database_value.to_owned());
    }
    Ok(value)
}

fn update_value(request: ProjectGroupServiceUpdateRequest) -> Result<Value, Status> {
    let updates = request
        .updates
        .ok_or_else(|| invalid_argument("Project group updates must be provided"))?;
    let mut updates_value = Value::Object(serde_json::Map::new());
    insert_optional(&mut updates_value, "name", updates.name);
    if let Some(is_collapsed) = updates.is_collapsed {
        updates_value["isCollapsed"] = Value::Bool(is_collapsed);
    }
    if let Some(tab_order) = updates.tab_order {
        updates_value["tabOrder"] = Value::from(tab_order);
    }
    if let Some(color) = updates.color {
        let color = match color.value {
            Some(project_group_service_update_fields::nullable_color::Value::Null(_)) => {
                Value::Null
            }
            Some(project_group_service_update_fields::nullable_color::Value::Text(text)) => {
                Value::String(text)
            }
            None => {
                return Err(invalid_argument(
                    "Project group color must be a string or null",
                ));
            }
        };
        updates_value["color"] = color;
    }
    Ok(Value::Object(serde_json::Map::from_iter([
        (
            "expectedRevision".to_owned(),
            Value::from(request.expected_revision),
        ),
        ("groupId".to_owned(), Value::String(request.group_id)),
        ("updates".to_owned(), updates_value),
    ])))
}

fn delete_value(request: ProjectGroupServiceDeleteRequest) -> Result<Value, Status> {
    Ok(Value::Object(serde_json::Map::from_iter([
        (
            "expectedRevision".to_owned(),
            Value::from(request.expected_revision),
        ),
        ("groupId".to_owned(), Value::String(request.group_id)),
    ])))
}

fn move_project_value(request: ProjectGroupServiceMoveProjectRequest) -> Result<Value, Status> {
    let mut value = Value::Object(serde_json::Map::from_iter([
        (
            "expectedRevision".to_owned(),
            Value::from(request.expected_revision),
        ),
        ("repo".to_owned(), Value::String(request.repo)),
    ]));
    insert_optional(&mut value, "groupId", request.group_id);
    if let Some(order) = request.order {
        value["order"] = Value::from(order);
    }
    Ok(value)
}

fn scan_value(request: ProjectGroupServiceScanNestedRequest) -> Result<Value, Status> {
    let mut value = Value::Object(serde_json::Map::from_iter([(
        "path".to_owned(),
        Value::String(request.path),
    )]));
    insert_optional(&mut value, "scanId", request.scan_id);
    if let Some(options) = request.options {
        let mut options_value = Value::Object(serde_json::Map::new());
        if let Some(max_depth) = options.max_depth {
            options_value["maxDepth"] = Value::from(max_depth);
        }
        if let Some(max_repos) = options.max_repos {
            options_value["maxRepos"] = Value::from(max_repos);
        }
        if let Some(timeout_ms) = options.timeout_ms {
            options_value["timeoutMs"] = Value::from(timeout_ms);
        }
        value["options"] = options_value;
    }
    Ok(value)
}

fn cancel_value(request: ProjectGroupServiceCancelNestedScanRequest) -> Result<Value, Status> {
    Ok(Value::Object(serde_json::Map::from_iter([(
        "scanId".to_owned(),
        Value::String(request.scan_id),
    )])))
}

fn import_value(request: ProjectGroupServiceImportNestedRequest) -> Result<Value, Status> {
    let mode = match ProjectGroupImportMode::try_from(request.mode) {
        Ok(ProjectGroupImportMode::Group) => "group",
        Ok(ProjectGroupImportMode::Separate) => "separate",
        _ => return Err(invalid_argument("Project group import mode is invalid")),
    };
    let mut value = Value::Object(serde_json::Map::from_iter([
        (
            "expectedRevision".to_owned(),
            Value::from(request.expected_revision),
        ),
        ("parentPath".to_owned(), Value::String(request.parent_path)),
        ("groupName".to_owned(), Value::String(request.group_name)),
        (
            "projectPaths".to_owned(),
            Value::Array(
                request
                    .project_paths
                    .into_iter()
                    .map(Value::String)
                    .collect(),
            ),
        ),
        ("mode".to_owned(), Value::String(mode.to_owned())),
    ]));
    insert_optional(&mut value, "scanId", request.scan_id);
    Ok(value)
}

fn protocol_group(group: crate::project_groups::ProjectGroup) -> ProjectGroup {
    ProjectGroup {
        id: group.id,
        name: group.name,
        is_collapsed: group.is_collapsed,
        tab_order: group.tab_order,
        created_at: group.created_at,
        updated_at: group.updated_at,
        created_from: protocol_created_from(group.created_from) as i32,
        color: group.color,
        connection_id: group.connection_id,
        parent_group_id: group.parent_group_id,
        parent_path: group.parent_path,
    }
}

fn protocol_created_from(
    created_from: crate::project_groups::ProjectGroupCreatedFrom,
) -> ProjectGroupCreatedFrom {
    match created_from {
        crate::project_groups::ProjectGroupCreatedFrom::FolderScan => {
            ProjectGroupCreatedFrom::FolderScan
        }
        crate::project_groups::ProjectGroupCreatedFrom::Manual => ProjectGroupCreatedFrom::Manual,
        crate::project_groups::ProjectGroupCreatedFrom::Migration => {
            ProjectGroupCreatedFrom::Migration
        }
    }
}

fn protocol_scan(scan: &NestedRepoScan) -> ProjectGroupServiceScanNestedResponse {
    ProjectGroupServiceScanNestedResponse {
        selected_path: scan.selected_path.clone(),
        selected_path_kind: scan.selected_path_kind.to_owned(),
        repos: scan
            .repos
            .iter()
            .map(|candidate| ProjectGroupNestedRepoCandidate {
                path: candidate.path.clone(),
                display_name: candidate.display_name.clone(),
                depth: candidate.depth as u32,
            })
            .collect(),
        max_depth: scan.max_depth as u32,
        max_repos: scan.max_repos as u32,
        duration_ms: scan.duration_ms,
        stopped: scan.stopped,
        timed_out: scan.timed_out,
        truncated: scan.truncated,
        timeout_ms: scan.timeout_ms.map(|value| value as i64),
    }
}

fn protocol_import(
    result: ProjectGroupImportResult,
) -> Result<ProjectGroupServiceImportNestedResponse, Status> {
    let projects = result
        .projects
        .into_iter()
        .map(|project| {
            Ok(ProjectGroupServiceImportProjectResult {
                path: project.path,
                status: protocol_import_status(project.status)? as i32,
                project_id: project.project_id,
                error: project.error.map(str::to_owned),
            })
        })
        .collect::<Result<Vec<_>, Status>>()?;
    Ok(ProjectGroupServiceImportNestedResponse {
        revision: result.revision,
        imported_count: result.imported_count as u32,
        already_known_count: result.already_known_count as u32,
        failed_count: result.failed_count as u32,
        projects,
        group: result.group.map(protocol_group),
    })
}

fn protocol_import_status(
    status: AuthorityImportStatus,
) -> Result<ProjectGroupImportStatus, Status> {
    match status {
        AuthorityImportStatus::AlreadyKnown => Ok(ProjectGroupImportStatus::AlreadyKnown),
        AuthorityImportStatus::Failed => Ok(ProjectGroupImportStatus::Failed),
        AuthorityImportStatus::Imported => Ok(ProjectGroupImportStatus::Imported),
    }
}

fn project_group_move_response(
    result: ProjectGroupMoveProjectResult,
) -> ProjectGroupServiceMoveProjectResponse {
    ProjectGroupServiceMoveProjectResponse {
        repo: Some(protocol_runtime_repo(result.repo)),
        revision: result.revision,
    }
}

fn protocol_runtime_repo(repo: RuntimeRepo) -> ProjectGroupRepo {
    ProjectGroupRepo {
        id: repo.id,
        path: repo.path,
        display_name: repo.display_name,
        badge_color: repo.badge_color,
        execution_host_id: repo.execution_host_id,
        added_at: repo.added_at,
        kind: protocol_project_kind(repo.kind) as i32,
        external_worktree_visibility: protocol_visibility(repo.external_worktree_visibility) as i32,
        project_group_id: repo.project_group_id,
        project_group_order: repo.project_group_order,
        git_remote_identity: repo.git_remote_identity.map(protocol_remote_identity),
    }
}

fn protocol_remote_identity(
    identity: GitRemoteIdentity,
) -> yiru_protocol::runtime::v1::RepoGitRemoteIdentity {
    yiru_protocol::runtime::v1::RepoGitRemoteIdentity {
        canonical_key: identity.canonical_key,
        remote_name: identity.remote_name,
        remote_url: identity.remote_url,
    }
}

fn project_group_cancel_response(
    result: CancelNestedRepoScanResult,
) -> ProjectGroupServiceCancelNestedScanResponse {
    ProjectGroupServiceCancelNestedScanResponse {
        cancelled: result.cancelled,
    }
}

fn protocol_project_kind(kind: ProjectKind) -> RepoKind {
    match kind {
        ProjectKind::Git => RepoKind::Git,
        ProjectKind::Folder => RepoKind::Folder,
    }
}

fn protocol_visibility(visibility: ProjectWorktreeVisibility) -> RepoExternalWorktreeVisibility {
    match visibility {
        ProjectWorktreeVisibility::Hide => RepoExternalWorktreeVisibility::Hide,
        ProjectWorktreeVisibility::Show => RepoExternalWorktreeVisibility::Show,
    }
}

fn insert_optional(object: &mut Value, field: &str, value: Option<String>) {
    if let Some(value) = value {
        object[field] = Value::String(value);
    }
}

// Why: revision conflicts are the legacy surface's one structured catalog
// error (`workspaceRevisionConflict` with expected/actual/scope), so they map
// to a precondition failure carrying that shape while everything else stays a
// generic internal failure like the legacy dispatcher.
fn catalog_status(error: crate::projects::ProjectCatalogError) -> Status {
    if let crate::projects::ProjectCatalogError::RevisionConflict {
        actual_revision,
        expected_revision,
        scope,
    } = &error
    {
        return revision_conflict(*actual_revision, *expected_revision, scope);
    }
    match error {
        crate::projects::ProjectCatalogError::WorkerUnavailable => {
            status(StatusCode::Unavailable, "Project catalog is unavailable")
        }
        _ => status(StatusCode::Internal, "Project catalog operation failed"),
    }
}

fn import_status(error: ProjectGroupImportError) -> Status {
    match error {
        ProjectGroupImportError::Catalog(catalog) => catalog_status(catalog),
        ProjectGroupImportError::Scan(scan) => scan_status(scan),
        _ => status(StatusCode::Internal, "Project group import failed"),
    }
}

fn scan_status(_error: NestedRepoScanError) -> Status {
    status(StatusCode::Internal, "Nested repository scan failed")
}

fn input_status(_error: super::input::ProjectGroupInputFailure) -> Status {
    status(
        StatusCode::InvalidArgument,
        "Project group input validation failed",
    )
}

fn revision_conflict(actual: i64, expected: i64, scope: &str) -> Status {
    status(
        StatusCode::FailedPrecondition,
        &format!("workspaceRevisionConflict: expected {expected}, actual {actual}, scope {scope}"),
    )
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

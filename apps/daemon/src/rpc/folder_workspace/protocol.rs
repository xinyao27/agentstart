use serde_json::{Map, Value, json};
use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::folder_workspace_nullable_text::Value as NullableTextValue;
use agentstart_protocol::runtime::v1::folder_workspace_service_update_fields::nullable_linked_review::Value as LinkedReviewUpdateValue;
use agentstart_protocol::runtime::v1::{
    FolderWorkspaceLinkedReview, FolderWorkspacePathScope,
    FolderWorkspacePathStatus as ProtocolPathStatus,
    FolderWorkspacePathStatusReason as ProtocolPathStatusReason,
    FolderWorkspaceReviewKind as ProtocolReviewKind,
    FolderWorkspaceReviewProvider as ProtocolReviewProvider, FolderWorkspaceServiceCreateRequest,
    FolderWorkspaceServiceDeleteRequest, FolderWorkspaceServiceDeleteResponse,
    FolderWorkspaceServiceGetPathStatusRequest, FolderWorkspaceServiceListRequest,
    FolderWorkspaceServiceListResponse, FolderWorkspaceServiceNullableResultResponse,
    FolderWorkspaceServicePathStatusResponse, FolderWorkspaceServiceResultResponse,
    FolderWorkspaceServiceUpdateRequest,
};
use agentstart_protocol::transport::{decode, encode};

use crate::folder_workspaces::{
    FolderWorkspaceDeleteResult, FolderWorkspaceError, FolderWorkspaceListResult,
    FolderWorkspacePathStatus, FolderWorkspaceResult,
};

use super::FolderWorkspaceRpc;
use super::input::{parse_create, parse_delete, parse_path_status, parse_update};
use super::protocol_values::{
    folder_workspace as protocol_folder_workspace, nullable_folder_workspace,
};

pub(in crate::rpc) async fn list(
    rpc: &FolderWorkspaceRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<FolderWorkspaceServiceListRequest>(payload)?;
    let FolderWorkspaceListResult {
        folder_workspaces,
        revision,
    } = rpc.authority.list().await.map_err(authority_status)?;
    Ok(encode(&FolderWorkspaceServiceListResponse {
        folder_workspaces: folder_workspaces
            .iter()
            .map(protocol_folder_workspace)
            .collect::<Vec<_>>(),
        revision,
    }))
}

pub(in crate::rpc) async fn create(
    rpc: &FolderWorkspaceRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FolderWorkspaceServiceCreateRequest>(payload)?;
    let input = parse_create(Some(&create_input(request)?))
        .map_err(|_| invalid_argument("Input validation failed"))?;
    let FolderWorkspaceResult {
        folder_workspace,
        revision,
    } = rpc
        .authority
        .create(input)
        .await
        .map_err(authority_status)?;
    Ok(encode(&FolderWorkspaceServiceResultResponse {
        folder_workspace: Some(protocol_folder_workspace(&folder_workspace)),
        revision,
    }))
}

pub(in crate::rpc) async fn update(
    rpc: &FolderWorkspaceRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FolderWorkspaceServiceUpdateRequest>(payload)?;
    let input = parse_update(Some(&update_input(request)?))
        .map_err(|_| invalid_argument("Input validation failed"))?;
    let result = rpc
        .authority
        .update(input)
        .await
        .map_err(authority_status)?;
    Ok(encode(&FolderWorkspaceServiceNullableResultResponse {
        folder_workspace: result
            .folder_workspace
            .as_ref()
            .map(nullable_folder_workspace),
        revision: result.revision,
    }))
}

pub(in crate::rpc) async fn delete(
    rpc: &FolderWorkspaceRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FolderWorkspaceServiceDeleteRequest>(payload)?;
    let input = parse_delete(Some(&delete_input(request)))
        .map_err(|_| invalid_argument("Input validation failed"))?;
    let FolderWorkspaceDeleteResult { deleted, revision } = rpc
        .authority
        .delete(input)
        .await
        .map_err(authority_status)?;
    Ok(encode(&FolderWorkspaceServiceDeleteResponse {
        deleted,
        revision,
    }))
}

pub(in crate::rpc) async fn get_path_status(
    rpc: &FolderWorkspaceRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FolderWorkspaceServiceGetPathStatusRequest>(payload)?;
    let scope = parse_path_status(Some(&path_status_input(request)?))
        .map_err(|_| invalid_argument("Input validation failed"))?;
    let FolderWorkspacePathStatus {
        exists,
        path,
        reason,
    } = rpc
        .authority
        .path_status(scope)
        .await
        .map_err(authority_status)?;
    Ok(encode(&FolderWorkspaceServicePathStatusResponse {
        status: Some(ProtocolPathStatus {
            path,
            exists,
            reason: reason.map(protocol_reason).map(|reason| reason as i32),
        }),
    }))
}

// Why: the typed requests render into exactly the legacy JSON input shapes and
// reuse the legacy parsers, so both transports validate with one set of rules
// and cannot drift.
fn create_input(request: FolderWorkspaceServiceCreateRequest) -> Result<Value, Status> {
    let mut object = Map::from_iter([
        (
            "expectedRevision".to_owned(),
            Value::from(request.expected_revision),
        ),
        (
            "projectGroupId".to_owned(),
            Value::String(request.project_group_id),
        ),
    ]);
    insert_optional(&mut object, "name", request.name);
    insert_optional(&mut object, "folderPath", request.folder_path);
    insert_optional(&mut object, "connectionId", request.connection_id);
    insert_optional(&mut object, "createdWithAgent", request.created_with_agent);
    insert_optional(
        &mut object,
        "pendingFirstAgentMessageRename",
        request.pending_first_agent_message_rename,
    );
    if let Some(review) = request.linked_review {
        object.insert(
            "linkedReview".to_owned(),
            linked_review_value(Some(review))?,
        );
    }
    Ok(Value::Object(object))
}

fn update_input(request: FolderWorkspaceServiceUpdateRequest) -> Result<Value, Status> {
    let mut updates = Map::new();
    if let Some(fields) = request.updates {
        insert_optional(&mut updates, "name", fields.name);
        insert_optional(&mut updates, "comment", fields.comment);
        insert_optional(&mut updates, "folderPath", fields.folder_path);
        insert_optional(&mut updates, "workspaceStatus", fields.workspace_status);
        insert_optional(&mut updates, "createdWithAgent", fields.created_with_agent);
        insert_optional(&mut updates, "manualOrder", fields.manual_order);
        insert_optional(&mut updates, "sortOrder", fields.sort_order);
        insert_optional(&mut updates, "lastActivityAt", fields.last_activity_at);
        insert_optional(&mut updates, "isArchived", fields.is_archived);
        insert_optional(&mut updates, "isPinned", fields.is_pinned);
        insert_optional(&mut updates, "isUnread", fields.is_unread);
        insert_optional(
            &mut updates,
            "pendingFirstAgentMessageRename",
            fields.pending_first_agent_message_rename,
        );
        if let Some(linked_review) = fields.linked_review {
            updates.insert(
                "linkedReview".to_owned(),
                match linked_review.value {
                    Some(LinkedReviewUpdateValue::Null(true)) => Value::Null,
                    Some(LinkedReviewUpdateValue::Review(review)) => {
                        linked_review_value(Some(review))?
                    }
                    _ => {
                        return Err(invalid_argument(
                            "Linked review update must set null or a review",
                        ));
                    }
                },
            );
        }
        if let Some(first_error) = fields.first_agent_message_rename_error {
            updates.insert(
                "firstAgentMessageRenameError".to_owned(),
                match first_error.value {
                    Some(NullableTextValue::Null(true)) => Value::Null,
                    Some(NullableTextValue::Text(text)) => Value::String(text),
                    _ => {
                        return Err(invalid_argument(
                            "Rename error update must set null or a message",
                        ));
                    }
                },
            );
        }
    }
    Ok(json!({
        "expectedRevision": request.expected_revision,
        "folderWorkspaceId": request.folder_workspace_id,
        "updates": updates,
    }))
}

fn delete_input(request: FolderWorkspaceServiceDeleteRequest) -> Value {
    json!({
        "expectedRevision": request.expected_revision,
        "folderWorkspaceId": request.folder_workspace_id,
    })
}

fn path_status_input(request: FolderWorkspaceServiceGetPathStatusRequest) -> Result<Value, Status> {
    match request.scope() {
        FolderWorkspacePathScope::Path => {
            let path = required_field(request.path, "path")?;
            Ok(json!({ "scope": "path", "path": path }))
        }
        FolderWorkspacePathScope::ProjectGroup => {
            let project_group_id = required_field(request.project_group_id, "projectGroupId")?;
            Ok(json!({ "scope": "project-group", "projectGroupId": project_group_id }))
        }
        FolderWorkspacePathScope::FolderWorkspace => {
            let folder_workspace_id =
                required_field(request.folder_workspace_id, "folderWorkspaceId")?;
            Ok(json!({ "scope": "folder-workspace", "folderWorkspaceId": folder_workspace_id }))
        }
        FolderWorkspacePathScope::Unspecified => Err(invalid_argument(
            "Path status scope must name a path, project group, or folder workspace",
        )),
    }
}

fn linked_review_value(review: Option<FolderWorkspaceLinkedReview>) -> Result<Value, Status> {
    let Some(review) = review else {
        return Ok(Value::Null);
    };
    let provider = match review.provider() {
        ProtocolReviewProvider::Github => "github",
        ProtocolReviewProvider::Unspecified => {
            return Err(invalid_argument("Linked review provider is invalid"));
        }
    };
    let review_kind = match review.kind() {
        ProtocolReviewKind::PullRequest => "pr",
        ProtocolReviewKind::Unspecified => {
            return Err(invalid_argument("Linked review type is invalid"));
        }
    };
    Ok(json!({
        "provider": provider,
        "type": review_kind,
        "number": review.number,
        "title": review.title,
        "url": review.url,
        "repoId": review.repo_id,
    }))
}

fn insert_optional<T: Into<Value>>(object: &mut Map<String, Value>, key: &str, value: Option<T>) {
    if let Some(value) = value {
        object.insert(key.to_owned(), value.into());
    }
}

fn required_field(value: Option<String>, field: &str) -> Result<String, Status> {
    value
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| invalid_argument(format!("Missing {field}")))
}

fn protocol_reason(reason: &'static str) -> ProtocolPathStatusReason {
    match reason {
        "missing" => ProtocolPathStatusReason::Missing,
        "not-directory" => ProtocolPathStatusReason::NotDirectory,
        _ => ProtocolPathStatusReason::Unavailable,
    }
}

fn authority_status(error: FolderWorkspaceError) -> Status {
    status(StatusCode::Internal, &error.to_string())
}

fn invalid_argument(message: impl Into<String>) -> Status {
    status(StatusCode::InvalidArgument, &message.into())
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

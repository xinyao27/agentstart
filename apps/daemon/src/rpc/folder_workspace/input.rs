mod review;
mod update;

use serde_json::{Map, Value, json};

use crate::folder_workspaces::{FolderWorkspaceCreate, FolderWorkspaceDelete, PathStatusScope};
use crate::rpc::zod_input::{
    InputIssues, PathSegment, parse_boolean, parse_integer, path_json, require_object,
};

pub(super) fn parse_update(
    body: Option<&Value>,
) -> Result<crate::folder_workspaces::FolderWorkspaceUpdate, FolderWorkspaceInputFailure> {
    update::parse_update(body)
}

#[derive(Debug)]
pub(super) struct FolderWorkspaceInputFailure;

pub(super) fn parse_create(
    body: Option<&Value>,
) -> Result<FolderWorkspaceCreate, FolderWorkspaceInputFailure> {
    let object = require(body)?;
    let mut issues = InputIssues::new();
    let expected_revision = revision(object, &mut issues);
    let project_group_id = required(
        object,
        "projectGroupId",
        "Missing project group id",
        &mut issues,
    );
    let name = optional_string(object.get("name"));
    let folder_path = optional_nullable_string(object.get("folderPath")).flatten();
    let connection_id = optional_nullable_string(object.get("connectionId")).flatten();
    let linked_review = match object.get("linkedReview") {
        None | Some(Value::Null) => None,
        Some(value) => review::parse(value, &[PathSegment::field("linkedReview")], &mut issues),
    };
    let created_with_agent = review::agent(
        object.get("createdWithAgent"),
        &[PathSegment::field("createdWithAgent")],
        &mut issues,
    );
    let pending = optional_boolean(
        object.get("pendingFirstAgentMessageRename"),
        &[PathSegment::field("pendingFirstAgentMessageRename")],
        &mut issues,
    );
    match (expected_revision, project_group_id) {
        (Some(expected_revision), Some(project_group_id)) if issues.is_empty() => {
            Ok(FolderWorkspaceCreate {
                connection_id,
                created_with_agent,
                expected_revision,
                folder_path,
                linked_review,
                name,
                pending_first_agent_message_rename: pending,
                project_group_id,
            })
        }
        _ => Err(FolderWorkspaceInputFailure::new(issues)),
    }
}

pub(super) fn parse_delete(
    body: Option<&Value>,
) -> Result<FolderWorkspaceDelete, FolderWorkspaceInputFailure> {
    let object = require(body)?;
    let mut issues = InputIssues::new();
    let expected_revision = revision(object, &mut issues);
    let folder_workspace_id = required(
        object,
        "folderWorkspaceId",
        "Missing folder workspace id",
        &mut issues,
    );
    match (expected_revision, folder_workspace_id) {
        (Some(expected_revision), Some(folder_workspace_id)) if issues.is_empty() => {
            Ok(FolderWorkspaceDelete {
                expected_revision,
                folder_workspace_id,
            })
        }
        _ => Err(FolderWorkspaceInputFailure::new(issues)),
    }
}

pub(super) fn parse_path_status(
    body: Option<&Value>,
) -> Result<PathStatusScope, FolderWorkspaceInputFailure> {
    let object = require(body)?;
    let mut issues = InputIssues::new();
    let scope = match object.get("scope").and_then(Value::as_str) {
        Some("folder-workspace") => required(
            object,
            "folderWorkspaceId",
            "Missing folder workspace id",
            &mut issues,
        )
        .map(PathStatusScope::FolderWorkspace),
        Some("project-group") => required(
            object,
            "projectGroupId",
            "Missing project group id",
            &mut issues,
        )
        .map(PathStatusScope::ProjectGroup),
        Some("path") => {
            required(object, "path", "Missing folder path", &mut issues).map(PathStatusScope::Path)
        }
        _ => {
            issues.push(json!({
                "code":"invalid_union","errors":[],"note":"No matching discriminator",
                "discriminator":"scope","options":["folder-workspace","project-group","path"],
                "path":["scope"],
                "message":"Invalid discriminator value. Expected 'folder-workspace' | 'project-group' | 'path'"
            }));
            None
        }
    };
    scope
        .filter(|_| issues.is_empty())
        .ok_or_else(|| FolderWorkspaceInputFailure::new(issues))
}

fn revision(object: &Map<String, Value>, issues: &mut InputIssues) -> Option<i64> {
    let path = [PathSegment::field("expectedRevision")];
    let value = parse_integer(object.get("expectedRevision"), &path, false, None, issues);
    if value.is_some_and(|value| value < 0) {
        issues.push(json!({"origin":"number","code":"too_small","minimum":0,"inclusive":true,"path":path_json(&path),"message":"Too small: expected number to be >=0"}));
    }
    value.filter(|value| *value >= 0)
}

fn required(
    object: &Map<String, Value>,
    field: &'static str,
    message: &'static str,
    issues: &mut InputIssues,
) -> Option<String> {
    required_at(
        object.get(field),
        &[PathSegment::field(field)],
        message,
        issues,
    )
}

fn required_at(
    value: Option<&Value>,
    path: &[PathSegment],
    message: &'static str,
    issues: &mut InputIssues,
) -> Option<String> {
    let value = value.and_then(Value::as_str).unwrap_or_default();
    if !value.is_empty() {
        return Some(value.to_owned());
    }
    issues.push(json!({"origin":"string","code":"too_small","minimum":1,"inclusive":true,"path":path_json(path),"message":message}));
    None
}

fn optional_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}
fn optional_nullable_string(value: Option<&Value>) -> Option<Option<String>> {
    match value {
        Some(Value::Null) => Some(None),
        Some(Value::String(value)) if !value.is_empty() => Some(Some(value.clone())),
        _ => None,
    }
}
fn optional_boolean(
    value: Option<&Value>,
    path: &[PathSegment],
    issues: &mut InputIssues,
) -> Option<bool> {
    match value {
        None => None,
        Some(value) => parse_boolean(Some(value), path, issues),
    }
}
fn require(body: Option<&Value>) -> Result<&Map<String, Value>, FolderWorkspaceInputFailure> {
    require_object(body).map_err(FolderWorkspaceInputFailure::new)
}

impl FolderWorkspaceInputFailure {
    // Why: only the protobuf surface remains, and it distinguishes failure from
    // success; the JSON issue payload died with the legacy dispatch.
    fn new(_issues: InputIssues) -> Self {
        Self
    }
}
impl std::fmt::Display for FolderWorkspaceInputFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("folder workspace input validation failed")
    }
}
impl std::error::Error for FolderWorkspaceInputFailure {}

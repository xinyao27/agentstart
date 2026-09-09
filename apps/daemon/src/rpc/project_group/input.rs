use serde_json::{Map, Value, json};

use crate::project_groups::{
    ProjectGroupCreate, ProjectGroupCreatedFrom, ProjectGroupDelete, ProjectGroupMoveProject,
    ProjectGroupUpdate,
};
use crate::rpc::zod_input::{
    InputIssues, PathSegment, invalid_type_issue, parse_boolean, parse_integer, path_json,
    require_object, value_type,
};

#[derive(Debug)]
pub(super) struct ProjectGroupInputFailure;

pub(super) fn parse_create(
    body: Option<&Value>,
) -> Result<ProjectGroupCreate, ProjectGroupInputFailure> {
    let object = require(body)?;
    let mut issues = InputIssues::new();
    let expected_revision = revision(object, &mut issues);
    let name = required_string(object, "name", "Missing group name", &mut issues);
    let parent_path = optional_string(object.get("parentPath"));
    let connection_id = optional_nullable_string(object.get("connectionId")).flatten();
    let parent_group_id = optional_nullable_string(object.get("parentGroupId")).flatten();
    let created_from = created_from(object.get("createdFrom"), &mut issues);
    match (expected_revision, name, created_from) {
        (Some(expected_revision), Some(name), Some(created_from)) if issues.is_empty() => {
            Ok(ProjectGroupCreate {
                connection_id,
                created_from,
                expected_revision,
                name,
                parent_group_id,
                parent_path,
            })
        }
        _ => Err(ProjectGroupInputFailure::new(issues)),
    }
}

pub(super) fn parse_update(
    body: Option<&Value>,
) -> Result<ProjectGroupUpdate, ProjectGroupInputFailure> {
    let object = require(body)?;
    let mut issues = InputIssues::new();
    let expected_revision = revision(object, &mut issues);
    let group_id = required_string(object, "groupId", "Missing group id", &mut issues);
    let updates = updates(object.get("updates"), &mut issues);
    match (expected_revision, group_id, updates) {
        (Some(expected_revision), Some(group_id), Some(updates)) if issues.is_empty() => {
            let (name, is_collapsed, tab_order, color) = updates;
            Ok(ProjectGroupUpdate {
                color,
                expected_revision,
                group_id,
                is_collapsed,
                name,
                tab_order,
            })
        }
        _ => Err(ProjectGroupInputFailure::new(issues)),
    }
}

pub(super) fn parse_delete(
    body: Option<&Value>,
) -> Result<ProjectGroupDelete, ProjectGroupInputFailure> {
    let object = require(body)?;
    let mut issues = InputIssues::new();
    let expected_revision = revision(object, &mut issues);
    let group_id = required_string(object, "groupId", "Missing group id", &mut issues);
    match (expected_revision, group_id) {
        (Some(expected_revision), Some(group_id)) if issues.is_empty() => Ok(ProjectGroupDelete {
            expected_revision,
            group_id,
        }),
        _ => Err(ProjectGroupInputFailure::new(issues)),
    }
}

pub(super) fn parse_move_project(
    body: Option<&Value>,
) -> Result<ProjectGroupMoveProject, ProjectGroupInputFailure> {
    let object = require(body)?;
    let mut issues = InputIssues::new();
    let expected_revision = revision(object, &mut issues);
    let project_selector = required_string(object, "repo", "Missing repo selector", &mut issues);
    let group_id = optional_nullable_string(object.get("groupId")).flatten();
    let order = optional_finite(object.get("order"));
    match (expected_revision, project_selector) {
        (Some(expected_revision), Some(project_selector)) if issues.is_empty() => {
            Ok(ProjectGroupMoveProject {
                expected_revision,
                group_id,
                order,
                project_selector,
            })
        }
        _ => Err(ProjectGroupInputFailure::new(issues)),
    }
}

type Updates = (
    Option<String>,
    Option<bool>,
    Option<f64>,
    Option<Option<String>>,
);

fn updates(value: Option<&Value>, issues: &mut InputIssues) -> Option<Updates> {
    let path = [PathSegment::field("updates")];
    let Some(object) = value.and_then(Value::as_object) else {
        issues.push(invalid_type_issue(&path, "object", value_type(value)));
        return None;
    };
    let name = optional_string(object.get("name"));
    let tab_order = optional_finite(object.get("tabOrder"));
    let color = optional_nullable_string(object.get("color"));
    let is_collapsed = match object.get("isCollapsed") {
        None => None,
        Some(value) => parse_boolean(
            Some(value),
            &[
                PathSegment::field("updates"),
                PathSegment::field("isCollapsed"),
            ],
            issues,
        ),
    };
    Some((name, is_collapsed, tab_order, color))
}

fn revision(object: &Map<String, Value>, issues: &mut InputIssues) -> Option<i64> {
    let path = [PathSegment::field("expectedRevision")];
    let value = parse_integer(object.get("expectedRevision"), &path, false, None, issues);
    if value.is_some_and(|value| value < 0) {
        issues.push(json!({
            "origin": "number", "code": "too_small", "minimum": 0, "inclusive": true,
            "path": path_json(&path), "message": "Too small: expected number to be >=0"
        }));
    }
    value.filter(|value| *value >= 0)
}

fn required_string(
    object: &Map<String, Value>,
    field: &'static str,
    message: &'static str,
    issues: &mut InputIssues,
) -> Option<String> {
    let value = object
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !value.is_empty() {
        return Some(value.to_owned());
    }
    let path = [PathSegment::field(field)];
    issues.push(json!({
        "origin": "string", "code": "too_small", "minimum": 1, "inclusive": true,
        "path": path_json(&path), "message": message
    }));
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

fn optional_finite(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
}

fn created_from(
    value: Option<&Value>,
    issues: &mut InputIssues,
) -> Option<ProjectGroupCreatedFrom> {
    match value {
        None => Some(ProjectGroupCreatedFrom::Manual),
        Some(Value::String(value)) => match value.as_str() {
            "folder-scan" => Some(ProjectGroupCreatedFrom::FolderScan),
            "manual" => Some(ProjectGroupCreatedFrom::Manual),
            "migration" => Some(ProjectGroupCreatedFrom::Migration),
            _ => {
                enum_issue(value, issues);
                None
            }
        },
        Some(value) => {
            let path = [PathSegment::field("createdFrom")];
            issues.push(invalid_type_issue(&path, "string", value_type(Some(value))));
            None
        }
    }
}

fn enum_issue(value: &str, issues: &mut InputIssues) {
    issues.push(json!({
        "code": "invalid_value", "values": ["manual", "folder-scan", "migration"],
        "path": ["createdFrom"],
        "message": format!("Invalid option: expected one of \"manual\"|\"folder-scan\"|\"migration\"")
    }));
    let _ = value;
}

fn require(body: Option<&Value>) -> Result<&Map<String, Value>, ProjectGroupInputFailure> {
    require_object(body).map_err(ProjectGroupInputFailure::new)
}

impl ProjectGroupInputFailure {
    // Why: the issue details were only rendered by the legacy JSON dispatcher;
    // the protobuf surface folds validation failures into a generic status.
    pub(super) fn new(issues: InputIssues) -> Self {
        let _ = issues;
        Self
    }
}

impl std::fmt::Display for ProjectGroupInputFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("project group input validation failed")
    }
}

impl std::error::Error for ProjectGroupInputFailure {}

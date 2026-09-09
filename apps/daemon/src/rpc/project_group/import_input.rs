use serde_json::{Map, Value, json};

use crate::project_groups::{ProjectGroupImportInput, ProjectGroupImportMode};
use crate::rpc::zod_input::{
    InputIssues, PathSegment, invalid_type_issue, parse_integer, path_json, require_object,
    value_type,
};

use super::input::ProjectGroupInputFailure;

pub(super) fn parse_import(
    body: Option<&Value>,
) -> Result<ProjectGroupImportInput, ProjectGroupInputFailure> {
    let object = require_object(body).map_err(ProjectGroupInputFailure::new)?;
    let mut issues = InputIssues::new();
    let mode = mode(object.get("mode"), &mut issues);
    let expected_revision = revision(object, &mut issues);
    let parent_path = required(object, "parentPath", "Missing parent path", &mut issues);
    let group_name = default_string(object.get("groupName"), &mut issues);
    let project_paths = string_array(object.get("projectPaths"), &mut issues);
    let scan_id = optional_string(object.get("scanId"));
    match (
        expected_revision,
        group_name,
        mode,
        parent_path,
        project_paths,
    ) {
        (
            Some(expected_revision),
            Some(group_name),
            Some(mode),
            Some(parent_path),
            Some(project_paths),
        ) if issues.is_empty() => Ok(ProjectGroupImportInput {
            expected_revision,
            group_name,
            mode,
            parent_path,
            project_paths,
            scan_id,
        }),
        _ => Err(ProjectGroupInputFailure::new(issues)),
    }
}

fn mode(value: Option<&Value>, issues: &mut InputIssues) -> Option<ProjectGroupImportMode> {
    match value.and_then(Value::as_str) {
        Some("group") => Some(ProjectGroupImportMode::Group),
        Some("separate") => Some(ProjectGroupImportMode::Separate),
        _ => {
            issues.push(json!({
                "code":"invalid_union","errors":[],"note":"No matching discriminator",
                "discriminator":"mode","options":["group","separate"],"path":["mode"],
                "message":"Invalid discriminator value. Expected 'group' | 'separate'"
            }));
            None
        }
    }
}

fn revision(object: &Map<String, Value>, issues: &mut InputIssues) -> Option<i64> {
    let path = [PathSegment::field("expectedRevision")];
    let value = parse_integer(object.get("expectedRevision"), &path, false, None, issues);
    if value.is_some_and(|value| value < 0) {
        issues.push(json!({
            "origin":"number","code":"too_small","minimum":0,"inclusive":true,
            "path":path_json(&path),"message":"Too small: expected number to be >=0"
        }));
    }
    value.filter(|value| *value >= 0)
}

fn required(
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
        "origin":"string","code":"too_small","minimum":1,"inclusive":true,
        "path":path_json(&path),"message":message
    }));
    None
}

fn default_string(value: Option<&Value>, issues: &mut InputIssues) -> Option<String> {
    match value {
        None => Some(String::new()),
        Some(Value::String(value)) => Some(value.clone()),
        Some(value) => {
            let path = [PathSegment::field("groupName")];
            issues.push(invalid_type_issue(&path, "string", value_type(Some(value))));
            None
        }
    }
}

fn string_array(value: Option<&Value>, issues: &mut InputIssues) -> Option<Vec<String>> {
    let path = [PathSegment::field("projectPaths")];
    let Some(values) = value.and_then(Value::as_array) else {
        issues.push(invalid_type_issue(&path, "array", value_type(value)));
        return None;
    };
    let mut result = Vec::with_capacity(values.len());
    for (index, value) in values.iter().enumerate() {
        match value {
            Value::String(value) => result.push(value.clone()),
            value => issues.push(invalid_type_issue(
                &[
                    PathSegment::field("projectPaths"),
                    PathSegment::index(index),
                ],
                "string",
                value_type(Some(value)),
            )),
        }
    }
    Some(result)
}

fn optional_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

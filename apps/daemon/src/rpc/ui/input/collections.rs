use std::collections::HashSet;

use serde_json::{Map, Value, json};

use super::{
    Issues, child, invalid_type, parse_boolean, parse_enum, parse_number, parse_string,
    unrecognized_keys, value_type,
};

pub(super) fn string_array(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    let values = require_array(value, path, issues)?;
    let mut parsed = Vec::new();
    for (index, value) in values.iter().enumerate() {
        if let Some(value) = parse_string(value, &child(path, index), issues) {
            parsed.push(value);
        }
    }
    Some(Value::Array(parsed))
}

pub(super) fn nullable_string_array(
    value: &Value,
    path: &[Value],
    issues: &mut Issues,
) -> Option<Value> {
    if value.is_null() {
        Some(Value::Null)
    } else {
        string_array(value, path, issues)
    }
}

pub(super) fn enum_array(
    value: &Value,
    path: &[Value],
    allowed: &[&str],
    issues: &mut Issues,
) -> Option<Value> {
    let values = require_array(value, path, issues)?;
    let mut parsed = Vec::new();
    for (index, value) in values.iter().enumerate() {
        if let Some(value) = parse_enum(value, &child(path, index), allowed, issues) {
            parsed.push(value);
        }
    }
    Some(Value::Array(parsed))
}

pub(super) fn worktree_card_properties(
    value: &Value,
    path: &[Value],
    issues: &mut Issues,
) -> Option<Value> {
    let parsed = enum_array(
        value,
        path,
        &[
            "status",
            "unread",
            "branch",
            "comment",
            "ports",
            "inline-agents",
        ],
        issues,
    )?;
    let source = parsed.as_array().expect("parsed properties are an array");
    Some(Value::Array(
        [
            "status",
            "unread",
            "branch",
            "comment",
            "ports",
            "inline-agents",
        ]
        .into_iter()
        .filter(|property| {
            matches!(*property, "status" | "unread")
                || source.iter().any(|value| value.as_str() == Some(property))
        })
        .map(|property| Value::String(property.to_owned()))
        .collect(),
    ))
}

pub(super) fn pinned_ids(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    let parsed = enum_array(
        value,
        path,
        &[
            "explorer",
            "vault",
            "workspaces",
            "pr-checks",
            "source-control",
            "checks",
            "ports",
            "open-in",
            "commands",
        ],
        issues,
    )?;
    let source = parsed.as_array().expect("parsed pinned ids are an array");
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for value in source {
        let id = match value.as_str() {
            Some("checks") => "source-control",
            Some(id) => id,
            None => continue,
        };
        if seen.insert(id.to_owned()) {
            normalized.push(Value::String(id.to_owned()));
        }
    }
    if !seen.contains("open-in") && !source.iter().any(|value| value.as_str() == Some("open-in")) {
        normalized.push(Value::String("open-in".to_owned()));
    }
    Some(Value::Array(normalized))
}

pub(super) fn boolean_record(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    record(value, path, issues, parse_boolean)
}

pub(super) fn number_record(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    record(value, path, issues, parse_number)
}

pub(super) fn manual_repo_order(
    value: &Value,
    path: &[Value],
    issues: &mut Issues,
) -> Option<Value> {
    let values = require_array(value, path, issues)?;
    let mut parsed = Vec::new();
    for (index, value) in values.iter().enumerate() {
        let entry_path = child(path, index);
        let Some(object) = require_object(value, &entry_path, issues) else {
            continue;
        };
        let host_id = required_string(object, "hostId", &entry_path, issues);
        let repo_id = required_string(object, "repoId", &entry_path, issues);
        reject_unknown(object, &["hostId", "repoId"], &entry_path, issues);
        if let (Some(host_id), Some(repo_id)) = (host_id, repo_id) {
            parsed.push(json!({ "hostId": host_id, "repoId": repo_id }));
        }
    }
    Some(Value::Array(parsed))
}

pub(super) fn workspace_statuses(
    value: &Value,
    path: &[Value],
    issues: &mut Issues,
) -> Option<Value> {
    let values = require_array(value, path, issues)?;
    let mut parsed = Vec::new();
    for (index, value) in values.iter().enumerate() {
        let status_path = child(path, index);
        let Some(object) = require_object(value, &status_path, issues) else {
            continue;
        };
        let id = required_string(object, "id", &status_path, issues);
        let label = required_string(object, "label", &status_path, issues);
        let color = optional_string(object, "color", &status_path, issues);
        let icon = optional_string(object, "icon", &status_path, issues);
        if let (Some(id), Some(label)) = (id, label) {
            let mut status = Map::from_iter([
                ("id".to_owned(), Value::String(id)),
                ("label".to_owned(), Value::String(label)),
            ]);
            if let Some(color) = color {
                status.insert("color".to_owned(), Value::String(color));
            }
            if let Some(icon) = icon {
                status.insert("icon".to_owned(), Value::String(icon));
            }
            parsed.push(Value::Object(status));
        }
    }
    Some(Value::Array(parsed))
}

pub(super) fn feature_tip_ids(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    let values = require_array(value, path, issues)?;
    let mut parsed = Vec::new();
    for (index, value) in values.iter().enumerate() {
        let item_path = child(path, index);
        match value.as_str() {
            Some("agentstart-cli" | "command-palette") => parsed.push(value.clone()),
            _ => issues.push(json!({
                "code": "custom",
                "path": item_path,
                "message": "Unknown feature tip id"
            })),
        }
    }
    Some(Value::Array(parsed))
}

pub(super) fn require_array<'a>(
    value: &'a Value,
    path: &[Value],
    issues: &mut Issues,
) -> Option<&'a Vec<Value>> {
    value.as_array().or_else(|| {
        issues.push(invalid_type(path, "array", value_type(Some(value))));
        None
    })
}

pub(super) fn require_object<'a>(
    value: &'a Value,
    path: &[Value],
    issues: &mut Issues,
) -> Option<&'a Map<String, Value>> {
    value.as_object().or_else(|| {
        issues.push(invalid_type(path, "object", value_type(Some(value))));
        None
    })
}

pub(super) fn reject_unknown(
    object: &Map<String, Value>,
    known: &[&str],
    path: &[Value],
    issues: &mut Issues,
) {
    let keys = object
        .keys()
        .filter(|key| !known.contains(&key.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    if !keys.is_empty() {
        issues.push(unrecognized_keys(path, keys));
    }
}

fn record(
    value: &Value,
    path: &[Value],
    issues: &mut Issues,
    parser: fn(&Value, &[Value], &mut Issues) -> Option<Value>,
) -> Option<Value> {
    let object = require_object(value, path, issues)?;
    let parsed = object
        .iter()
        .filter_map(|(key, value)| {
            parser(value, &child(path, key.clone()), issues).map(|value| (key.clone(), value))
        })
        .collect();
    Some(Value::Object(parsed))
}

fn required_string(
    object: &Map<String, Value>,
    field: &str,
    path: &[Value],
    issues: &mut Issues,
) -> Option<String> {
    let field_path = child(path, field.to_owned());
    let Some(value) = object.get(field) else {
        issues.push(invalid_type(&field_path, "string", "undefined"));
        return None;
    };
    parse_string(value, &field_path, issues).and_then(|value| value.as_str().map(str::to_owned))
}

fn optional_string(
    object: &Map<String, Value>,
    field: &str,
    path: &[Value],
    issues: &mut Issues,
) -> Option<String> {
    let value = object.get(field)?;
    parse_string(value, &child(path, field.to_owned()), issues)
        .and_then(|value| value.as_str().map(str::to_owned))
}

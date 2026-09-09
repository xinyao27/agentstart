use std::collections::HashMap;
use std::sync::OnceLock;

mod issues;
mod legacy;
mod primitives;

use serde_json::{Map, Value, json};

use crate::workspace_session::normalize_host_id;

// Why: the failure used to carry Zod-style issues for the legacy JSON error
// payload; the protobuf surface only needs the typed signal, so it is empty.
#[derive(Debug)]
pub(crate) struct WireFailure;

pub(crate) fn validate_input(method: &str, input: &Value) -> Result<Value, WireFailure> {
    validate(method, input, false)
}

pub(crate) fn repair_session_input(input: &mut Value, field: &str) {
    let Some(session) = input.get_mut(field) else {
        return;
    };
    *session = legacy::repair_session(session);
}

pub(super) fn sanitize_session(input: &Value) -> Option<Value> {
    validate("shell.session.get", input, true).ok()
}

fn sanitize_persisted_session(input: &Value) -> Option<Value> {
    sanitize_session(&legacy::repair_session(input))
}

pub(super) fn sanitize_document(mut document: Map<String, Value>) -> Map<String, Value> {
    let mut sanitized = Map::new();
    if let Some(version) = document.remove(super::version::VERSION_KEY) {
        sanitized.insert(super::version::VERSION_KEY.to_owned(), version);
    }
    if let Some(session) = document.remove("workspaceSession")
        && let Some(session) = sanitize_persisted_session(&session)
    {
        sanitized.insert("workspaceSession".to_owned(), session);
    }
    if let Some(sessions) = document.remove("workspaceSessionsByHostId") {
        let sessions = sessions
            .as_object()
            .into_iter()
            .flatten()
            .filter_map(|(host_id, session)| {
                let host_id = normalize_host_id(host_id)?;
                if host_id == "local" {
                    return None;
                }
                Some((host_id, sanitize_persisted_session(session)?))
            })
            .collect();
        sanitized.insert(
            "workspaceSessionsByHostId".to_owned(),
            Value::Object(sessions),
        );
    }
    if let Some(live_sessions) = document.remove("claudeLivePtySessionIds") {
        sanitized.insert("claudeLivePtySessionIds".to_owned(), live_sessions);
    }
    sanitized
}

fn accepts_terminal_launch_agent(value: &Value) -> bool {
    let Some(schema) = session_output_schema() else {
        return false;
    };
    schema
        .pointer(
            "/properties/tabsByWorktree/additionalProperties/items/properties/launchAgent/enum",
        )
        .and_then(Value::as_array)
        .is_some_and(|values| values.contains(value))
}

fn sanitize_sleeping_record(input: &Value) -> Option<Value> {
    let root = session_output_schema()?;
    let schema = root.pointer("/properties/sleepingAgentSessionsByPaneKey/additionalProperties")?;
    let mut issues = Vec::new();
    let value = visit(root, schema, input, &mut Vec::new(), &mut issues)?;
    issues.is_empty().then_some(value)
}

fn validate(method: &str, input: &Value, output: bool) -> Result<Value, WireFailure> {
    let key = format!("{}:{method}", if output { "output" } else { "input" });
    let Some(schema) = schemas().get(&key) else {
        return Err(WireFailure);
    };
    let mut issues = Vec::new();
    let output = visit(schema, schema, input, &mut Vec::new(), &mut issues);
    if issues.is_empty() {
        Ok(output.unwrap_or(Value::Null))
    } else {
        Err(WireFailure)
    }
}

// Why: The persisted-session sanitizer and typed session methods share the crate-owned JSON schemas.
const SESSION_SCHEMAS_JSON: &str = include_str!("session-schemas.json");

fn schemas() -> &'static HashMap<String, Value> {
    static SCHEMAS: OnceLock<HashMap<String, Value>> = OnceLock::new();
    SCHEMAS.get_or_init(|| {
        let mut schemas: HashMap<String, Value> =
            serde_json::from_str(SESSION_SCHEMAS_JSON).expect("session schemas are valid JSON");
        // Why: Patch accepts the same field whitelist as Set, but does not require unrelated fields.
        let mut patch = schemas["input:shell.session.set"]["properties"]["session"].clone();
        patch
            .as_object_mut()
            .expect("session schema is an object")
            .remove("required");
        schemas
            .get_mut("input:shell.session.patch")
            .expect("patch schema exists")["properties"]["patch"] = patch;
        schemas
    })
}

fn session_output_schema() -> Option<&'static Value> {
    schemas().get("output:shell.session.get")
}

fn visit(
    root: &Value,
    schema: &Value,
    input: &Value,
    path: &mut Vec<Value>,
    issues: &mut Vec<Value>,
) -> Option<Value> {
    if path.len() > 64 {
        issues.push(
            json!({"code":"custom","path":path,"message":"Session nesting exceeds the limit"}),
        );
        return None;
    }
    // Why: embedded session schemas own their recursive layout definitions.
    let root = if schema.get("$schema").is_some() {
        schema
    } else {
        root
    };
    let schema = resolve_reference(root, schema, path, issues)?;
    if let Some(options) = schema.get("anyOf").and_then(Value::as_array) {
        return visit_union(root, options, input, path, issues);
    }
    if !primitives::matches_type(schema.get("type"), input) {
        issues.push(issues::invalid_type(
            path.clone(),
            primitives::expected_type(schema.get("type")),
            Some(input),
        ));
        return None;
    }
    if !primitives::matches_const_or_enum(schema, input) {
        issues.push(json!({
            "code": "invalid_value", "values": primitives::allowed_values(schema),
            "path": path, "message": "Invalid option: expected one of the allowed values"
        }));
        return None;
    }
    match input {
        Value::Object(object) => visit_object(root, schema, object, path, issues),
        Value::Array(array) => visit_array(root, schema, array, path, issues),
        Value::String(value) => primitives::visit_string(schema, value, path, issues),
        Value::Number(number) => {
            primitives::visit_number(schema, number.as_f64().unwrap_or_default(), path, issues)
        }
        Value::Null | Value::Bool(_) => Some(input.clone()),
    }
}

fn visit_union(
    root: &Value,
    options: &[Value],
    input: &Value,
    path: &mut Vec<Value>,
    issues: &mut Vec<Value>,
) -> Option<Value> {
    let mut failures = Vec::new();
    for option in options {
        let mut option_issues = Vec::new();
        if let Some(value) = visit(root, option, input, path, &mut option_issues)
            && option_issues.is_empty()
        {
            return Some(value);
        }
        failures.push(option_issues);
    }
    issues.push(json!({
        "code": "invalid_union", "errors": failures, "path": path,
        "message": "Invalid input"
    }));
    None
}

fn visit_object(
    root: &Value,
    schema: &Value,
    object: &Map<String, Value>,
    path: &mut Vec<Value>,
    issues: &mut Vec<Value>,
) -> Option<Value> {
    let properties = schema
        .get("properties")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let required = schema
        .get("required")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>();
    let additional = schema
        .get("additionalProperties")
        .filter(|value| value.is_object());
    let mut output = Map::new();
    for (key, property_schema) in &properties {
        let Some(value) = object.get(key) else {
            if required.contains(&key.as_str()) {
                path.push(Value::String(key.clone()));
                issues.push(issues::invalid_type(
                    path.clone(),
                    primitives::expected_type(property_schema.get("type")),
                    None,
                ));
                path.pop();
            }
            continue;
        };
        path.push(Value::String(key.clone()));
        if let Some(value) = visit(root, property_schema, value, path, issues) {
            output.insert(key.clone(), value);
        }
        path.pop();
    }
    if let Some(additional) = additional {
        for (key, value) in object
            .iter()
            .filter(|(key, _)| !properties.contains_key(*key))
        {
            path.push(Value::String(key.clone()));
            if let Some(property_names) = schema.get("propertyNames") {
                let key_value = Value::String(key.clone());
                let _ = visit(root, property_names, &key_value, path, issues);
            }
            if let Some(value) = visit(root, additional, value, path, issues) {
                output.insert(key.clone(), value);
            }
            path.pop();
        }
    }
    Some(Value::Object(output))
}

fn visit_array(
    root: &Value,
    schema: &Value,
    array: &[Value],
    path: &mut Vec<Value>,
    issues: &mut Vec<Value>,
) -> Option<Value> {
    let Some(item_schema) = schema.get("items") else {
        return Some(Value::Array(array.to_vec()));
    };
    let mut output = Vec::with_capacity(array.len());
    for (index, item) in array.iter().enumerate() {
        path.push(Value::from(index));
        if let Some(value) = visit(root, item_schema, item, path, issues) {
            output.push(value);
        }
        path.pop();
    }
    Some(Value::Array(output))
}

fn resolve_reference<'a>(
    root: &'a Value,
    schema: &'a Value,
    path: &[Value],
    issues: &mut Vec<Value>,
) -> Option<&'a Value> {
    let Some(reference) = schema.get("$ref").and_then(Value::as_str) else {
        return Some(schema);
    };
    let Some(name) = reference.strip_prefix("#/$defs/") else {
        issues.push(
            json!({ "code": "custom", "path": path, "message": "Unsupported schema reference" }),
        );
        return None;
    };
    let resolved = root.get("$defs").and_then(|defs| defs.get(name));
    if resolved.is_none() {
        issues
            .push(json!({ "code": "custom", "path": path, "message": "Missing schema reference" }));
    }
    resolved
}

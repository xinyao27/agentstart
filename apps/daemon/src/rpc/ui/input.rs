mod collections;
mod objects;
mod schema;

use serde_json::{Map, Value, json};

use crate::ui::FEATURE_INTERACTION_IDS;

// Why: the failure carries no issue payload anymore — the legacy JSON 400
// envelope retired with `ui.*`, and the protobuf surface rejects with the
// message string alone.
#[derive(Debug)]
pub(super) struct UiInputFailure;

pub(super) fn parse_set(body: Option<&Value>) -> Result<Map<String, Value>, UiInputFailure> {
    let Some(body) = body else {
        return Ok(Map::new());
    };
    let Some(object) = body.as_object() else {
        return Err(UiInputFailure::from_issues(Issues::one(invalid_type(
            &[],
            "object",
            value_type(Some(body)),
        ))));
    };
    schema::parse(object).map_err(UiInputFailure::from_issues)
}

pub(super) fn parse_feature_id(value: Option<&str>) -> Result<String, UiInputFailure> {
    let Some(id) = value else {
        return Err(custom_feature_id_failure());
    };
    if !FEATURE_INTERACTION_IDS.contains(&id) {
        return Err(custom_feature_id_failure());
    }
    Ok(id.to_owned())
}

fn custom_feature_id_failure() -> UiInputFailure {
    UiInputFailure::from_issues(Issues::one(json!({
        "code": "custom",
        "path": [],
        "message": "Unknown feature interaction id"
    })))
}

pub(super) struct Issues {
    values: Vec<Value>,
}

impl Issues {
    pub(super) const fn new() -> Self {
        Self { values: Vec::new() }
    }

    pub(super) fn one(issue: Value) -> Self {
        Self {
            values: vec![issue],
        }
    }

    pub(super) fn push(&mut self, issue: Value) {
        self.values.push(issue);
    }

    pub(super) fn is_empty(&self) -> bool {
        self.values.is_empty()
    }
}

pub(super) fn parse_string(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    if value.is_string() {
        Some(value.clone())
    } else {
        issues.push(invalid_type(path, "string", value_type(Some(value))));
        None
    }
}

pub(super) fn parse_boolean(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    if value.is_boolean() {
        Some(value.clone())
    } else {
        issues.push(invalid_type(path, "boolean", value_type(Some(value))));
        None
    }
}

pub(super) fn parse_number(value: &Value, path: &[Value], issues: &mut Issues) -> Option<Value> {
    if value.is_number() {
        Some(value.clone())
    } else {
        issues.push(invalid_type(path, "number", value_type(Some(value))));
        None
    }
}

pub(super) fn parse_positive_integer(
    value: &Value,
    path: &[Value],
    issues: &mut Issues,
) -> Option<Value> {
    let number = parse_number(value, path, issues)?;
    let raw = number.as_f64()?;
    let mut valid = true;
    if raw.fract() != 0.0 || raw.abs() > 9_007_199_254_740_991.0 {
        issues.push(json!({
            "expected": "int",
            "format": "safeint",
            "code": "invalid_type",
            "path": path,
            "message": "Invalid input: expected int, received number"
        }));
        valid = false;
    }
    if raw <= 0.0 {
        issues.push(json!({
            "origin": "number",
            "code": "too_small",
            "minimum": 0,
            "inclusive": false,
            "path": path,
            "message": "Too small: expected number to be >0"
        }));
        valid = false;
    }
    valid.then_some(number)
}

pub(super) fn parse_enum(
    value: &Value,
    path: &[Value],
    allowed: &[&str],
    issues: &mut Issues,
) -> Option<Value> {
    if value.as_str().is_some_and(|value| allowed.contains(&value)) {
        return Some(value.clone());
    }
    let values = allowed
        .iter()
        .map(|value| Value::String((*value).to_owned()))
        .collect::<Vec<_>>();
    let expected = allowed
        .iter()
        .map(|value| format!("\"{value}\""))
        .collect::<Vec<_>>()
        .join("|");
    issues.push(json!({
        "code": "invalid_value",
        "values": values,
        "path": path,
        "message": format!("Invalid option: expected one of {expected}")
    }));
    None
}

pub(super) fn invalid_type(path: &[Value], expected: &str, received: &str) -> Value {
    json!({
        "expected": expected,
        "code": "invalid_type",
        "path": path,
        "message": format!("Invalid input: expected {expected}, received {received}")
    })
}

pub(super) fn unrecognized_keys(path: &[Value], keys: Vec<String>) -> Value {
    let quoted = keys
        .iter()
        .map(|key| format!("\"{key}\""))
        .collect::<Vec<_>>()
        .join(", ");
    let label = if keys.len() == 1 { "key" } else { "keys" };
    json!({
        "code": "unrecognized_keys",
        "keys": keys,
        "path": path,
        "message": format!("Unrecognized {label}: {quoted}")
    })
}

pub(super) fn child(path: &[Value], segment: impl Into<Value>) -> Vec<Value> {
    let mut child = path.to_vec();
    child.push(segment.into());
    child
}

pub(super) fn value_type(value: Option<&Value>) -> &'static str {
    match value {
        None => "undefined",
        Some(Value::Null) => "null",
        Some(Value::Bool(_)) => "boolean",
        Some(Value::Number(_)) => "number",
        Some(Value::String(_)) => "string",
        Some(Value::Array(_)) => "array",
        Some(Value::Object(_)) => "object",
    }
}

impl UiInputFailure {
    fn from_issues(_issues: Issues) -> Self {
        Self
    }
}

impl std::fmt::Display for UiInputFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("UI input validation failed")
    }
}

impl std::error::Error for UiInputFailure {}

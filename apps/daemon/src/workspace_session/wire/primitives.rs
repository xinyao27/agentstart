use regex::Regex;
use serde_json::{Value, json};

use super::issues;

pub(super) fn visit_string(
    schema: &Value,
    value: &str,
    path: &[Value],
    issues: &mut Vec<Value>,
) -> Option<Value> {
    let length = value.encode_utf16().count() as u64;
    if let Some(minimum) = schema.get("minLength").and_then(Value::as_u64)
        && length < minimum
    {
        issues.push(issues::size("string", "too_small", minimum, path));
    }
    if let Some(maximum) = schema.get("maxLength").and_then(Value::as_u64)
        && length > maximum
    {
        issues.push(issues::size("string", "too_big", maximum, path));
    }
    if let Some(pattern) = schema.get("pattern").and_then(Value::as_str)
        && !pattern_matches(pattern, value)
    {
        issues.push(json!({
            "origin": "string", "code": "invalid_format", "format": "regex",
            "pattern": pattern, "path": path, "message": "Invalid string: must match pattern"
        }));
    }
    Some(Value::String(value.to_owned()))
}

pub(super) fn visit_number(
    schema: &Value,
    value: f64,
    path: &[Value],
    issues: &mut Vec<Value>,
) -> Option<Value> {
    if schema.get("type").and_then(Value::as_str) == Some("integer") && value.fract() != 0.0 {
        issues.push(issues::invalid_type(
            path.to_vec(),
            "int",
            Some(&json!(value)),
        ));
    }
    if let Some(minimum) = schema.get("minimum").and_then(Value::as_f64)
        && value < minimum
    {
        issues.push(issues::number_limit("too_small", minimum, true, path));
    }
    if let Some(minimum) = schema.get("exclusiveMinimum").and_then(Value::as_f64)
        && value <= minimum
    {
        issues.push(issues::number_limit("too_small", minimum, false, path));
    }
    Some(json!(value))
}

pub(super) fn matches_type(schema_type: Option<&Value>, input: &Value) -> bool {
    let matches = |kind: &str| match kind {
        "array" => input.is_array(),
        "boolean" => input.is_boolean(),
        "integer" => input.as_f64().is_some_and(|value| value.fract() == 0.0),
        "null" => input.is_null(),
        "number" => input.is_number(),
        "object" => input.is_object(),
        "string" => input.is_string(),
        _ => true,
    };
    match schema_type {
        Some(Value::String(kind)) => matches(kind),
        Some(Value::Array(kinds)) => kinds.iter().filter_map(Value::as_str).any(matches),
        _ => true,
    }
}

pub(super) fn matches_const_or_enum(schema: &Value, input: &Value) -> bool {
    schema.get("const").is_none_or(|value| value == input)
        && schema
            .get("enum")
            .and_then(Value::as_array)
            .is_none_or(|values| values.contains(input))
}

pub(super) fn allowed_values(schema: &Value) -> Vec<Value> {
    schema
        .get("enum")
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| schema.get("const").cloned().map(|value| vec![value]))
        .unwrap_or_default()
}

pub(super) fn expected_type(value: Option<&Value>) -> &str {
    match value {
        Some(Value::String(value)) => value,
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .find(|value| *value != "null")
            .unwrap_or("unknown"),
        _ => "unknown",
    }
}

fn pattern_matches(pattern: &str, value: &str) -> bool {
    match pattern {
        "^(?!-)[^\\u0000-\\u001f\\u007f]+$" => {
            !value.starts_with('-') && has_safe_characters(value, false)
        }
        "^(?!(?:__proto__|constructor|prototype)$)[^=\\u0000-\\u001f\\u007f]+$" => {
            !matches!(value, "__proto__" | "constructor" | "prototype")
                && has_safe_characters(value, true)
        }
        _ => Regex::new(pattern).is_ok_and(|pattern| pattern.is_match(value)),
    }
}

fn has_safe_characters(value: &str, reject_equals: bool) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|character| !character.is_control() && (!reject_equals || character != '='))
}

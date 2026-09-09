use serde_json::{Map, Value, json};

pub(super) fn invalid_type(path: Vec<Value>, expected: &str, value: Option<&Value>) -> Value {
    let received = match value {
        None => "undefined",
        Some(Value::Null) => "null",
        Some(Value::Bool(_)) => "boolean",
        Some(Value::Number(_)) => "number",
        Some(Value::String(_)) => "string",
        Some(Value::Array(_)) => "array",
        Some(Value::Object(_)) => "object",
    };
    json!({
        "expected": expected, "code": "invalid_type", "path": path,
        "message": format!("Invalid input: expected {expected}, received {received}")
    })
}

pub(super) fn size(origin: &str, code: &str, limit: u64, path: &[Value]) -> Value {
    let mut issue = Map::from_iter([
        ("origin".to_owned(), Value::String(origin.to_owned())),
        ("code".to_owned(), Value::String(code.to_owned())),
        ("inclusive".to_owned(), Value::Bool(true)),
        ("path".to_owned(), Value::Array(path.to_vec())),
        (
            "message".to_owned(),
            Value::String("Invalid size".to_owned()),
        ),
    ]);
    issue.insert(
        if code == "too_small" {
            "minimum"
        } else {
            "maximum"
        }
        .to_owned(),
        Value::from(limit),
    );
    Value::Object(issue)
}

pub(super) fn number_limit(code: &str, limit: f64, inclusive: bool, path: &[Value]) -> Value {
    json!({
        "origin": "number", "code": code, "minimum": limit,
        "inclusive": inclusive, "path": path, "message": "Number out of range"
    })
}

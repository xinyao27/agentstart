mod number;
mod string;

use serde_json::{Map, Value, json};

pub(crate) use number::parse_integer;
pub(crate) use string::{is_uuid, normalize_url, parse_string, trim_ecmascript_whitespace};

#[derive(Clone)]
pub(crate) enum PathSegment {
    Field(&'static str),
    Index(usize),
}

impl PathSegment {
    pub(crate) const fn field(value: &'static str) -> Self {
        Self::Field(value)
    }

    pub(crate) const fn index(value: usize) -> Self {
        Self::Index(value)
    }
}

pub(crate) struct InputIssues {
    values: Vec<Value>,
}

impl InputIssues {
    pub(crate) const fn new() -> Self {
        Self { values: Vec::new() }
    }

    pub(crate) fn one(issue: Value) -> Self {
        Self {
            values: vec![issue],
        }
    }

    pub(crate) fn push(&mut self, issue: Value) {
        self.values.push(issue);
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    pub(crate) fn into_data(self) -> Value {
        json!({ "issues": self.values })
    }
}

pub(crate) fn require_object(body: Option<&Value>) -> Result<&Map<String, Value>, InputIssues> {
    body.and_then(Value::as_object)
        .ok_or_else(|| InputIssues::one(invalid_type_issue(&[], "object", value_type(body))))
}

pub(crate) fn parse_boolean(
    value: Option<&Value>,
    path: &[PathSegment],
    issues: &mut InputIssues,
) -> Option<bool> {
    let Some(value) = value.and_then(Value::as_bool) else {
        issues.push(invalid_type_issue(path, "boolean", value_type(value)));
        return None;
    };
    Some(value)
}

pub(crate) fn invalid_type_issue(path: &[PathSegment], expected: &str, received: &str) -> Value {
    json!({
        "expected": expected,
        "code": "invalid_type",
        "path": path_json(path),
        "message": format!("Invalid input: expected {expected}, received {received}")
    })
}

pub(crate) fn path_json(path: &[PathSegment]) -> Value {
    Value::Array(
        path.iter()
            .map(|segment| match segment {
                PathSegment::Field(value) => Value::String((*value).to_owned()),
                PathSegment::Index(value) => Value::from(*value),
            })
            .collect(),
    )
}

pub(crate) fn value_type(value: Option<&Value>) -> &'static str {
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

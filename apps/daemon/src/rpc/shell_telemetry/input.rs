use serde_json::{Map, Value, json};

use crate::rpc::zod_input::{
    InputIssues, PathSegment, invalid_type_issue, parse_boolean, parse_string, path_json,
    require_object, value_type,
};

pub(super) struct TrackInput {
    pub(super) name: String,
    pub(super) props: Map<String, Value>,
}

// Why: the failure used to carry Zod-style issues for the legacy JSON error
// payload; the protobuf surface only needs the typed signal, so it is empty.
#[derive(Debug)]
pub(super) struct TelemetryInputFailure;

pub(super) fn parse_track(body: Option<&Value>) -> Result<TrackInput, TelemetryInputFailure> {
    let object = require_object(body).map_err(|_| TelemetryInputFailure)?;
    let mut issues = InputIssues::new();
    reject_unknown(object, &["name", "props"], &mut issues);
    let name = parse_string(
        object.get("name"),
        &[PathSegment::field("name")],
        &mut issues,
    );
    let props = match object.get("props") {
        None | Some(Value::Null) => Some(Map::new()),
        Some(Value::Object(props)) => Some(props.clone()),
        value => {
            issues.push(invalid_type_issue(
                &[PathSegment::field("props")],
                "record",
                value_type(value),
            ));
            None
        }
    };
    match (name, props) {
        (Some(name), Some(props)) if issues.is_empty() => Ok(TrackInput { name, props }),
        _ => Err(TelemetryInputFailure),
    }
}

pub(super) fn parse_set_opt_in(body: Option<&Value>) -> Result<bool, TelemetryInputFailure> {
    let object = require_object(body).map_err(|_| TelemetryInputFailure)?;
    let mut issues = InputIssues::new();
    reject_unknown(object, &["optedIn"], &mut issues);
    let opted_in = parse_boolean(
        object.get("optedIn"),
        &[PathSegment::field("optedIn")],
        &mut issues,
    );
    match opted_in {
        Some(opted_in) if issues.is_empty() => Ok(opted_in),
        _ => Err(TelemetryInputFailure),
    }
}

fn reject_unknown(object: &Map<String, Value>, allowed: &[&str], issues: &mut InputIssues) {
    let unknown = object
        .keys()
        .filter(|key| !allowed.contains(&key.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    if !unknown.is_empty() {
        issues.push(json!({
            "code": "unrecognized_keys",
            "keys": unknown,
            "path": path_json(&[]),
            "message": format!("Unrecognized key{}: {}", if unknown.len() == 1 { "" } else { "s" }, unknown.iter().map(|key| format!("\"{key}\"")).collect::<Vec<_>>().join(", "))
        }));
    }
}

impl std::fmt::Display for TelemetryInputFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("telemetry input validation failed")
    }
}

impl std::error::Error for TelemetryInputFailure {}

use serde_json::{Map, Value, json};

use crate::project_groups::NestedRepoScanOptions;
use crate::rpc::zod_input::{InputIssues, PathSegment, path_json, require_object};

use super::input::ProjectGroupInputFailure;

pub(super) struct ScanNestedInput {
    pub(super) options: NestedRepoScanOptions,
    pub(super) path: String,
    pub(super) scan_id: Option<String>,
}

pub(super) fn parse_scan(
    body: Option<&Value>,
) -> Result<ScanNestedInput, ProjectGroupInputFailure> {
    let object = require_object(body).map_err(ProjectGroupInputFailure::new)?;
    let mut issues = InputIssues::new();
    let path = required_string(object, "path", "Missing folder path", &mut issues);
    let scan_id = optional_string(object.get("scanId"));
    if let Some(path) = path
        && issues.is_empty()
    {
        return Ok(ScanNestedInput {
            options: options(object.get("options")),
            path,
            scan_id,
        });
    }
    Err(ProjectGroupInputFailure::new(issues))
}

pub(super) fn parse_cancel(body: Option<&Value>) -> Result<String, ProjectGroupInputFailure> {
    let object = require_object(body).map_err(ProjectGroupInputFailure::new)?;
    let mut issues = InputIssues::new();
    required_string(object, "scanId", "Missing scan id", &mut issues)
        .filter(|_| issues.is_empty())
        .ok_or_else(|| ProjectGroupInputFailure::new(issues))
}

fn options(value: Option<&Value>) -> NestedRepoScanOptions {
    let Some(object) = value.and_then(Value::as_object) else {
        return NestedRepoScanOptions::default();
    };
    NestedRepoScanOptions {
        max_depth: bounded_integer(object.get("maxDepth"), 3, 1, 8),
        max_repos: bounded_integer(object.get("maxRepos"), 100, 1, 500),
        timeout_ms: match object.get("timeoutMs") {
            Some(Value::Null) => None,
            value => finite(value).map(|value| value.floor().clamp(500.0, 30_000.0) as u64),
        },
    }
}

fn bounded_integer(value: Option<&Value>, default: usize, minimum: usize, maximum: usize) -> usize {
    finite(value)
        .map(|value| value.floor().clamp(minimum as f64, maximum as f64) as usize)
        .unwrap_or(default)
}

fn finite(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
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

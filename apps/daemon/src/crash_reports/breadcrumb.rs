// Why: All breadcrumb inputs are normalized before entering the process-wide ring.

use serde_json::{Map, Value};

use crate::diagnostics::MemoryDiagnostics;

use super::breadcrumb_ring::{BreadcrumbRing, with_suppressed_count};
use super::model::CrashReportDetails;

const COALESCE_MS: i64 = 30_000;

pub(super) fn record_renderer_breadcrumb(
    ring: &BreadcrumbRing,
    diagnostics: &MemoryDiagnostics,
    name: &str,
    data: Option<CrashReportDetails>,
) {
    let key = if is_coalesced_name(name) {
        coalesce_key(name, data.as_ref())
    } else {
        None
    };
    let Some(key) = key else {
        ring.record(name, data.clone());
        record_trace(diagnostics, name, data);
        return;
    };
    let Some(outcome) = ring.record_coalesced(name, data.clone(), &key, COALESCE_MS) else {
        return;
    };
    let traced_data = if outcome.suppressed_since_last > 0 {
        Some(with_suppressed_count(data, outcome.suppressed_since_last))
    } else {
        data
    };
    record_trace(diagnostics, name, traced_data);
}

fn is_coalesced_name(name: &str) -> bool {
    matches!(name, "renderer_error" | "renderer_unhandled_rejection")
}

/// Mirrors `coalesceKey`: `None` means "no stable identity for this event", which
/// callers treat as "record uncoalesced" rather than "suppress".
fn coalesce_key(name: &str, data: Option<&CrashReportDetails>) -> Option<String> {
    let get = |key: &str| data.and_then(|data| data.get(key));
    let primary = if name == "renderer_error" {
        get("message")
    } else {
        get("reasonMessage")
    };
    let fallback = if name == "renderer_error" {
        get("errorMessage")
    } else {
        None
    };
    let message = non_empty_str(primary).or_else(|| non_empty_str(fallback))?;
    let identity: Vec<Value> = if name == "renderer_error" {
        [
            "errorStack",
            "filename",
            "lineno",
            "colno",
            "errorType",
            "errorName",
            "errorMessage",
        ]
        .into_iter()
        .map(|key| get(key).cloned().unwrap_or(Value::Null))
        .collect()
    } else {
        ["reasonStack", "reasonType", "reasonName"]
            .into_iter()
            .map(|key| get(key).cloned().unwrap_or(Value::Null))
            .collect()
    };
    let mut entries = vec![
        Value::String(name.to_owned()),
        Value::String(message.to_owned()),
    ];
    entries.extend(identity);
    serde_json::to_string(&Value::Array(entries)).ok()
}

fn non_empty_str(value: Option<&Value>) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
}

fn record_trace(diagnostics: &MemoryDiagnostics, name: &str, data: Option<CrashReportDetails>) {
    let mut attributes = Map::from_iter([
        (
            "kind".to_owned(),
            Value::String("crash-breadcrumb".to_owned()),
        ),
        (
            "breadcrumb.name".to_owned(),
            Value::String(super::redaction::sanitize_string(name)),
        ),
    ]);
    if let Some(data) = data {
        attributes.insert("breadcrumb.data".to_owned(), Value::Object(data));
    }
    let mut span = diagnostics.start_trace_span("renderer.breadcrumb", attributes);
    span.success();
}

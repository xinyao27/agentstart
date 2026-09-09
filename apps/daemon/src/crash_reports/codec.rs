// Why: Existing report files are untrusted; malformed entries are dropped while valid entries remain recoverable.

use serde_json::{Map, Value};

use super::host_info::is_known_platform;
use super::model::{
    CrashReportBreadcrumb, CrashReportDetails, CrashReportRecord, CrashReportSource,
    CrashReportStatus,
};
use super::redaction::{sanitize_breadcrumbs, sanitize_details, sanitize_string_with_limit};

const REQUIRED_STRING_MAX_LENGTH: usize = 4_000;

pub(super) fn decode_reports(value: &Value, max_reports: usize) -> Vec<CrashReportRecord> {
    let Some(reports) = object_value(value)
        .and_then(|root| root.get("reports"))
        .and_then(Value::as_array)
    else {
        return Vec::new();
    };
    reports
        .iter()
        .take(max_reports)
        .filter_map(decode_report)
        .collect()
}

fn decode_report(value: &Value) -> Option<CrashReportRecord> {
    let record = object_value(value)?;
    let id = required_string(record, "id")?;
    let created_at = required_string(record, "createdAt")?;
    let status = crash_status(record.get("status"))?;
    let source = crash_source(record.get("source"))?;
    let process_type = required_string(record, "processType")?;
    let reason = required_string(record, "reason")?;
    let app_version = required_string(record, "appVersion")?;
    let platform = platform_value(record.get("platform"))?;
    let os_release = required_string(record, "osRelease")?;
    let arch = required_string(record, "arch")?;
    let chrome_version = required_string(record, "chromeVersion")?;
    let exit_code = exit_code_value(record.get("exitCode"))?;
    let details = record
        .get("details")
        .and_then(object_value)
        .cloned()
        .unwrap_or_default();
    let breadcrumbs = record
        .get("breadcrumbs")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(breadcrumb_input)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Some(CrashReportRecord {
        id,
        created_at,
        status,
        source,
        process_type,
        reason,
        exit_code,
        app_version,
        platform,
        os_release,
        arch,
        chrome_version,
        details: sanitize_details(&details),
        breadcrumbs: sanitize_breadcrumbs(&breadcrumbs),
    })
}

fn object_value(value: &Value) -> Option<&Map<String, Value>> {
    value.as_object()
}

fn required_string(record: &Map<String, Value>, key: &str) -> Option<String> {
    let value = record.get(key)?.as_str()?;
    if value.trim().is_empty() {
        return None;
    }
    Some(sanitize_string_with_limit(
        value,
        REQUIRED_STRING_MAX_LENGTH,
    ))
}

fn crash_status(value: Option<&Value>) -> Option<CrashReportStatus> {
    match value?.as_str()? {
        "pending" => Some(CrashReportStatus::Pending),
        "sent" => Some(CrashReportStatus::Sent),
        "dismissed" => Some(CrashReportStatus::Dismissed),
        _ => None,
    }
}

fn crash_source(value: Option<&Value>) -> Option<CrashReportSource> {
    match value?.as_str()? {
        "renderer" => Some(CrashReportSource::Renderer),
        "child" => Some(CrashReportSource::Child),
        _ => None,
    }
}

fn platform_value(value: Option<&Value>) -> Option<String> {
    let value = value?.as_str()?;
    is_known_platform(value).then(|| value.to_owned())
}

fn exit_code_value(value: Option<&Value>) -> Option<Option<i64>> {
    match value {
        None | Some(Value::Null) => Some(None),
        Some(Value::Number(number)) => number.as_i64().map(Some),
        _ => None,
    }
}

fn breadcrumb_input(value: &Value) -> Option<CrashReportBreadcrumb> {
    let record = object_value(value)?;
    let created_at = record.get("createdAt")?.as_str()?.to_owned();
    let name = record.get("name")?.as_str()?.to_owned();
    let data: Option<CrashReportDetails> = record.get("data").and_then(object_value).cloned();
    Some(CrashReportBreadcrumb {
        created_at,
        name,
        data,
    })
}

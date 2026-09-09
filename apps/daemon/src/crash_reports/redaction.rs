// Why: Crash reports receive independent redaction before persistence and again before submission; greedy matches may redact extra text but never expose adjacent secrets.

use std::sync::OnceLock;

use regex::{Captures, Regex};

use super::model::{CrashReportBreadcrumb, CrashReportDetails};

const DEFAULT_STRING_DETAIL_LENGTH: usize = 240;
const STACK_DETAIL_LENGTH: usize = 4_000;
const BREADCRUMB_NAME_LENGTH: usize = 80;
const MAX_BREADCRUMBS: usize = 30;

pub(super) fn sanitize_string(value: &str) -> String {
    sanitize_string_with_limit(value, DEFAULT_STRING_DETAIL_LENGTH)
}

pub(super) fn sanitize_string_with_limit(value: &str, max_length: usize) -> String {
    let value = unix_users_home().replace_all(value, "[redacted-path]");
    let value = unix_other_roots().replace_all(&value, "[redacted-path]");
    let value = generic_absolute_path().replace_all(&value, "[redacted-path]");
    let value = windows_drive_path().replace_all(&value, "[redacted-path]");
    let value = unc_path().replace_all(&value, "[redacted-path]");
    let value = github_token().replace_all(&value, secret_replacer);
    let value = opaque_secret_token().replace_all(&value, secret_replacer);
    let value = userinfo_credential().replace_all(&value, secret_replacer);
    let value = labeled_secret().replace_all(&value, labeled_secret_replacer);
    truncate_chars(&value, max_length)
}

fn max_detail_string_length_for_key(key: &str) -> usize {
    if detail_key_is_stack(key) {
        STACK_DETAIL_LENGTH
    } else {
        DEFAULT_STRING_DETAIL_LENGTH
    }
}

fn detail_key_is_stack(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    key == "stack" || key == "component_stack" || key == "error_stack" || key.ends_with("_stack")
}

/// Mirrors `sanitizeCrashReportDetails`: strings are redacted and length-capped,
/// finite numbers/booleans/null pass through, everything else (arrays, objects,
/// non-finite numbers) is dropped.
pub(super) fn sanitize_details(details: &CrashReportDetails) -> CrashReportDetails {
    let mut sanitized = CrashReportDetails::new();
    for (key, value) in details {
        let value = match value {
            serde_json::Value::String(text) => serde_json::Value::String(
                sanitize_string_with_limit(text, max_detail_string_length_for_key(key)),
            ),
            serde_json::Value::Number(number) if number.as_f64().is_some_and(f64::is_finite) => {
                serde_json::Value::Number(number.clone())
            }
            serde_json::Value::Bool(_) | serde_json::Value::Null => value.clone(),
            _ => continue,
        };
        sanitized.insert(key.clone(), value);
    }
    sanitized
}

/// Mirrors `sanitizeCrashReportBreadcrumbs`: drops blank name/createdAt entries, caps
/// each breadcrumb's `data` through `sanitize_details`, and keeps only the newest
/// `MAX_BREADCRUMBS`. Returns `None` for an empty input, matching the TS `undefined`.
pub(super) fn sanitize_breadcrumbs(
    breadcrumbs: &[CrashReportBreadcrumb],
) -> Option<Vec<CrashReportBreadcrumb>> {
    if breadcrumbs.is_empty() {
        return None;
    }
    let start = breadcrumbs.len().saturating_sub(MAX_BREADCRUMBS);
    let sanitized: Vec<CrashReportBreadcrumb> = breadcrumbs[start..]
        .iter()
        .filter_map(|breadcrumb| {
            if breadcrumb.name.trim().is_empty() || breadcrumb.created_at.trim().is_empty() {
                return None;
            }
            let data = breadcrumb
                .data
                .as_ref()
                .map(sanitize_details)
                .filter(|data| !data.is_empty());
            Some(CrashReportBreadcrumb {
                created_at: sanitize_string(&breadcrumb.created_at),
                name: super::model::utf16_prefix(
                    &sanitize_string(&breadcrumb.name),
                    BREADCRUMB_NAME_LENGTH,
                )
                .to_owned(),
                data,
            })
        })
        .collect();
    (!sanitized.is_empty()).then_some(sanitized)
}

fn truncate_chars(value: &str, max_length: usize) -> String {
    let prefix = super::model::utf16_prefix(value, max_length);
    if prefix.len() == value.len() {
        return value.to_owned();
    }
    format!("{prefix}...")
}

fn secret_replacer(captures: &Captures<'_>) -> String {
    let matched = &captures[0];
    if matched.contains('@') {
        "[redacted-credential]@".to_owned()
    } else {
        "[redacted-secret]".to_owned()
    }
}

fn labeled_secret_replacer(captures: &Captures<'_>) -> String {
    let key = &captures[1];
    format!("{key}=[redacted]")
}

fn expression(cell: &'static OnceLock<Regex>, source: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(source).expect("crash report redaction expression is valid"))
}

fn unix_users_home() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r#"(?i)/(?:Users|home)/[^"'`<>\n\r)]+"#)
}

fn unix_other_roots() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(
        &VALUE,
        r#"(?i)/(?:Applications|Library|System|Volumes|etc|media|mnt|opt|private|root|srv|tmp|usr|var)/[^"'`<>\n\r)]+"#,
    )
}

fn generic_absolute_path() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r#"(?i)/[A-Za-z0-9._ -]+/[^"'`<>\n\r)]+"#)
}

fn windows_drive_path() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r#"(?i)[A-Za-z]:\\[^"'`<>\n\r)]+"#)
}

fn unc_path() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r#"(?i)\\\\[^\\\s"'`<>\n\r)]+\\[^"'`<>\n\r)]+"#)
}

fn github_token() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r"\b(gh[pousr]_[A-Za-z0-9_]{20,})\b")
}

fn opaque_secret_token() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r"\bsk-[A-Za-z0-9_-]{20,}\b")
}

/// `user:pass@host` userinfo. The TS source's trailing `(?=[^/\s]+)` lookahead is a
/// zero-width existence check that never changes what gets matched or replaced, so
/// dropping it (lookahead is unsupported here) is a no-op, not a behavior change.
fn userinfo_credential() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(&VALUE, r"\b[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+-]+@")
}

fn labeled_secret() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    expression(
        &VALUE,
        r"(?i)\b(token|api[_-]?key|secret|password)=([^&\s]+)",
    )
}

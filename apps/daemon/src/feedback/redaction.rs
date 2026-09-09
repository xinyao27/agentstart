use std::sync::OnceLock;

use regex::Regex;

use crate::redaction::{redact_paths, redact_string};

// Why: An identity occupies one line, so control-character runs collapse to spaces.
pub(super) fn sanitize_identity(value: Option<&str>, max_chars: usize) -> Option<String> {
    let value = value?;
    let single_line = control_run().replace_all(value, " ");
    let trimmed = single_line.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(truncate_chars(trimmed, max_chars))
}

// Why: mirrors `sanitizeBoundedText` (redact, bound with a truncation
// marker, trim, then bound again) so an oversized feedback body degrades to
// a truncated report instead of being rejected outright.
pub(super) fn sanitize_report_text(value: &str, max_chars: usize) -> Option<String> {
    if value.is_empty() {
        return None;
    }
    let redacted = redact_paths(&redact_string(value));
    let bounded = bound_with_marker(&redacted, max_chars);
    let trimmed = bounded.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(truncate_chars(trimmed, max_chars))
}

fn bound_with_marker(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_owned();
    }
    format!("{}...", truncate_chars(value, max_chars))
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn control_run() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    VALUE.get_or_init(|| Regex::new(r"\p{Cc}+").expect("control-character pattern is valid"))
}

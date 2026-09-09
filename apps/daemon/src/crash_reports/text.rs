// Why: matches protocol/crash-reports/report-text.ts for support attachments; values
// not sanitized while recording must be redacted before entering copied report text.

use super::model::{
    CrashReportDiagnosticBundle, CrashReportRecord, CrashReportSource, CrashReportStatus,
    js_string_scalar,
};
use super::redaction::sanitize_string;

const MAX_FORMATTED_REPORT_LENGTH: usize = 64_000;
const TRUNCATION_SUFFIX: &str = "\n\n[Crash report truncated to fit feedback endpoint limits.]";

pub(super) struct UncapturedCrashReportContext {
    pub(super) created_at: String,
    pub(super) app_version: String,
    pub(super) platform: String,
    pub(super) os_release: String,
    pub(super) arch: String,
    pub(super) chrome_version: String,
}

pub(super) fn format_crash_report_text(
    report: &CrashReportRecord,
    notes: Option<&str>,
    diagnostic_bundle: Option<&CrashReportDiagnosticBundle>,
) -> String {
    let mut lines = vec![
        "[Crash Report]".to_owned(),
        String::new(),
        format!("Report ID: {}", report.id),
        format!("Created: {}", report.created_at),
        format!("Status: {}", status_str(report.status)),
        format!("Source: {}", source_str(report.source)),
        format!("Process: {}", report.process_type),
        format!("Reason: {}", report.reason),
        format!(
            "Exit code: {}",
            report
                .exit_code
                .map_or_else(|| "unknown".to_owned(), |value| value.to_string())
        ),
        format!("App version: {}", report.app_version),
        format!(
            "Platform: {} {} {}",
            report.platform, report.os_release, report.arch
        ),
        format!("Chrome: {}", report.chrome_version),
    ];

    append_diagnostic_bundle_lines(&mut lines, diagnostic_bundle);

    if !report.details.is_empty() {
        lines.push(String::new());
        lines.push("Details:".to_owned());
        for (key, value) in &report.details {
            lines.push(format!("- {key}: {}", js_string_scalar(value)));
        }
    }

    if let Some(breadcrumbs) = report
        .breadcrumbs
        .as_ref()
        .filter(|breadcrumbs| !breadcrumbs.is_empty())
    {
        lines.push(String::new());
        lines.push("Recent activity:".to_owned());
        for breadcrumb in breadcrumbs {
            let suffix = breadcrumb
                .data
                .as_ref()
                .filter(|data| !data.is_empty())
                .map(|data| {
                    let entries = data
                        .iter()
                        .map(|(key, value)| format!("{key}={}", js_string_scalar(value)))
                        .collect::<Vec<_>>()
                        .join(", ");
                    format!(" ({entries})")
                })
                .unwrap_or_default();
            lines.push(format!(
                "- {}: {}{suffix}",
                breadcrumb.created_at, breadcrumb.name
            ));
        }
    }

    push_notes(&mut lines, notes);
    truncate_formatted_report(lines.join("\n"))
}

pub(super) fn format_uncaptured_crash_report_text(
    context: &UncapturedCrashReportContext,
    notes: Option<&str>,
    diagnostic_bundle: Option<&CrashReportDiagnosticBundle>,
) -> String {
    let mut lines = vec![
        "[Crash Report]".to_owned(),
        String::new(),
        "Report ID: not captured".to_owned(),
        format!("Created: {}", context.created_at),
        "Status: uncaptured".to_owned(),
        "Source: user-reported".to_owned(),
        "Process: unknown".to_owned(),
        "Reason: no captured crash report".to_owned(),
        "Exit code: unknown".to_owned(),
        format!("App version: {}", context.app_version),
        format!(
            "Platform: {} {} {}",
            context.platform, context.os_release, context.arch
        ),
        format!("Chrome: {}", context.chrome_version),
        String::new(),
        "Details:".to_owned(),
        "- captured_crash_report: false".to_owned(),
        "- report_source: help_menu".to_owned(),
    ];

    append_diagnostic_bundle_lines(&mut lines, diagnostic_bundle);
    push_notes(&mut lines, notes);
    truncate_formatted_report(lines.join("\n"))
}

fn push_notes(lines: &mut Vec<String>, notes: Option<&str>) {
    let Some(trimmed) = notes.map(str::trim).filter(|notes| !notes.is_empty()) else {
        return;
    };
    lines.push(String::new());
    lines.push("User notes:".to_owned());
    lines.push(sanitize_string(trimmed));
}

fn append_diagnostic_bundle_lines(
    lines: &mut Vec<String>,
    diagnostic_bundle: Option<&CrashReportDiagnosticBundle>,
) {
    let Some(bundle) = diagnostic_bundle else {
        return;
    };
    lines.push(String::new());
    lines.push("Diagnostic log:".to_owned());
    match bundle {
        CrashReportDiagnosticBundle::Attached {
            bundle_submission_id,
            bytes,
            span_count,
        } => {
            lines.push("- Status: attached".to_owned());
            lines.push(format!(
                "- Bundle submission ID: {}",
                sanitize_string(bundle_submission_id)
            ));
            lines.push(format!("- Spans: {span_count}"));
            lines.push(format!("- Bytes: {bytes}"));
        }
        CrashReportDiagnosticBundle::NotUploaded {
            reason,
            bundle_submission_id,
            bytes,
            span_count,
        } => {
            lines.push("- Status: not uploaded".to_owned());
            lines.push(format!("- Reason: {}", sanitize_string(reason)));
            if let Some(bundle_submission_id) = bundle_submission_id {
                lines.push(format!(
                    "- Bundle submission ID: {}",
                    sanitize_string(bundle_submission_id)
                ));
            }
            if let Some(span_count) = span_count {
                lines.push(format!("- Spans: {span_count}"));
            }
            if let Some(bytes) = bytes {
                lines.push(format!("- Bytes: {bytes}"));
            }
        }
    }
}

fn status_str(status: CrashReportStatus) -> &'static str {
    match status {
        CrashReportStatus::Pending => "pending",
        CrashReportStatus::Sent => "sent",
        CrashReportStatus::Dismissed => "dismissed",
    }
}

fn source_str(source: CrashReportSource) -> &'static str {
    match source {
        CrashReportSource::Renderer => "renderer",
        CrashReportSource::Child => "child",
    }
}

fn truncate_formatted_report(text: String) -> String {
    if text.encode_utf16().count() <= MAX_FORMATTED_REPORT_LENGTH {
        return text;
    }
    // Why: the feedback endpoint accepts larger crash bodies and handles
    // Slack-specific attachments server-side. Keep local reports below that API cap.
    let budget =
        MAX_FORMATTED_REPORT_LENGTH.saturating_sub(TRUNCATION_SUFFIX.encode_utf16().count());
    let truncated = super::model::utf16_prefix(&text, budget);
    format!(
        "{}{TRUNCATION_SUFFIX}",
        truncated.trim_end_matches(super::model::is_js_whitespace)
    )
}

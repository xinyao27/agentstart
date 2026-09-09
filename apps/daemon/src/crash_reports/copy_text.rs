// Why: Manual submission must preserve the reason automatic submission failed.

use std::sync::OnceLock;

use regex::Regex;

use super::model::{CrashReportCopyDiagnosticContext, CrashReportCopySubmissionFailure};
use super::redaction::sanitize_string;

pub(super) fn format_crash_report_copy_text(
    base_text: &str,
    failure: Option<&CrashReportCopySubmissionFailure>,
) -> String {
    let Some(failure) = failure.and_then(normalize_failure) else {
        return base_text.to_owned();
    };
    let mut lines = vec![
        base_text.to_owned(),
        String::new(),
        "Submission failure:".to_owned(),
        format!("- Report error: {}", failure.error),
    ];
    match failure.diagnostic_context {
        Some(CrashReportCopyDiagnosticContext::Uploaded { ticket_id }) => {
            lines.push(format!(
                "- Diagnostic ticket uploaded but not linked: {ticket_id}"
            ));
        }
        Some(CrashReportCopyDiagnosticContext::NotUploaded { reason }) => {
            lines.push(format!("- Diagnostic logs not uploaded: {reason}"));
        }
        None => {}
    }
    lines.join("\n")
}

struct NormalizedFailure {
    error: String,
    diagnostic_context: Option<CrashReportCopyDiagnosticContext>,
}

fn normalize_failure(failure: &CrashReportCopySubmissionFailure) -> Option<NormalizedFailure> {
    let error = sanitized_line(&failure.error)?;
    let diagnostic_context = match failure.diagnostic_context.as_ref() {
        Some(CrashReportCopyDiagnosticContext::Uploaded { ticket_id }) => sanitized_line(ticket_id)
            .map(|ticket_id| CrashReportCopyDiagnosticContext::Uploaded { ticket_id }),
        Some(CrashReportCopyDiagnosticContext::NotUploaded { reason }) => sanitized_line(reason)
            .map(|reason| CrashReportCopyDiagnosticContext::NotUploaded { reason }),
        None => None,
    };
    Some(NormalizedFailure {
        error,
        diagnostic_context,
    })
}

fn sanitized_line(value: &str) -> Option<String> {
    let collapsed = newline_run().replace_all(value, " ");
    let sanitized = sanitize_string(&collapsed).trim().to_owned();
    (!sanitized.is_empty()).then_some(sanitized)
}

fn newline_run() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    VALUE.get_or_init(|| Regex::new(r"[\r\n]+").expect("newline-run expression is valid"))
}

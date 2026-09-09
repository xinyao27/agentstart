use crate::diagnostics::{DiagnosticsDisabledReason, MemoryDiagnostics, SupportDiagnosticsError};
use crate::telemetry::SupportDiagnosticReport;

use super::model::CrashReportDiagnosticBundle;
use super::redaction::sanitize_string;

pub(super) struct CrashDiagnosticAttachment {
    pub(super) diagnostic_bundle: CrashReportDiagnosticBundle,
    pub(super) support_report: Option<SupportDiagnosticReport>,
}

/// Matches the TS source's 3-day window for what a crash report's attached bundle
/// covers.
const CRASH_REPORT_LOOKBACK_MINUTES: u32 = 3 * 24 * 60;

pub(super) async fn prepare_crash_diagnostic_attachment(
    diagnostics: &MemoryDiagnostics,
    include_diagnostic_logs: bool,
) -> CrashDiagnosticAttachment {
    if !include_diagnostic_logs {
        return not_uploaded("diagnostic log upload skipped by user".to_owned());
    }
    let status = diagnostics.support_status();
    if !status.bundle_enabled {
        return not_uploaded(
            status
                .disabled_reason
                .map(disabled_reason_code)
                .unwrap_or("diagnostic bundle collection is disabled")
                .to_owned(),
        );
    }
    match diagnostics
        .collect_crash_report_diagnostics(CRASH_REPORT_LOOKBACK_MINUTES)
        .await
    {
        Ok(bundle) => CrashDiagnosticAttachment {
            diagnostic_bundle: CrashReportDiagnosticBundle::Attached {
                bundle_submission_id: bundle.bundle_submission_id.clone(),
                bytes: bundle.bytes,
                span_count: bundle.span_count,
            },
            support_report: Some(bundle),
        },
        Err(error) => not_uploaded(collect_error_text(&error)),
    }
}

fn collect_error_text(error: &SupportDiagnosticsError) -> String {
    sanitize_string(&error.to_string())
}

// Why: The diagnostics disabled reason is a machine-readable code retained in submitted reports.
fn disabled_reason_code(reason: DiagnosticsDisabledReason) -> &'static str {
    match reason {
        DiagnosticsDisabledReason::DoNotTrack => "do_not_track",
        DiagnosticsDisabledReason::YiruTelemetryDisabled => "yiru_telemetry_disabled",
        DiagnosticsDisabledReason::YiruDiagnosticsDisabled => "yiru_diagnostics_disabled",
        DiagnosticsDisabledReason::Ci => "ci",
    }
}

fn not_uploaded(reason: String) -> CrashDiagnosticAttachment {
    CrashDiagnosticAttachment {
        diagnostic_bundle: CrashReportDiagnosticBundle::NotUploaded {
            reason,
            bundle_submission_id: None,
            bytes: None,
            span_count: None,
        },
        support_report: None,
    }
}

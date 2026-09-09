// Why: decode/encode between yiru.runtime.v1.CrashReportsService wire messages and
// `crate::crash_reports`'s domain types. Kept separate from crash_reports.rs (the
// dispatch surface) because this file is pure conversion — the same split
// rpc/github.rs + rpc/github/protocol.rs uses.

use serde_json::Value as JsonValue;
use yiru_protocol::runtime::v1::crash_report_copy_submission_failure::DiagnosticContext as ProtoCopyDiagnosticContext;
use yiru_protocol::runtime::v1::crash_report_detail_value::Kind as ProtoDetailKind;
use yiru_protocol::runtime::v1::crash_report_diagnostic_bundle::Status as ProtoDiagnosticBundleStatus;
use yiru_protocol::runtime::v1::crash_report_nullable_string::Value as ProtoNullableValue;
use yiru_protocol::runtime::v1::crash_reports_service_copy_latest_diagnostics_response::Result as ProtoCopyResult;
use yiru_protocol::runtime::v1::crash_reports_service_record_renderer_error_response::Result as ProtoRendererErrorResult;
use yiru_protocol::runtime::v1::crash_reports_service_submit_response::Result as ProtoSubmitResult;
use yiru_protocol::runtime::v1::{
    CrashReport as ProtoCrashReport, CrashReportBreadcrumb as ProtoCrashReportBreadcrumb,
    CrashReportCopyDiagnosticNotUploaded as ProtoCopyDiagnosticNotUploaded,
    CrashReportCopyDiagnosticUploaded as ProtoCopyDiagnosticUploaded,
    CrashReportCopySubmissionFailure as ProtoCopySubmissionFailure,
    CrashReportDetailNull as ProtoDetailNull, CrashReportDetailValue as ProtoDetailValue,
    CrashReportDetails as ProtoDetails, CrashReportDiagnosticBundle as ProtoDiagnosticBundle,
    CrashReportDiagnosticBundleAttached as ProtoDiagnosticBundleAttached,
    CrashReportDiagnosticBundleNotUploaded as ProtoDiagnosticBundleNotUploaded,
    CrashReportNullableString as ProtoNullableString, CrashReportSource as ProtoSource,
    CrashReportStatus as ProtoStatus, CrashReportSubmitFailure as ProtoSubmitFailure,
    CrashReportSubmitSuccess as ProtoSubmitSuccess,
    CrashReportsServiceCopyLatestDiagnosticsRequest as ProtoCopyRequest,
    CrashReportsServiceCopyLatestDiagnosticsResponse as ProtoCopyResponse,
    CrashReportsServiceDismissResponse as ProtoDismissResponse,
    CrashReportsServiceGetLatestPendingResponse as ProtoGetLatestPendingResponse,
    CrashReportsServiceGetLatestReportResponse as ProtoGetLatestReportResponse,
    CrashReportsServiceRecordRendererErrorRequest as ProtoRecordRendererErrorRequest,
    CrashReportsServiceRecordRendererErrorResponse as ProtoRecordRendererErrorResponse,
    CrashReportsServiceSubmitRequest as ProtoSubmitRequest,
    CrashReportsServiceSubmitResponse as ProtoSubmitResponse,
    RendererErrorReportKind as ProtoRendererErrorReportKind,
    RendererErrorReportSuccess as ProtoRendererErrorReportSuccess,
    RendererErrorSurface as ProtoRendererErrorSurface,
};

use crate::crash_reports::model::{
    CrashReportBreadcrumb, CrashReportCopyDiagnosticContext, CrashReportCopyDiagnosticsArgs,
    CrashReportCopyDiagnosticsResult, CrashReportCopySubmissionFailure, CrashReportDetails,
    CrashReportDiagnosticBundle, CrashReportRecord, CrashReportSource, CrashReportStatus,
    CrashReportSubmitArgs, CrashReportSubmitResult, NullableField, RendererErrorReportArgs,
    RendererErrorReportKind, RendererErrorReportResult, RendererErrorSurface,
};

pub(super) fn encode_report(report: CrashReportRecord) -> ProtoCrashReport {
    ProtoCrashReport {
        id: report.id,
        created_at: report.created_at,
        status: encode_status(report.status) as i32,
        source: encode_source(report.source) as i32,
        process_type: report.process_type,
        reason: report.reason,
        exit_code: report.exit_code,
        app_version: report.app_version,
        platform: report.platform,
        os_release: report.os_release,
        arch: report.arch,
        chrome_version: report.chrome_version,
        details: Some(encode_details(report.details)),
        breadcrumbs: report
            .breadcrumbs
            .unwrap_or_default()
            .into_iter()
            .map(encode_breadcrumb)
            .collect(),
    }
}

fn encode_status(status: CrashReportStatus) -> ProtoStatus {
    match status {
        CrashReportStatus::Pending => ProtoStatus::Pending,
        CrashReportStatus::Sent => ProtoStatus::Sent,
        CrashReportStatus::Dismissed => ProtoStatus::Dismissed,
    }
}

fn encode_source(source: CrashReportSource) -> ProtoSource {
    match source {
        CrashReportSource::Renderer => ProtoSource::Renderer,
        CrashReportSource::Child => ProtoSource::Child,
    }
}

fn encode_breadcrumb(breadcrumb: CrashReportBreadcrumb) -> ProtoCrashReportBreadcrumb {
    ProtoCrashReportBreadcrumb {
        created_at: breadcrumb.created_at,
        name: breadcrumb.name,
        data: Some(encode_details(breadcrumb.data.unwrap_or_default())),
    }
}

fn encode_details(details: CrashReportDetails) -> ProtoDetails {
    ProtoDetails {
        entries: details
            .into_iter()
            .map(|(key, value)| (key, encode_detail_value(value)))
            .collect(),
    }
}

fn encode_detail_value(value: JsonValue) -> ProtoDetailValue {
    let kind = match value {
        JsonValue::String(text) => Some(ProtoDetailKind::StringValue(text)),
        JsonValue::Number(number) => Some(ProtoDetailKind::NumberValue(
            number.as_f64().unwrap_or_default(),
        )),
        JsonValue::Bool(value) => Some(ProtoDetailKind::BoolValue(value)),
        // Why: `sanitize_details`/`sanitize_breadcrumbs` already restrict stored
        // values to string/number/bool/null, so arrays/objects never reach here — the
        // null-value branch is both the explicit-null case and this defensive default.
        JsonValue::Null | JsonValue::Array(_) | JsonValue::Object(_) => {
            Some(ProtoDetailKind::NullValue(ProtoDetailNull {}))
        }
    };
    ProtoDetailValue { kind }
}

pub(super) fn decode_details(details: ProtoDetails) -> CrashReportDetails {
    let mut map = CrashReportDetails::new();
    for (key, value) in details.entries {
        map.insert(key, decode_detail_value(value));
    }
    map
}

fn decode_detail_value(value: ProtoDetailValue) -> JsonValue {
    match value.kind {
        Some(ProtoDetailKind::StringValue(text)) => JsonValue::String(text),
        Some(ProtoDetailKind::NumberValue(number)) => serde_json::Number::from_f64(number)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null),
        Some(ProtoDetailKind::BoolValue(value)) => JsonValue::Bool(value),
        Some(ProtoDetailKind::NullValue(_)) | None => JsonValue::Null,
    }
}

pub(super) fn encode_optional_report(
    report: Option<CrashReportRecord>,
) -> Option<ProtoCrashReport> {
    report.map(encode_report)
}

pub(super) fn get_latest_pending_response(
    report: Option<CrashReportRecord>,
) -> ProtoGetLatestPendingResponse {
    ProtoGetLatestPendingResponse {
        report: encode_optional_report(report),
    }
}

pub(super) fn get_latest_report_response(
    report: Option<CrashReportRecord>,
) -> ProtoGetLatestReportResponse {
    ProtoGetLatestReportResponse {
        report: encode_optional_report(report),
    }
}

pub(super) fn dismiss_response(report: Option<CrashReportRecord>) -> ProtoDismissResponse {
    ProtoDismissResponse {
        report: encode_optional_report(report),
    }
}

pub(super) fn decode_nullable_string(value: Option<ProtoNullableString>) -> NullableField {
    match value.and_then(|value| value.value) {
        None => NullableField::Absent,
        Some(ProtoNullableValue::Null(_)) => NullableField::Null,
        Some(ProtoNullableValue::Text(text)) => NullableField::Value(text),
    }
}

pub(super) fn decode_renderer_error_kind(value: i32) -> RendererErrorReportKind {
    // Why: Unknown report kinds fall back to react-error-boundary so older stored values remain acceptable.
    match ProtoRendererErrorReportKind::try_from(value) {
        Ok(ProtoRendererErrorReportKind::RendererUnhandledError) => {
            RendererErrorReportKind::RendererUnhandledError
        }
        Ok(ProtoRendererErrorReportKind::TerminalError) => RendererErrorReportKind::TerminalError,
        Ok(
            ProtoRendererErrorReportKind::ReactErrorBoundary
            | ProtoRendererErrorReportKind::Unspecified,
        )
        | Err(_) => RendererErrorReportKind::ReactErrorBoundary,
    }
}

pub(super) fn decode_renderer_error_surface(value: i32) -> Option<RendererErrorSurface> {
    match ProtoRendererErrorSurface::try_from(value) {
        Ok(ProtoRendererErrorSurface::AppRoot) => Some(RendererErrorSurface::AppRoot),
        Ok(ProtoRendererErrorSurface::WebRoot) => Some(RendererErrorSurface::WebRoot),
        Ok(ProtoRendererErrorSurface::WorkspaceShell) => Some(RendererErrorSurface::WorkspaceShell),
        Ok(ProtoRendererErrorSurface::Sidebar) => Some(RendererErrorSurface::Sidebar),
        Ok(ProtoRendererErrorSurface::TerminalWorkbench) => {
            Some(RendererErrorSurface::TerminalWorkbench)
        }
        Ok(ProtoRendererErrorSurface::RightSidebar) => Some(RendererErrorSurface::RightSidebar),
        Ok(ProtoRendererErrorSurface::Page) => Some(RendererErrorSurface::Page),
        Ok(ProtoRendererErrorSurface::Modal) => Some(RendererErrorSurface::Modal),
        Ok(ProtoRendererErrorSurface::Overlay) => Some(RendererErrorSurface::Overlay),
        Ok(ProtoRendererErrorSurface::RichMarkdownEditor) => {
            Some(RendererErrorSurface::RichMarkdownEditor)
        }
        Ok(ProtoRendererErrorSurface::Unspecified) | Err(_) => None,
    }
}

pub(super) fn decode_renderer_error_args(
    request: ProtoRecordRendererErrorRequest,
) -> RendererErrorReportArgs {
    RendererErrorReportArgs {
        kind: decode_renderer_error_kind(request.kind),
        origin_id: request.origin_id,
        surface: decode_renderer_error_surface(request.surface),
        error_name: request.error_name,
        error_message: request.error_message,
        error_stack: request.error_stack,
        component_stack: request.component_stack,
        active_view: request.active_view,
        active_modal: decode_nullable_string(request.active_modal).normalized(80),
        active_tab_type: decode_nullable_string(request.active_tab_type).normalized(80),
        active_right_sidebar_tab: decode_nullable_string(request.active_right_sidebar_tab)
            .normalized(80),
        has_active_worktree: request.has_active_worktree,
        chrome_version: request.chrome_version,
    }
}

pub(super) fn encode_renderer_error_response(
    result: RendererErrorReportResult,
) -> ProtoRecordRendererErrorResponse {
    let result = match result {
        RendererErrorReportResult::Ok { report, deduped } => {
            ProtoRendererErrorResult::Success(ProtoRendererErrorReportSuccess {
                report: encode_optional_report(report.map(|report| *report)),
                deduped,
            })
        }
        RendererErrorReportResult::Err { error } => ProtoRendererErrorResult::Error(error),
    };
    ProtoRecordRendererErrorResponse {
        result: Some(result),
    }
}

pub(super) fn decode_submit_args(request: ProtoSubmitRequest) -> CrashReportSubmitArgs {
    CrashReportSubmitArgs {
        report_id: request.report_id,
        notes: request.notes,
        include_diagnostic_logs: request.include_diagnostic_logs,
        submit_anonymously: request.submit_anonymously.unwrap_or(false),
        github_login: request.github_login,
        github_email: request.github_email,
        chrome_version: request.chrome_version,
    }
}

pub(super) fn encode_submit_response(result: CrashReportSubmitResult) -> ProtoSubmitResponse {
    let result = match result {
        CrashReportSubmitResult::Ok {
            report,
            diagnostic_bundle,
        } => ProtoSubmitResult::Success(ProtoSubmitSuccess {
            report: encode_optional_report(report),
            diagnostic_bundle: diagnostic_bundle.map(encode_diagnostic_bundle),
        }),
        CrashReportSubmitResult::Err {
            status,
            error,
            report,
            diagnostic_bundle,
        } => ProtoSubmitResult::Failure(ProtoSubmitFailure {
            status,
            error,
            report: encode_optional_report(report),
            diagnostic_bundle: diagnostic_bundle.map(encode_diagnostic_bundle),
        }),
    };
    ProtoSubmitResponse {
        result: Some(result),
    }
}

fn encode_diagnostic_bundle(bundle: CrashReportDiagnosticBundle) -> ProtoDiagnosticBundle {
    let status = match bundle {
        CrashReportDiagnosticBundle::Attached {
            bundle_submission_id,
            bytes,
            span_count,
        } => ProtoDiagnosticBundleStatus::Attached(ProtoDiagnosticBundleAttached {
            bundle_submission_id,
            bytes,
            span_count,
        }),
        CrashReportDiagnosticBundle::NotUploaded {
            reason,
            bundle_submission_id,
            bytes,
            span_count,
        } => ProtoDiagnosticBundleStatus::NotUploaded(ProtoDiagnosticBundleNotUploaded {
            reason,
            bundle_submission_id,
            bytes,
            span_count,
        }),
    };
    ProtoDiagnosticBundle {
        status: Some(status),
    }
}

pub(super) fn decode_copy_args(request: ProtoCopyRequest) -> CrashReportCopyDiagnosticsArgs {
    CrashReportCopyDiagnosticsArgs {
        report_id: request.report_id,
        notes: request.notes,
        submission_failure: request.submission_failure.map(decode_submission_failure),
    }
}

fn decode_submission_failure(
    failure: ProtoCopySubmissionFailure,
) -> CrashReportCopySubmissionFailure {
    let diagnostic_context = failure.diagnostic_context.map(|context| match context {
        ProtoCopyDiagnosticContext::Uploaded(ProtoCopyDiagnosticUploaded { ticket_id }) => {
            CrashReportCopyDiagnosticContext::Uploaded { ticket_id }
        }
        ProtoCopyDiagnosticContext::NotUploaded(ProtoCopyDiagnosticNotUploaded { reason }) => {
            CrashReportCopyDiagnosticContext::NotUploaded { reason }
        }
    });
    CrashReportCopySubmissionFailure {
        error: failure.error,
        diagnostic_context,
    }
}

pub(super) fn encode_copy_response(result: CrashReportCopyDiagnosticsResult) -> ProtoCopyResponse {
    let result = match result {
        CrashReportCopyDiagnosticsResult::Ok { text } => ProtoCopyResult::Text(text),
        CrashReportCopyDiagnosticsResult::Err { error } => ProtoCopyResult::Error(error),
    };
    ProtoCopyResponse {
        result: Some(result),
    }
}

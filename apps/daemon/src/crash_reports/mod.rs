//! Local crash capture stays private until user-initiated submission.

mod breadcrumb;
mod breadcrumb_ring;
mod codec;
mod copy_text;
mod diagnostic_attachment;
mod host_info;
pub(crate) mod model;
mod ordered_cache;
mod redaction;
mod renderer_error;
mod store;
mod text;

use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;

use crate::diagnostics::MemoryDiagnostics;
use crate::telemetry::TelemetryAuthority;
use crate::transport::secure_file::SecureFileError;

use breadcrumb::record_renderer_breadcrumb;
use breadcrumb_ring::BreadcrumbRing;
use diagnostic_attachment::{CrashDiagnosticAttachment, prepare_crash_diagnostic_attachment};
use model::{
    CrashReportBreadcrumbRecordArgs, CrashReportCopyDiagnosticsArgs,
    CrashReportCopyDiagnosticsResult, CrashReportDiagnosticBundle, CrashReportRecord,
    CrashReportStatus, CrashReportSubmitArgs, CrashReportSubmitResult, RendererErrorReportArgs,
    RendererErrorReportResult,
};
use ordered_cache::BoundedOrderedMap;
use renderer_error::RendererErrorDedupe;
use store::CrashReportStore;
use text::{
    UncapturedCrashReportContext, format_crash_report_text, format_uncaptured_crash_report_text,
};

const MAX_SUBMITTED_REPORT_IDS: usize = 256;
// Why: Clipboard limits count UTF-8 bytes, as Rust string lengths do.
const CLIPBOARD_TEXT_WRITE_MAX_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone)]
pub(crate) struct CrashReportAuthority {
    inner: std::sync::Arc<Inner>,
}

struct Inner {
    app_version: String,
    diagnostics: MemoryDiagnostics,
    dedupe: RendererErrorDedupe,
    in_flight_submissions: Mutex<HashSet<String>>,
    ring: BreadcrumbRing,
    store: CrashReportStore,
    submitted_report_ids: Mutex<BoundedOrderedMap<()>>,
    telemetry: TelemetryAuthority,
}

// Why: Support event text is bounded for reliable ingestion.
const SUPPORT_REPORT_TEXT_MAX_CHARS: usize = 8_000;

impl CrashReportAuthority {
    pub(crate) fn new(
        user_data_path: &Path,
        telemetry: TelemetryAuthority,
        diagnostics: MemoryDiagnostics,
    ) -> Self {
        Self {
            inner: std::sync::Arc::new(Inner {
                app_version: std::env::var("AGENTSTART_APP_VERSION")
                    .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_owned()),
                diagnostics,
                dedupe: RendererErrorDedupe::new(),
                in_flight_submissions: Mutex::new(HashSet::new()),
                ring: BreadcrumbRing::new(),
                store: CrashReportStore::new(user_data_path),
                submitted_report_ids: Mutex::new(BoundedOrderedMap::new(MAX_SUBMITTED_REPORT_IDS)),
                telemetry,
            }),
        }
    }

    pub(crate) async fn get_latest_pending(&self) -> Option<CrashReportRecord> {
        self.inner
            .store
            .list_recent()
            .await
            .into_iter()
            .find(|report| {
                report.status == CrashReportStatus::Pending && !self.was_submitted(&report.id)
            })
    }

    pub(crate) async fn get_latest_report(&self) -> Option<CrashReportRecord> {
        self.inner
            .store
            .list_recent()
            .await
            .into_iter()
            .find(|report| {
                matches!(
                    report.status,
                    CrashReportStatus::Pending | CrashReportStatus::Dismissed
                ) && !self.was_submitted(&report.id)
            })
    }

    pub(crate) async fn dismiss(
        &self,
        report_id: &str,
    ) -> Result<Option<CrashReportRecord>, SecureFileError> {
        if self.is_in_flight(report_id) {
            return Ok(self.inner.store.get_by_id(report_id).await);
        }
        if self.was_submitted(report_id) {
            return Ok(self.inner.store.get_by_id(report_id).await.map(as_sent));
        }
        self.inner.store.dismiss(report_id).await
    }

    pub(crate) fn record_breadcrumb(&self, args: CrashReportBreadcrumbRecordArgs) {
        record_renderer_breadcrumb(
            &self.inner.ring,
            &self.inner.diagnostics,
            &args.name,
            args.data,
        );
    }

    pub(crate) async fn record_renderer_error(
        &self,
        args: RendererErrorReportArgs,
    ) -> RendererErrorReportResult {
        renderer_error::record(
            &self.inner.store,
            &self.inner.ring,
            &self.inner.dedupe,
            &self.inner.app_version,
            args,
        )
        .await
    }

    pub(crate) async fn copy_latest_diagnostics(
        &self,
        args: CrashReportCopyDiagnosticsArgs,
    ) -> CrashReportCopyDiagnosticsResult {
        let report = self.get_requested_report(args.report_id.as_deref()).await;
        let base_text = match &report {
            Some(report) => format_crash_report_text(report, args.notes.as_deref(), None),
            None => {
                self.format_uncaptured_report(args.notes.as_deref(), None, "unknown")
                    .await
            }
        };
        let text =
            copy_text::format_crash_report_copy_text(&base_text, args.submission_failure.as_ref());
        if text.len() > CLIPBOARD_TEXT_WRITE_MAX_BYTES {
            return CrashReportCopyDiagnosticsResult::Err {
                error: "Crash diagnostics are too large to copy safely.".to_owned(),
            };
        }
        CrashReportCopyDiagnosticsResult::Ok { text }
    }

    pub(crate) async fn submit(&self, args: CrashReportSubmitArgs) -> CrashReportSubmitResult {
        let report = self.get_requested_report(args.report_id.as_deref()).await;
        if let Some(report) = &report {
            let dismissed_by_id =
                args.report_id.is_some() && report.status == CrashReportStatus::Dismissed;
            let already_submitted = self.was_submitted(&report.id);
            if (report.status != CrashReportStatus::Pending && !dismissed_by_id)
                || already_submitted
            {
                return CrashReportSubmitResult::Ok {
                    report: Some(if already_submitted {
                        as_sent(report.clone())
                    } else {
                        report.clone()
                    }),
                    diagnostic_bundle: None,
                };
            }
            if self.is_in_flight(&report.id) {
                return CrashReportSubmitResult::Err {
                    status: None,
                    error: "Crash report submission already in progress.".to_owned(),
                    report: Some(report.clone()),
                    diagnostic_bundle: None,
                };
            }
            self.inner
                .in_flight_submissions
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .insert(report.id.clone());
        }
        let result = self.submit_report(&args, report.clone()).await;
        if let Some(report) = &report {
            self.inner
                .in_flight_submissions
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .remove(&report.id);
        }
        result
    }

    async fn submit_report(
        &self,
        args: &CrashReportSubmitArgs,
        report: Option<CrashReportRecord>,
    ) -> CrashReportSubmitResult {
        let CrashDiagnosticAttachment {
            diagnostic_bundle,
            support_report,
        } = prepare_crash_diagnostic_attachment(
            &self.inner.diagnostics,
            args.include_diagnostic_logs != Some(false),
        )
        .await;
        let report_text = match &report {
            Some(report) => {
                format_crash_report_text(report, args.notes.as_deref(), Some(&diagnostic_bundle))
            }
            None => {
                self.format_uncaptured_report(
                    args.notes.as_deref(),
                    Some(&diagnostic_bundle),
                    args.chrome_version.as_deref().unwrap_or("unknown"),
                )
                .await
            }
        };
        // Why: Redact outbound text again because user notes may contain new secrets.
        let report_text = redaction::sanitize_string_with_limit(
            &crate::redaction::redact_string(&report_text),
            SUPPORT_REPORT_TEXT_MAX_CHARS,
        );
        let report_text = report_text.trim();
        let submission = crate::telemetry::SupportReportSubmission {
            report_type: "crash",
            report_text: Some(report_text.to_owned()),
            submit_anonymously: args.submit_anonymously,
            github_login: (!args.submit_anonymously)
                .then(|| args.github_login.clone())
                .flatten(),
            github_email: (!args.submit_anonymously)
                .then(|| args.github_email.clone())
                .flatten(),
            diagnostic: support_report,
        };
        let outcome = self.inner.telemetry.submit_support_report(submission).await;
        if let Err(error) = outcome {
            let submitted_bundle =
                resolve_submitted_diagnostic_bundle(diagnostic_bundle, Some(&error.to_string()));
            return CrashReportSubmitResult::Err {
                status: None,
                error: error.to_string(),
                report,
                diagnostic_bundle: submitted_bundle,
            };
        }
        let submitted_bundle = resolve_submitted_diagnostic_bundle(diagnostic_bundle, None);
        let Some(report) = report else {
            return CrashReportSubmitResult::Ok {
                report: None,
                diagnostic_bundle: submitted_bundle,
            };
        };
        self.remember_submitted(&report.id);
        let sent = if report.status == CrashReportStatus::Dismissed {
            self.inner.store.mark_dismissed_sent(&report.id).await
        } else {
            self.inner.store.mark_sent(&report.id).await
        };
        let report = match sent {
            Ok(sent) => sent.unwrap_or_else(|| as_sent(report)),
            Err(error) => {
                eprintln!("[crash-reports] failed to mark submitted report sent: {error}");
                as_sent(report)
            }
        };
        CrashReportSubmitResult::Ok {
            report: Some(report),
            diagnostic_bundle: submitted_bundle,
        }
    }

    async fn get_requested_report(&self, report_id: Option<&str>) -> Option<CrashReportRecord> {
        // Why: a request that names no report is Help > Report Crash's deliberate
        // uncaptured report, not "use whatever is pending" — matches the TS source's
        // `getRequestedReport`, minus its `args === undefined` branch (only reachable
        // by an in-process caller with no arguments at all, which no Rust RPC caller
        // can express — every request here decodes to a defined, if empty, message).
        match report_id {
            Some(id) => self.inner.store.get_by_id(id).await,
            None => None,
        }
    }

    async fn format_uncaptured_report(
        &self,
        notes: Option<&str>,
        diagnostic_bundle: Option<&CrashReportDiagnosticBundle>,
        chrome_version: &str,
    ) -> String {
        format_uncaptured_crash_report_text(
            &UncapturedCrashReportContext {
                created_at: now_iso8601(),
                app_version: self.inner.app_version.clone(),
                platform: host_info::platform().to_owned(),
                os_release: host_info::os_release().await,
                arch: host_info::architecture().to_owned(),
                chrome_version: chrome_version.to_owned(),
            },
            notes,
            diagnostic_bundle,
        )
    }

    fn is_in_flight(&self, report_id: &str) -> bool {
        self.inner
            .in_flight_submissions
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .contains(report_id)
    }

    fn was_submitted(&self, report_id: &str) -> bool {
        self.inner
            .submitted_report_ids
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(report_id)
            .is_some()
    }

    fn remember_submitted(&self, report_id: &str) {
        self.inner
            .submitted_report_ids
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .insert_most_recent(report_id.to_owned(), ());
    }
}

fn as_sent(report: CrashReportRecord) -> CrashReportRecord {
    CrashReportRecord {
        status: CrashReportStatus::Sent,
        ..report
    }
}

/// Mirrors `resolveSubmittedDiagnosticBundle`: a bundle that was attached but never
/// makes it out (because the overall submission failed) downgrades to `NotUploaded`
/// so the client doesn't show "attached" for something that was never sent.
fn resolve_submitted_diagnostic_bundle(
    bundle: CrashReportDiagnosticBundle,
    submission_error: Option<&str>,
) -> Option<CrashReportDiagnosticBundle> {
    let Some(submission_error) = submission_error else {
        return Some(bundle);
    };
    let CrashReportDiagnosticBundle::Attached {
        bundle_submission_id,
        bytes,
        span_count,
    } = bundle
    else {
        return Some(bundle);
    };
    Some(CrashReportDiagnosticBundle::NotUploaded {
        reason: redaction::sanitize_string(&format!(
            "diagnostic log excerpt could not be sent: {submission_error}"
        )),
        bundle_submission_id: Some(bundle_submission_id),
        bytes: Some(bytes),
        span_count: Some(span_count),
    })
}

pub(super) fn now_iso8601() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

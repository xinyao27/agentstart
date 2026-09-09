use serde::Serialize;
use serde_json::{Map, Value};
use thiserror::Error;

use crate::settings::SettingsError;

#[derive(Clone)]
pub(super) struct CommonProperties {
    pub(super) install_id: String,
    pub(super) values: Map<String, Value>,
}

#[derive(Clone, Copy)]
pub(super) enum OptInVia {
    FirstLaunchBanner,
    Settings,
}

impl OptInVia {
    pub(super) const fn as_str(self) -> &'static str {
        match self {
            Self::FirstLaunchBanner => "first_launch_banner",
            Self::Settings => "settings",
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(tag = "effective", rename_all = "snake_case")]
pub(crate) enum ConsentState {
    Enabled,
    Disabled { reason: ConsentDisabledReason },
    PendingBanner,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ConsentDisabledReason {
    DoNotTrack,
    YiruDisabled,
    Ci,
    UserOptOut,
}

#[derive(Debug, Error)]
pub(crate) enum TelemetryError {
    #[error("telemetry clock failed: {0}")]
    Clock(#[from] std::time::SystemTimeError),
    #[error("telemetry random identifier generation failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("telemetry settings JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Settings(#[from] SettingsError),
    #[error("telemetry transport worker is unavailable")]
    TransportUnavailable,
}

#[derive(Debug, Error)]
pub(crate) enum SupportReportError {
    #[error("reporting is not configured for this build")]
    NotConfigured,
    #[error("the app is shutting down")]
    ShuttingDown,
    #[error("another report is already being sent")]
    AlreadySending,
    #[error("too many reports were submitted; try again later")]
    RateLimited,
    #[error("report content failed validation")]
    InvalidContent,
    #[error("could not send report to PostHog")]
    Transport,
    #[error(transparent)]
    Telemetry(#[from] TelemetryError),
}

// Why: one shape carries every outbound support report — diagnostics bundles,
// crash reports, and feedback — so the consent, rate-limit and validation gate
// below stays the single place that decides what may leave the machine.
pub(crate) struct SupportReportSubmission {
    pub(crate) diagnostic: Option<SupportDiagnosticReport>,
    pub(crate) github_email: Option<String>,
    pub(crate) github_login: Option<String>,
    pub(crate) report_text: Option<String>,
    pub(crate) report_type: &'static str,
    pub(crate) submit_anonymously: bool,
}

pub(crate) struct SupportDiagnosticReport {
    pub(crate) bundle_submission_id: String,
    pub(crate) bytes: u64,
    pub(crate) excerpt: String,
    pub(crate) excerpt_truncated: bool,
    pub(crate) span_count: u32,
}

mod redaction;

use crate::telemetry::{SupportReportSubmission, TelemetryAuthority};

use redaction::{sanitize_identity, sanitize_report_text};

// Why: Support events have bounded identity and text fields for reliable ingestion.
const REPORT_TEXT_MAX_CHARS: usize = 8_000;
const GITHUB_LOGIN_MAX_CHARS: usize = 128;
const GITHUB_EMAIL_MAX_CHARS: usize = 254;

#[derive(Clone)]
pub(crate) struct FeedbackAuthority {
    telemetry: TelemetryAuthority,
}

pub(crate) struct FeedbackSubmission {
    pub(crate) feedback: String,
    pub(crate) submit_anonymously: bool,
    pub(crate) github_login: Option<String>,
    pub(crate) github_email: Option<String>,
}

impl FeedbackAuthority {
    pub(crate) fn new(telemetry: TelemetryAuthority) -> Self {
        Self { telemetry }
    }

    // Why: Anonymous submissions drop GitHub identity even when the caller supplies it.
    pub(crate) async fn submit(&self, submission: FeedbackSubmission) -> Result<(), String> {
        let report_text = sanitize_report_text(&submission.feedback, REPORT_TEXT_MAX_CHARS);
        let (github_login, github_email) = if submission.submit_anonymously {
            (None, None)
        } else {
            (
                sanitize_identity(submission.github_login.as_deref(), GITHUB_LOGIN_MAX_CHARS),
                sanitize_identity(submission.github_email.as_deref(), GITHUB_EMAIL_MAX_CHARS),
            )
        };
        self.telemetry
            .submit_support_report(SupportReportSubmission {
                diagnostic: None,
                github_email,
                github_login,
                report_text,
                report_type: "feedback",
                submit_anonymously: submission.submit_anonymously,
            })
            .await
            .map(|_report_id| ())
            .map_err(|error| error.to_string())
    }
}

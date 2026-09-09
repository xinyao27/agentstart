pub(super) mod protocol;
pub(super) mod service;

use crate::github::GitHubAuthority;
use crate::telemetry::TelemetryAuthority;

// Why: the `github`/`githubCommentDraft`/`hostedReview` legacy namespace is fully retired;
// `service` and `protocol` (the already-migrated `shell.gh.*` slice) are the only surfaces left.
#[derive(Clone)]
pub(super) struct GitHubRpc {
    authority: GitHubAuthority,
    telemetry: TelemetryAuthority,
}

impl GitHubRpc {
    pub(super) fn new(authority: GitHubAuthority, telemetry: TelemetryAuthority) -> Self {
        Self {
            authority,
            telemetry,
        }
    }

    pub(super) fn close_connection(&self, connection_id: &str) {
        self.authority.close_pr_refresh_window(connection_id);
    }
}

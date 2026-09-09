use super::model::DiagnosticsDisabledReason;

// Why: GITLAB_CI is a vendor-defined generic CI marker, not a review integration.
const CI_ENVIRONMENT: &[&str] = &[
    "CI",
    "GITHUB_ACTIONS",
    "GITLAB_CI",
    "CIRCLECI",
    "TRAVIS",
    "BUILDKITE",
    "JENKINS_URL",
    "TEAMCITY_VERSION",
];

#[derive(Clone, Copy)]
pub(super) struct DiagnosticsPolicy {
    pub(super) bundle_enabled: bool,
    pub(super) disabled_reason: Option<DiagnosticsDisabledReason>,
    pub(super) local_file_enabled: bool,
}

impl DiagnosticsPolicy {
    pub(super) fn resolve() -> Self {
        let disabled_reason = disabled_reason();
        let local_file_enabled = !matches!(
            disabled_reason,
            Some(
                DiagnosticsDisabledReason::Ci | DiagnosticsDisabledReason::YiruDiagnosticsDisabled
            )
        );
        Self {
            bundle_enabled: disabled_reason.is_none(),
            disabled_reason,
            local_file_enabled,
        }
    }
}

fn disabled_reason() -> Option<DiagnosticsDisabledReason> {
    if CI_ENVIRONMENT
        .iter()
        .any(|name| std::env::var_os(name).is_some_and(|value| !value.is_empty()))
    {
        return Some(DiagnosticsDisabledReason::Ci);
    }
    if environment_enabled("YIRU_DIAGNOSTICS_DISABLED") {
        return Some(DiagnosticsDisabledReason::YiruDiagnosticsDisabled);
    }
    if environment_enabled("DO_NOT_TRACK") {
        return Some(DiagnosticsDisabledReason::DoNotTrack);
    }
    if environment_enabled("YIRU_TELEMETRY_DISABLED") {
        return Some(DiagnosticsDisabledReason::YiruTelemetryDisabled);
    }
    None
}

fn environment_enabled(name: &str) -> bool {
    std::env::var(name)
        .is_ok_and(|value| matches!(value.trim().to_ascii_lowercase().as_str(), "1" | "true"))
}

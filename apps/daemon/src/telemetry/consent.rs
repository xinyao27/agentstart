use std::collections::HashSet;

use crate::settings::TelemetrySettings;

use super::model::{ConsentDisabledReason, ConsentState};

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

#[derive(Default)]
pub(super) struct ConsentResolver {
    warned_misconfigured: HashSet<&'static str>,
}

impl ConsentResolver {
    pub(super) fn resolve(&mut self, settings: &TelemetrySettings) -> ConsentState {
        if self.truthy("DO_NOT_TRACK") {
            return ConsentState::Disabled {
                reason: ConsentDisabledReason::DoNotTrack,
            };
        }
        if self.truthy("YIRU_TELEMETRY_DISABLED") {
            return ConsentState::Disabled {
                reason: ConsentDisabledReason::YiruDisabled,
            };
        }
        if CI_ENVIRONMENT
            .iter()
            .any(|name| std::env::var_os(name).is_some_and(|value| !value.is_empty()))
        {
            return ConsentState::Disabled {
                reason: ConsentDisabledReason::Ci,
            };
        }
        match settings.opted_in {
            Some(true) => ConsentState::Enabled,
            Some(false) => ConsentState::Disabled {
                reason: ConsentDisabledReason::UserOptOut,
            },
            None => ConsentState::PendingBanner,
        }
    }

    fn truthy(&mut self, name: &'static str) -> bool {
        let Ok(raw) = std::env::var(name) else {
            return false;
        };
        if raw.is_empty() {
            return false;
        }
        let normalized = raw.trim().to_ascii_lowercase();
        if normalized == "1" || normalized == "true" {
            return true;
        }
        if self.warned_misconfigured.insert(name) {
            eprintln!(
                "[telemetry] {name}={raw:?} is not a recognized truthy value (expected \"1\" or \"true\"); treating as unset."
            );
        }
        false
    }
}

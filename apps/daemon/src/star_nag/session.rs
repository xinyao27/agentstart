// Why: Prompt telemetry captures one session context while mode may change after a failed star attempt.

use serde::Serialize;
use serde_json::{Map, Value};

use crate::github::AppStarSource;

// Why `Serialize` on a domain enum: `crate::shell_events` embeds this type directly in the
// `starNagShow` event it publishes to Chrome over the legacy JSON event channel — the derived
// `rename_all = "lowercase"` representation (`Gh` -> "gh", `Web` -> "web") is the wire value the
// client's `ShellEvent` union already expects (`packages/client/src/runtime/shell-events-client.ts`
// consumers match on `event.mode === 'gh' | 'web'`).
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PromptMode {
    Gh,
    Web,
}

impl PromptMode {
    pub(super) const fn as_str(self) -> &'static str {
        match self {
            Self::Gh => "gh",
            Self::Web => "web",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum PromptSource {
    Threshold,
    AgentValueMoment,
    OnboardingCompleted,
}

impl PromptSource {
    pub(super) const fn as_str(self) -> &'static str {
        match self {
            Self::Threshold => "threshold",
            Self::AgentValueMoment => "agent_value_moment",
            Self::OnboardingCompleted => "onboarding_completed",
        }
    }

    pub(super) const fn as_app_star_source(self) -> AppStarSource {
        match self {
            Self::Threshold => AppStarSource::StarNag,
            Self::AgentValueMoment => AppStarSource::AgentValueMoment,
            Self::OnboardingCompleted => AppStarSource::OnboardingCompleted,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(super) struct PromptSession {
    pub(super) id: u64,
    pub(super) source: PromptSource,
    pub(super) mode: PromptMode,
    pub(super) threshold: u64,
    pub(super) agents_since_baseline: u64,
    pub(super) opened_repo_tracked: bool,
}

impl PromptSession {
    pub(super) const fn new(
        id: u64,
        source: PromptSource,
        mode: PromptMode,
        threshold: u64,
        agents_since_baseline: u64,
    ) -> Self {
        Self {
            id,
            source,
            mode,
            threshold,
            agents_since_baseline,
            opened_repo_tracked: false,
        }
    }

    /// Why: matches `trackStarNagOutcome` — every `star_nag_outcome` capture carries the same
    /// session context plus the outcome, with `mode` following `mode_override` when the caller
    /// passed one (Bun's `options.mode`) and the session's own `mode` otherwise. `nth_repo_added`
    /// is intentionally absent: `TelemetryAuthority::track` injects it automatically for every
    /// event in `REPO_COHORT_EVENTS`, which includes `star_nag_outcome`.
    pub(super) fn outcome_props(
        &self,
        outcome: &str,
        mode_override: Option<PromptMode>,
    ) -> Map<String, Value> {
        Map::from_iter([
            ("outcome".to_owned(), Value::String(outcome.to_owned())),
            (
                "source".to_owned(),
                Value::String(self.source.as_str().to_owned()),
            ),
            (
                "mode".to_owned(),
                Value::String(mode_override.unwrap_or(self.mode).as_str().to_owned()),
            ),
            ("threshold".to_owned(), Value::from(self.threshold)),
            (
                "agents_since_baseline".to_owned(),
                Value::from(self.agents_since_baseline),
            ),
            (
                "agents_since_baseline_bucket".to_owned(),
                Value::String(bucket(self.agents_since_baseline).to_owned()),
            ),
        ])
    }
}

/// Why: matches `bucketStarNagAgentsSinceBaseline` exactly — the bucket boundaries are part of the
/// `star_nag_outcome` telemetry schema (`event-schemas.json`), not free to change independently.
pub(super) fn bucket(agents_since_baseline: u64) -> &'static str {
    if agents_since_baseline < 35 {
        "0-34"
    } else if agents_since_baseline < 70 {
        "35-69"
    } else if agents_since_baseline < 140 {
        "70-139"
    } else if agents_since_baseline < 280 {
        "140-279"
    } else {
        "280+"
    }
}

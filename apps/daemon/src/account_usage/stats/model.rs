#[derive(Clone, Copy, Eq, Ord, PartialEq, PartialOrd)]
pub(crate) enum StatsProvider {
    Claude,
    Codex,
    OpenCode,
}

impl StatsProvider {
    pub(super) const fn is_claude(self) -> bool {
        matches!(self, Self::Claude)
    }

    pub(super) const fn name(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::OpenCode => "open-code",
        }
    }
}

#[derive(Clone, Copy)]
pub(crate) enum StatsRange {
    SevenDays,
    ThirtyDays,
    NinetyDays,
    All,
}

impl StatsRange {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::SevenDays => "7d",
            Self::ThirtyDays => "30d",
            Self::NinetyDays => "90d",
            Self::All => "all",
        }
    }
}

pub(crate) struct StatsSummary {
    pub(crate) total_agents_spawned: u64,
    pub(crate) total_prs_created: u64,
    pub(crate) total_agent_time_ms: u64,
    pub(crate) first_event_at: Option<f64>,
    pub(crate) daily_activity: Vec<DailyActivity>,
    pub(crate) daily_tokens: Vec<DailyTokens>,
    pub(crate) daily_unpriced_tokens: Vec<DailyTokens>,
    pub(crate) daily_values: Vec<DailyValue>,
    pub(crate) daily_provider_usage: Vec<DailyProviderUsage>,
    pub(crate) model_usage: Vec<ModelUsage>,
    pub(crate) project_usage: Vec<ProjectUsage>,
    pub(crate) token_data_available: bool,
    pub(crate) token_unavailable_agents: [UnavailableAgent; 4],
    pub(crate) usage_range: StatsRange,
    pub(crate) supplemental_usage: SupplementalUsage,
    pub(crate) usage_value_available: bool,
    pub(crate) has_unpriced_usage: bool,
}

pub(super) struct ActivitySummary {
    pub(super) total_agents_spawned: u64,
    pub(super) total_prs_created: u64,
    pub(super) total_agent_time_ms: u64,
    pub(super) first_event_at: Option<f64>,
    pub(super) daily_activity: Vec<DailyActivity>,
}

pub(crate) struct DailyActivity {
    pub(crate) day: String,
    pub(crate) agent_starts: u64,
    pub(crate) prs_created: u64,
}

pub(crate) struct DailyTokens {
    pub(crate) day: String,
    pub(crate) tokens: u64,
}

pub(crate) struct DailyValue {
    pub(crate) day: String,
    pub(crate) value_usd: Option<f64>,
}

pub(crate) struct DailyProviderUsage {
    pub(crate) day: String,
    pub(crate) providers: Vec<ProviderUsage>,
}

pub(crate) struct ProviderUsage {
    pub(crate) provider: StatsProvider,
    pub(crate) tokens: u64,
    pub(crate) value_usd: Option<f64>,
}

pub(crate) struct ModelUsage {
    pub(crate) key: String,
    pub(crate) label: String,
    pub(crate) tokens: u64,
    pub(crate) value_usd: Option<f64>,
}

pub(crate) struct ProjectUsage {
    pub(crate) key: String,
    pub(crate) label: String,
    pub(crate) sessions: u64,
    pub(crate) tokens: u64,
    pub(crate) value_usd: Option<f64>,
    pub(crate) providers: Vec<ProviderUsage>,
}

pub(super) struct StatsAvailability {
    pub(super) token_data_available: bool,
    pub(super) token_unavailable_agents: [UnavailableAgent; 4],
    pub(super) usage_value_available: bool,
    pub(super) has_unpriced_usage: bool,
}

#[derive(Clone, Copy)]
pub(crate) enum UnavailableAgent {
    Antigravity,
    Cursor,
    Hermes,
    Rovo,
}

pub(crate) struct SupplementalUsage {
    pub(crate) daily_tokens: Vec<SupplementalDailyUsage>,
    pub(crate) model_usage: Vec<ModelUsage>,
}

pub(crate) struct SupplementalDailyUsage {
    pub(crate) day: String,
    pub(crate) tokens: u64,
    pub(crate) value_usd: Option<f64>,
    pub(crate) unpriced_tokens: u64,
}

pub(super) struct ProviderSnapshot {
    pub(super) provider: StatsProvider,
    pub(super) daily: Vec<ProviderDaily>,
    pub(super) models: Vec<ProviderBreakdown>,
    pub(super) projects: Vec<ProviderBreakdown>,
}

pub(super) struct ProviderDaily {
    pub(super) day: String,
    pub(super) tokens: u64,
    pub(super) unpriced_tokens: u64,
    pub(super) value_usd: Option<f64>,
}

pub(super) struct ProviderBreakdown {
    pub(super) key: String,
    pub(super) label: String,
    pub(super) sessions: u64,
    pub(super) tokens: u64,
    pub(super) value_usd: Option<f64>,
}

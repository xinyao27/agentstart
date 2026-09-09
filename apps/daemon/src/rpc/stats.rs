use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    GetSummaryRequest, GetSummaryResponse, StatsDailyActivity as ProtocolDailyActivity,
    StatsDailyProviderUsage as ProtocolDailyProviderUsage, StatsDailyTokens as ProtocolDailyTokens,
    StatsDailyValue as ProtocolDailyValue, StatsModelUsage as ProtocolModelUsage,
    StatsProjectUsage as ProtocolProjectUsage, StatsProviderUsage as ProtocolProviderUsage,
    StatsSupplementalDailyUsage as ProtocolSupplementalDailyUsage,
    StatsSupplementalUsage as ProtocolSupplementalUsage,
    StatsUnavailableAgent as ProtocolUnavailableAgent, StatsUsageProvider as ProtocolUsageProvider,
    StatsUsageRange as ProtocolUsageRange,
};
use yiru_protocol::transport::{decode, encode};

use crate::account_usage::{
    DailyActivity, DailyProviderUsage, DailyTokens, DailyValue, ModelUsage, ProjectUsage,
    ProviderUsage, StatsAuthority, StatsError, StatsProvider, StatsRange, StatsSummary,
    SupplementalDailyUsage, SupplementalUsage, UnavailableAgent,
};

#[derive(Clone)]
pub(super) struct StatsRpc {
    authority: StatsAuthority,
}

impl StatsRpc {
    pub(super) fn new(authority: StatsAuthority) -> Self {
        Self { authority }
    }

    pub(super) async fn protocol_summary(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<GetSummaryRequest>(payload)?;
        let range = request_range(request.range)?;
        let summary = self
            .authority
            .summary(request.refresh_usage, range)
            .await
            .map_err(stats_status)?;
        Ok(encode(&protocol_summary(summary)))
    }
}

fn request_range(range: i32) -> Result<StatsRange, Status> {
    match ProtocolUsageRange::try_from(range) {
        Ok(ProtocolUsageRange::Unspecified | ProtocolUsageRange::All) => Ok(StatsRange::All),
        Ok(ProtocolUsageRange::SevenDays) => Ok(StatsRange::SevenDays),
        Ok(ProtocolUsageRange::ThirtyDays) => Ok(StatsRange::ThirtyDays),
        Ok(ProtocolUsageRange::NinetyDays) => Ok(StatsRange::NinetyDays),
        Err(_) => Err(status(
            StatusCode::InvalidArgument,
            "Stats usage range is invalid",
        )),
    }
}

fn protocol_summary(summary: StatsSummary) -> GetSummaryResponse {
    GetSummaryResponse {
        total_agents_spawned: summary.total_agents_spawned,
        total_prs_created: summary.total_prs_created,
        total_agent_time_ms: summary.total_agent_time_ms,
        first_event_at: finite(summary.first_event_at),
        daily_activity: summary
            .daily_activity
            .into_iter()
            .map(protocol_daily_activity)
            .collect(),
        daily_tokens: summary
            .daily_tokens
            .into_iter()
            .map(protocol_daily_tokens)
            .collect(),
        daily_unpriced_tokens: summary
            .daily_unpriced_tokens
            .into_iter()
            .map(protocol_daily_tokens)
            .collect(),
        daily_values: summary
            .daily_values
            .into_iter()
            .map(protocol_daily_value)
            .collect(),
        daily_provider_usage: summary
            .daily_provider_usage
            .into_iter()
            .map(protocol_daily_provider_usage)
            .collect(),
        model_usage: summary
            .model_usage
            .into_iter()
            .map(protocol_model_usage)
            .collect(),
        project_usage: summary
            .project_usage
            .into_iter()
            .map(protocol_project_usage)
            .collect(),
        token_data_available: summary.token_data_available,
        token_unavailable_agents: summary
            .token_unavailable_agents
            .into_iter()
            .map(protocol_unavailable_agent)
            .map(|agent| agent as i32)
            .collect(),
        usage_range: protocol_range(summary.usage_range) as i32,
        supplemental_usage: Some(protocol_supplemental(summary.supplemental_usage)),
        usage_value_available: summary.usage_value_available,
        has_unpriced_usage: summary.has_unpriced_usage,
    }
}

fn protocol_daily_activity(activity: DailyActivity) -> ProtocolDailyActivity {
    ProtocolDailyActivity {
        day: activity.day,
        agent_starts: activity.agent_starts,
        prs_created: activity.prs_created,
    }
}

fn protocol_daily_tokens(tokens: DailyTokens) -> ProtocolDailyTokens {
    ProtocolDailyTokens {
        day: tokens.day,
        tokens: tokens.tokens,
    }
}

fn protocol_daily_value(value: DailyValue) -> ProtocolDailyValue {
    ProtocolDailyValue {
        day: value.day,
        value_usd: finite(value.value_usd),
    }
}

fn protocol_daily_provider_usage(usage: DailyProviderUsage) -> ProtocolDailyProviderUsage {
    ProtocolDailyProviderUsage {
        day: usage.day,
        providers: usage
            .providers
            .into_iter()
            .map(protocol_provider_usage)
            .collect(),
    }
}

fn protocol_provider_usage(usage: ProviderUsage) -> ProtocolProviderUsage {
    ProtocolProviderUsage {
        provider: protocol_provider(usage.provider) as i32,
        tokens: usage.tokens,
        value_usd: finite(usage.value_usd),
    }
}

fn protocol_model_usage(usage: ModelUsage) -> ProtocolModelUsage {
    ProtocolModelUsage {
        key: usage.key,
        label: usage.label,
        tokens: usage.tokens,
        value_usd: finite(usage.value_usd),
    }
}

fn protocol_project_usage(usage: ProjectUsage) -> ProtocolProjectUsage {
    ProtocolProjectUsage {
        key: usage.key,
        label: usage.label,
        sessions: usage.sessions,
        tokens: usage.tokens,
        value_usd: finite(usage.value_usd),
        providers: usage
            .providers
            .into_iter()
            .map(protocol_provider_usage)
            .collect(),
    }
}

fn protocol_supplemental(usage: SupplementalUsage) -> ProtocolSupplementalUsage {
    ProtocolSupplementalUsage {
        daily_tokens: usage
            .daily_tokens
            .into_iter()
            .map(protocol_supplemental_daily)
            .collect(),
        model_usage: usage
            .model_usage
            .into_iter()
            .map(protocol_model_usage)
            .collect(),
        metered_value_usd: None,
    }
}

fn protocol_supplemental_daily(usage: SupplementalDailyUsage) -> ProtocolSupplementalDailyUsage {
    ProtocolSupplementalDailyUsage {
        day: usage.day,
        tokens: usage.tokens,
        value_usd: finite(usage.value_usd),
        unpriced_tokens: usage.unpriced_tokens,
    }
}

fn protocol_provider(provider: StatsProvider) -> ProtocolUsageProvider {
    match provider {
        StatsProvider::Claude => ProtocolUsageProvider::Claude,
        StatsProvider::Codex => ProtocolUsageProvider::Codex,
        StatsProvider::OpenCode => ProtocolUsageProvider::OpenCode,
    }
}

fn protocol_unavailable_agent(agent: UnavailableAgent) -> ProtocolUnavailableAgent {
    match agent {
        UnavailableAgent::Antigravity => ProtocolUnavailableAgent::Antigravity,
        UnavailableAgent::Cursor => ProtocolUnavailableAgent::Cursor,
        UnavailableAgent::Hermes => ProtocolUnavailableAgent::Hermes,
        UnavailableAgent::Rovo => ProtocolUnavailableAgent::Rovo,
    }
}

fn protocol_range(range: StatsRange) -> ProtocolUsageRange {
    match range {
        StatsRange::SevenDays => ProtocolUsageRange::SevenDays,
        StatsRange::ThirtyDays => ProtocolUsageRange::ThirtyDays,
        StatsRange::NinetyDays => ProtocolUsageRange::NinetyDays,
        StatsRange::All => ProtocolUsageRange::All,
    }
}

fn finite(value: Option<f64>) -> Option<f64> {
    value.filter(|value| value.is_finite())
}

fn stats_status(error: StatsError) -> Status {
    match error {
        StatsError::Io(_)
        | StatsError::Json(_)
        | StatsError::Usage(_)
        | StatsError::Supplemental(_) => {
            status(StatusCode::Internal, "Stats summary could not be collected")
        }
    }
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

use std::collections::BTreeMap;

use super::{
    DailyTokens, StatsRange, StatsSummary, SupplementalUsage, UnavailableAgent,
    model::ActivitySummary,
};
use crate::ai_vault::{AiVaultAuthority, model::AiVaultListInput};

pub(super) async fn summary(
    activity: ActivitySummary,
    vault: Option<&AiVaultAuthority>,
) -> StatsSummary {
    let mut daily = BTreeMap::<String, u64>::new();
    if let Some(vault) = vault {
        let result = vault
            .list(AiVaultListInput {
                compact: false,
                execution_host_id: None,
                execution_host_scope: Some("local".to_owned()),
                force: false,
                limit: usize::MAX,
                scope_paths: Vec::new(),
            })
            .await;
        for session in result.sessions {
            for point in session.tokens_by_day.unwrap_or_default() {
                let tokens = daily.entry(point.day).or_default();
                *tokens = tokens.saturating_add(point.tokens);
            }
        }
    }
    // Why: the source fallback has no ranged provider index; label the all-time token totals it actually read.
    StatsSummary {
        total_agents_spawned: activity.total_agents_spawned,
        total_prs_created: activity.total_prs_created,
        total_agent_time_ms: activity.total_agent_time_ms,
        first_event_at: activity.first_event_at,
        daily_activity: activity.daily_activity,
        daily_tokens: daily
            .into_iter()
            .map(|(day, tokens)| DailyTokens { day, tokens })
            .collect(),
        daily_unpriced_tokens: Vec::new(),
        daily_values: Vec::new(),
        daily_provider_usage: Vec::new(),
        model_usage: Vec::new(),
        project_usage: Vec::new(),
        token_data_available: vault.is_some(),
        token_unavailable_agents: [
            UnavailableAgent::Antigravity,
            UnavailableAgent::Cursor,
            UnavailableAgent::Hermes,
            UnavailableAgent::Rovo,
        ],
        usage_range: StatsRange::All,
        supplemental_usage: SupplementalUsage {
            daily_tokens: Vec::new(),
            model_usage: Vec::new(),
        },
        usage_value_available: false,
        has_unpriced_usage: false,
    }
}

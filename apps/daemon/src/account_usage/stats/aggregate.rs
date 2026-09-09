use std::collections::{BTreeMap, HashMap};

use super::model::{
    ActivitySummary, DailyProviderUsage, DailyTokens, DailyValue, ModelUsage, ProjectUsage,
    ProviderBreakdown, ProviderSnapshot, ProviderUsage, StatsAvailability, StatsProvider,
    StatsRange, StatsSummary, SupplementalUsage, UnavailableAgent,
};

pub(super) fn summary(
    activity: ActivitySummary,
    range: StatsRange,
    providers: [ProviderSnapshot; 3],
    supplemental: SupplementalUsage,
) -> StatsSummary {
    let mut daily = BTreeMap::<String, DailyTotal>::new();
    let mut models = HashMap::<String, ModelTotal>::new();
    let mut projects = HashMap::<String, ProjectTotal>::new();
    let mut has_unpriced_usage = false;
    for snapshot in providers {
        for row in snapshot.daily {
            has_unpriced_usage |= row.unpriced_tokens > 0;
            let total = daily.entry(row.day).or_default();
            total.tokens = total.tokens.saturating_add(row.tokens);
            total.unpriced_tokens = total.unpriced_tokens.saturating_add(row.unpriced_tokens);
            add_value(&mut total.value_usd, row.value_usd);
            let provider = total.providers.entry(snapshot.provider).or_default();
            provider.tokens = provider.tokens.saturating_add(row.tokens);
            add_value(&mut provider.value_usd, row.value_usd);
        }
        add_models(&mut models, snapshot.provider, snapshot.models);
        add_projects(&mut projects, snapshot.provider, snapshot.projects);
    }
    let cutoff = match range {
        StatsRange::SevenDays => Some(6),
        StatsRange::ThirtyDays => Some(29),
        StatsRange::NinetyDays => Some(89),
        StatsRange::All => None,
    }
    .and_then(|days| {
        chrono::Local::now()
            .date_naive()
            .checked_sub_days(chrono::Days::new(days))
    })
    .map(|date| date.format("%Y-%m-%d").to_string());
    for row in &supplemental.daily_tokens {
        if cutoff.as_ref().is_some_and(|cutoff| &row.day < cutoff) {
            continue;
        }
        let total = daily.entry(row.day.clone()).or_default();
        total.tokens = total.tokens.saturating_add(row.tokens);
        total.unpriced_tokens = total.unpriced_tokens.saturating_add(row.unpriced_tokens);
        add_value(&mut total.value_usd, row.value_usd);
        has_unpriced_usage |= row.unpriced_tokens > 0;
    }
    if matches!(range, StatsRange::All) {
        for row in &supplemental.model_usage {
            let total = models.entry(row.key.clone()).or_default();
            total.label = row.label.clone();
            total.usage.tokens = total.usage.tokens.saturating_add(row.tokens);
            add_value(&mut total.usage.value_usd, row.value_usd);
        }
    }
    let daily_tokens = daily
        .iter()
        .map(|(day, total)| DailyTokens {
            day: day.clone(),
            tokens: total.tokens,
        })
        .collect::<Vec<_>>();
    let daily_unpriced_tokens = daily
        .iter()
        .filter(|(_, total)| total.unpriced_tokens > 0)
        .map(|(day, total)| DailyTokens {
            day: day.clone(),
            tokens: total.unpriced_tokens,
        })
        .collect();
    let daily_values = daily
        .iter()
        .filter_map(|(day, total)| {
            total.value_usd.map(|value_usd| DailyValue {
                day: day.clone(),
                value_usd: Some(value_usd),
            })
        })
        .collect::<Vec<_>>();
    let daily_provider_usage = daily
        .iter()
        .filter(|(_, total)| !total.providers.is_empty())
        .map(|(day, total)| DailyProviderUsage {
            day: day.clone(),
            providers: total
                .providers
                .iter()
                .map(|(provider, total)| ProviderUsage {
                    provider: *provider,
                    tokens: total.tokens,
                    value_usd: total.value_usd,
                })
                .collect(),
        })
        .collect();
    let model_usage = sorted_models(models);
    let project_usage = sorted_projects(projects);
    let token_data_available =
        !daily_tokens.is_empty() || model_usage.iter().any(|model| model.tokens > 0);
    let usage_value_available = !daily_values.is_empty()
        || model_usage
            .iter()
            .any(|model| model.value_usd.is_some_and(f64::is_finite));
    let availability = StatsAvailability {
        token_data_available,
        token_unavailable_agents: [
            UnavailableAgent::Antigravity,
            UnavailableAgent::Cursor,
            UnavailableAgent::Hermes,
            UnavailableAgent::Rovo,
        ],
        usage_value_available,
        has_unpriced_usage,
    };
    StatsSummary {
        total_agents_spawned: activity.total_agents_spawned,
        total_prs_created: activity.total_prs_created,
        total_agent_time_ms: activity.total_agent_time_ms,
        first_event_at: activity.first_event_at,
        daily_activity: activity.daily_activity,
        daily_tokens,
        daily_unpriced_tokens,
        daily_values,
        daily_provider_usage,
        model_usage,
        project_usage,
        token_data_available: availability.token_data_available,
        token_unavailable_agents: availability.token_unavailable_agents,
        usage_range: range,
        supplemental_usage: supplemental,
        usage_value_available: availability.usage_value_available,
        has_unpriced_usage: availability.has_unpriced_usage,
    }
}

#[derive(Default)]
struct UsageTotal {
    tokens: u64,
    value_usd: Option<f64>,
}

#[derive(Default)]
struct DailyTotal {
    tokens: u64,
    unpriced_tokens: u64,
    value_usd: Option<f64>,
    providers: BTreeMap<StatsProvider, UsageTotal>,
}

#[derive(Default)]
struct ModelTotal {
    label: String,
    usage: UsageTotal,
}

#[derive(Default)]
struct ProjectTotal {
    label: String,
    sessions: u64,
    usage: UsageTotal,
    providers: BTreeMap<StatsProvider, UsageTotal>,
}

fn add_models(
    target: &mut HashMap<String, ModelTotal>,
    provider: StatsProvider,
    rows: Vec<ProviderBreakdown>,
) {
    for row in rows {
        let key = format!("{}:{}", provider.name(), row.key);
        let entry = target.entry(key).or_default();
        entry.label = row.label;
        entry.usage.tokens = entry.usage.tokens.saturating_add(row.tokens);
        add_value(&mut entry.usage.value_usd, row.value_usd);
    }
}

fn add_projects(
    target: &mut HashMap<String, ProjectTotal>,
    provider: StatsProvider,
    rows: Vec<ProviderBreakdown>,
) {
    for row in rows {
        let entry = target.entry(row.key).or_default();
        entry.label = row.label;
        entry.sessions = entry.sessions.saturating_add(row.sessions);
        entry.usage.tokens = entry.usage.tokens.saturating_add(row.tokens);
        add_value(&mut entry.usage.value_usd, row.value_usd);
        let provider_total = entry.providers.entry(provider).or_default();
        provider_total.tokens = provider_total.tokens.saturating_add(row.tokens);
        add_value(&mut provider_total.value_usd, row.value_usd);
    }
}

fn sorted_models(values: HashMap<String, ModelTotal>) -> Vec<ModelUsage> {
    let mut values = values
        .into_iter()
        .map(|(key, total)| ModelUsage {
            key,
            label: total.label,
            tokens: total.usage.tokens,
            value_usd: total.usage.value_usd,
        })
        .collect::<Vec<_>>();
    values.sort_by(|left, right| {
        right
            .tokens
            .cmp(&left.tokens)
            .then_with(|| left.key.cmp(&right.key))
    });
    values
}

fn sorted_projects(values: HashMap<String, ProjectTotal>) -> Vec<ProjectUsage> {
    let mut values = values
        .into_iter()
        .map(|(key, total)| ProjectUsage {
            key,
            label: total.label,
            sessions: total.sessions,
            tokens: total.usage.tokens,
            value_usd: total.usage.value_usd,
            providers: total
                .providers
                .into_iter()
                .map(|(provider, total)| ProviderUsage {
                    provider,
                    tokens: total.tokens,
                    value_usd: total.value_usd,
                })
                .collect(),
        })
        .collect::<Vec<_>>();
    values.sort_by(|left, right| {
        right
            .tokens
            .cmp(&left.tokens)
            .then_with(|| left.key.cmp(&right.key))
    });
    values
}

fn add_value(total: &mut Option<f64>, value: Option<f64>) {
    if let Some(value) = value {
        *total = Some(total.unwrap_or(0.0) + value);
    }
}

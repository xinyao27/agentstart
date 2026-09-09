use serde_json::Value;

use super::model::{ProviderBreakdown, ProviderDaily, ProviderSnapshot, StatsProvider};

pub(super) fn provider_snapshot(provider: StatsProvider, value: &Value) -> ProviderSnapshot {
    let daily = array_field(value, "daily")
        .filter_map(|row| provider_daily(provider, row))
        .collect();
    let models = array_field(value, "modelBreakdown")
        .map(|row| provider_breakdown(provider, row, "Unknown model"))
        .collect();
    let projects = array_field(value, "projectBreakdown")
        .map(|row| provider_breakdown(provider, row, "Unknown project"))
        .collect();
    ProviderSnapshot {
        provider,
        daily,
        models,
        projects,
    }
}

fn provider_daily(provider: StatsProvider, value: &Value) -> Option<ProviderDaily> {
    Some(ProviderDaily {
        day: value.get("day")?.as_str()?.to_owned(),
        tokens: tokens(provider, value),
        unpriced_tokens: nonnegative(value.get("unpricedTokens")),
        value_usd: finite(value.get("estimatedCostUsd")),
    })
}

fn provider_breakdown(
    provider: StatsProvider,
    value: &Value,
    unknown_label: &str,
) -> ProviderBreakdown {
    let label = value
        .get("label")
        .and_then(Value::as_str)
        .unwrap_or(unknown_label);
    ProviderBreakdown {
        key: value
            .get("key")
            .and_then(Value::as_str)
            .unwrap_or(label)
            .to_owned(),
        label: label.to_owned(),
        sessions: nonnegative(value.get("sessions")),
        tokens: tokens(provider, value),
        value_usd: finite(value.get("estimatedCostUsd")),
    }
}

fn array_field<'a>(value: &'a Value, key: &str) -> impl Iterator<Item = &'a Value> {
    value
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
}

fn tokens(provider: StatsProvider, value: &Value) -> u64 {
    if provider.is_claude() {
        [
            "inputTokens",
            "outputTokens",
            "cacheReadTokens",
            "cacheWriteTokens",
        ]
        .into_iter()
        .map(|key| nonnegative(value.get(key)))
        .sum()
    } else {
        nonnegative(value.get("totalTokens"))
    }
}

fn nonnegative(value: Option<&Value>) -> u64 {
    value.and_then(Value::as_u64).unwrap_or(0)
}

fn finite(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
}

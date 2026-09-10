use std::collections::HashSet;

use serde_json::{Value, json};

use super::calendar::{duration_minutes, local_day};
use super::{Provider, bool_field, nullable_string, number_field, string_field, sum_field};

pub(super) fn session_matches(
    row: &Value,
    provider: Provider,
    scope: &str,
    cutoff: Option<&str>,
) -> bool {
    let belongs = scope != "agentstart"
        || if matches!(provider, Provider::OpenCode) {
            string_field(Some(row), "primaryWorktreeId").is_some_and(|id| !id.is_empty())
        } else {
            rows(row, "locationBreakdown").any(is_agentstart_location)
        };
    if !belongs {
        return false;
    }
    if cutoff.is_none() && matches!(provider, Provider::OpenCode) {
        return true;
    }
    string_field(Some(row), "lastTimestamp")
        .and_then(local_day)
        .is_some_and(|day| cutoff.is_none_or(|cutoff| day.as_str() >= cutoff))
}

pub(super) fn session_output(row: &Value, provider: Provider, scope: &str) -> Value {
    let first = string_field(Some(row), "firstTimestamp").unwrap_or("");
    let last = string_field(Some(row), "lastTimestamp").unwrap_or("");
    let mut result = json!({
        "sessionId": string_field(Some(row), "sessionId").unwrap_or(""),
        "lastActiveAt": last,
        "durationMinutes": duration_minutes(first, last),
        "projectLabel": string_field(Some(row), "primaryProjectLabel").unwrap_or("Unknown location"),
        "model": nullable_string(Some(row), "primaryModel")
    });
    let Some(output) = result.as_object_mut() else {
        return result;
    };
    if matches!(provider, Provider::OpenCode) {
        for (target, source) in [
            ("events", "eventCount"),
            ("inputTokens", "totalInputTokens"),
            ("cachedInputTokens", "totalCachedInputTokens"),
            ("outputTokens", "totalOutputTokens"),
            ("reasoningOutputTokens", "totalReasoningOutputTokens"),
            ("totalTokens", "totalTokens"),
        ] {
            output.insert(
                target.to_owned(),
                json!(number_field(Some(row), source).unwrap_or(0)),
            );
        }
        return result;
    }
    let locations = scoped_locations(row, scope);
    let project = match locations.as_slice() {
        [] if matches!(provider, Provider::Claude) => "Unknown location",
        [] => string_field(Some(row), "primaryProjectLabel").unwrap_or("Unknown location"),
        [location] => string_field(Some(location), "projectLabel").unwrap_or("Unknown location"),
        _ => "Multiple locations",
    };
    output.insert("projectLabel".to_owned(), json!(project));
    let fields: &[(&str, &str)] = if matches!(provider, Provider::Claude) {
        output.insert(
            "model".to_owned(),
            json!(nullable_string(Some(row), "model")),
        );
        output.insert(
            "branch".to_owned(),
            json!(nullable_string(Some(row), "lastGitBranch")),
        );
        &[
            ("turns", "turnCount"),
            ("inputTokens", "inputTokens"),
            ("outputTokens", "outputTokens"),
            ("cacheReadTokens", "cacheReadTokens"),
            ("cacheWriteTokens", "cacheWriteTokens"),
        ]
    } else {
        output.insert("model".to_owned(), json!(codex_primary_model(row, scope)));
        output.insert(
            "hasInferredPricing".to_owned(),
            json!(
                bool_field(Some(row), "hasInferredPricing", false)
                    || locations.iter().any(|location| bool_field(
                        Some(location),
                        "hasInferredPricing",
                        false
                    ))
            ),
        );
        &[
            ("events", "eventCount"),
            ("inputTokens", "inputTokens"),
            ("outputTokens", "outputTokens"),
            ("cachedInputTokens", "cachedInputTokens"),
            ("reasoningOutputTokens", "reasoningOutputTokens"),
            ("totalTokens", "totalTokens"),
        ]
    };
    for (target, source) in fields {
        output.insert((*target).to_owned(), json!(sum_field(&locations, source)));
    }
    result
}

pub(super) fn session_breakdown_keys(
    session: &Value,
    provider: Provider,
    scope: &str,
    by_model: bool,
) -> HashSet<String> {
    if by_model && matches!(provider, Provider::Claude) {
        return HashSet::from([string_field(Some(session), "model")
            .unwrap_or("unknown")
            .to_owned()]);
    }
    if by_model {
        return scoped_models(session, provider, scope)
            .into_iter()
            .map(|row| {
                string_field(Some(row), "modelKey")
                    .unwrap_or("unknown")
                    .to_owned()
            })
            .collect();
    }
    rows(session, "locationBreakdown")
        .filter(|row| scope != "agentstart" || is_agentstart_location(row))
        .map(|row| {
            string_field(Some(row), "locationKey")
                .unwrap_or("unknown")
                .to_owned()
        })
        .collect()
}

fn scoped_locations<'a>(row: &'a Value, scope: &str) -> Vec<&'a Value> {
    let all = rows(row, "locationBreakdown").collect::<Vec<_>>();
    let matching = all
        .iter()
        .copied()
        .filter(|row| scope != "agentstart" || is_agentstart_location(row))
        .collect::<Vec<_>>();
    if matching.is_empty() { all } else { matching }
}

fn scoped_models<'a>(row: &'a Value, provider: Provider, scope: &str) -> Vec<&'a Value> {
    let locations = rows(row, "locationModelBreakdown").collect::<Vec<_>>();
    if scope == "agentstart" && matches!(provider, Provider::Codex) && !locations.is_empty() {
        locations
            .into_iter()
            .filter(|row| is_agentstart_location(row))
            .collect()
    } else {
        rows(row, "modelBreakdown").collect()
    }
}

fn codex_primary_model<'a>(row: &'a Value, scope: &str) -> Option<&'a str> {
    let models = scoped_models(row, Provider::Codex, scope);
    let keys = models
        .iter()
        .map(|model| string_field(Some(model), "modelKey").unwrap_or("unknown"))
        .collect::<HashSet<_>>();
    match keys.len() {
        0 => nullable_string(Some(row), "primaryModel"),
        1 => models
            .first()
            .and_then(|model| string_field(Some(model), "modelLabel")),
        _ => Some("Mixed models"),
    }
}

fn is_agentstart_location(row: &Value) -> bool {
    row.get("worktreeId").is_some_and(|id| !id.is_null())
}

fn rows<'a>(row: &'a Value, key: &str) -> impl Iterator<Item = &'a Value> {
    row.get(key).and_then(Value::as_array).into_iter().flatten()
}

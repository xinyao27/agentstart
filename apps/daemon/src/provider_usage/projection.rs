use super::calendar::range_cutoff;
use super::sessions::{session_breakdown_keys, session_matches, session_output};
use super::{
    Provider, add_cost, add_number, bool_field, number_field, number_float, scan_state,
    string_field, sum_field, top_key,
};
use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};

pub(super) fn build_snapshot(
    state: &Value,
    provider: Provider,
    scope: &str,
    range: &str,
    limit: u64,
) -> Value {
    let cutoff = range_cutoff(range);
    let daily = state
        .get("dailyAggregates")
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter(|row| row_matches(row, scope, cutoff.as_deref()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let sessions = state
        .get("sessions")
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter(|row| session_matches(row, provider, scope, cutoff.as_deref()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let summary = build_summary(&daily, &sessions, provider, scope, range);
    let daily_output = build_daily(&daily, provider);
    let model = build_breakdown(&daily, &sessions, provider, scope, true);
    let project = build_breakdown(&daily, &sessions, provider, scope, false);
    let recent = sessions
        .into_iter()
        .take(limit as usize)
        .map(|row| session_output(row, provider, scope))
        .collect::<Vec<_>>();
    json!({
        "scanState": scan_state(state, provider),
        "summary": summary,
        "daily": daily_output,
        "modelBreakdown": model,
        "projectBreakdown": project,
        "recentSessions": recent
    })
}

fn build_summary(
    rows: &[&Value],
    sessions: &[&Value],
    provider: Provider,
    scope: &str,
    range: &str,
) -> Value {
    let claude = matches!(provider, Provider::Claude);
    let mut input = 0_u64;
    let mut cached = 0_u64;
    let mut output = 0_u64;
    let mut reasoning = 0_u64;
    let mut total = 0_u64;
    let mut events = 0_u64;
    let mut turns = 0_u64;
    let mut zero_cache = 0_u64;
    let mut known_cost = 0_f64;
    let mut has_cost = false;
    let mut unpriced = false;
    let mut models = HashMap::<String, u64>::new();
    let mut projects = HashMap::<String, u64>::new();
    for row in rows {
        input += number_field(Some(row), "inputTokens").unwrap_or(0);
        cached += number_field(Some(row), "cachedInputTokens")
            .unwrap_or_else(|| number_field(Some(row), "cacheReadTokens").unwrap_or(0));
        output += number_field(Some(row), "outputTokens").unwrap_or(0);
        reasoning += number_field(Some(row), "reasoningOutputTokens").unwrap_or(0);
        let row_total = number_field(Some(row), "totalTokens").unwrap_or_else(|| {
            number_field(Some(row), "inputTokens").unwrap_or(0)
                + number_field(Some(row), "cachedInputTokens")
                    .unwrap_or_else(|| number_field(Some(row), "cacheReadTokens").unwrap_or(0))
                + number_field(Some(row), "outputTokens").unwrap_or(0)
                + number_field(Some(row), "reasoningOutputTokens").unwrap_or(0)
        });
        total += row_total;
        events += number_field(Some(row), "eventCount").unwrap_or(0);
        turns += number_field(Some(row), "turnCount").unwrap_or(0);
        zero_cache += number_field(Some(row), "zeroCacheReadTurnCount").unwrap_or(0);
        let cost = number_float(Some(row), "estimatedCostUsd");
        if let Some(cost) = cost {
            known_cost += cost;
            has_cost = true;
        }
        unpriced |= row_unpriced_tokens(row, provider) > 0;
        let weight = if claude {
            number_field(Some(row), "inputTokens").unwrap_or(0)
                + number_field(Some(row), "outputTokens").unwrap_or(0)
        } else {
            row_total
        };
        let model = string_field(Some(row), "model").unwrap_or("Unknown model");
        let project = string_field(Some(row), "projectLabel").unwrap_or("Unknown project");
        *models.entry(model.to_owned()).or_default() += weight;
        *projects.entry(project.to_owned()).or_default() += weight;
    }
    let top_model = top_key(&models);
    let top_project = top_key(&projects);
    if claude {
        json!({
            "scope": scope, "range": range, "sessions": sessions.len(), "turns": turns,
            "zeroCacheReadTurns": zero_cache, "inputTokens": input, "outputTokens": output,
            "cacheReadTokens": cached, "cacheWriteTokens": sum_field(rows, "cacheWriteTokens"),
            "cacheReuseRate": if input + cached > 0 { json!(cached as f64 / (input + cached) as f64) } else { Value::Null },
            "estimatedCostUsd": if unpriced || !has_cost { Value::Null } else { json!(known_cost) },
            "topModel": top_model, "topProject": top_project,
            "hasAnyClaudeData": !rows.is_empty() || !sessions.is_empty()
        })
    } else {
        let key = if matches!(provider, Provider::Codex) {
            "hasAnyCodexData"
        } else {
            "hasAnyOpenCodeData"
        };
        let mut result = json!({
            "scope": scope, "range": range, "sessions": sessions.len(), "events": events,
            "inputTokens": input, "cachedInputTokens": cached, "outputTokens": output,
            "reasoningOutputTokens": reasoning, "totalTokens": total,
            "estimatedCostUsd": if unpriced || !has_cost { Value::Null } else { json!(known_cost) },
            "topModel": top_model, "topProject": top_project
        });
        if let Some(object) = result.as_object_mut() {
            object.insert(
                key.to_owned(),
                json!(!rows.is_empty() || !sessions.is_empty()),
            );
        }
        result
    }
}

fn build_daily(rows: &[&Value], provider: Provider) -> Vec<Value> {
    let mut by_day = Map::<String, Value>::new();
    for row in rows {
        let day = string_field(Some(row), "day").unwrap_or("").to_owned();
        if day.is_empty() {
            continue;
        }
        let entry = by_day.entry(day.clone()).or_insert_with(|| {
            if matches!(provider, Provider::Claude) {
                json!({"day": day, "inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0, "cacheWriteTokens": 0, "estimatedCostUsd": null, "unpricedTokens": 0})
            } else {
                json!({"day": day, "inputTokens": 0, "cachedInputTokens": 0, "outputTokens": 0, "reasoningOutputTokens": 0, "totalTokens": 0, "estimatedCostUsd": null, "unpricedTokens": 0})
            }
        });
        add_number(
            entry,
            "inputTokens",
            number_field(Some(row), "inputTokens").unwrap_or(0),
        );
        add_number(
            entry,
            "outputTokens",
            number_field(Some(row), "outputTokens").unwrap_or(0),
        );
        let cache_key = if matches!(provider, Provider::Claude) {
            "cacheReadTokens"
        } else {
            "cachedInputTokens"
        };
        add_number(
            entry,
            cache_key,
            number_field(Some(row), cache_key)
                .unwrap_or_else(|| number_field(Some(row), "cacheReadTokens").unwrap_or(0)),
        );
        if matches!(provider, Provider::Claude) {
            add_number(
                entry,
                "cacheWriteTokens",
                number_field(Some(row), "cacheWriteTokens").unwrap_or(0),
            );
        }
        if !matches!(provider, Provider::Claude) {
            add_number(
                entry,
                "reasoningOutputTokens",
                number_field(Some(row), "reasoningOutputTokens").unwrap_or(0),
            );
            add_number(
                entry,
                "totalTokens",
                number_field(Some(row), "totalTokens").unwrap_or(0),
            );
        }
        add_number(entry, "unpricedTokens", row_unpriced_tokens(row, provider));
        if let Some(cost) = number_float(Some(row), "estimatedCostUsd") {
            add_cost(entry, cost);
        }
    }
    if matches!(provider, Provider::OpenCode) {
        for entry in by_day.values_mut() {
            if number_field(Some(entry), "unpricedTokens").unwrap_or(0) > 0 {
                entry["estimatedCostUsd"] = Value::Null;
            }
        }
    }
    let mut result = by_day.into_values().collect::<Vec<_>>();
    result.sort_by(|left, right| {
        string_field(Some(left), "day")
            .unwrap_or("")
            .cmp(string_field(Some(right), "day").unwrap_or(""))
    });
    result
}

fn build_breakdown(
    rows: &[&Value],
    sessions: &[&Value],
    provider: Provider,
    scope: &str,
    by_model: bool,
) -> Vec<Value> {
    let mut totals = Map::<String, Value>::new();
    let mut unpriced = HashSet::new();
    for row in rows {
        let key = if by_model {
            string_field(Some(row), "model").unwrap_or("unknown")
        } else {
            string_field(Some(row), "projectKey").unwrap_or("unknown")
        };
        let label = if by_model {
            string_field(Some(row), "model").unwrap_or("Unknown model")
        } else {
            string_field(Some(row), "projectLabel").unwrap_or("Unknown project")
        };
        let entry = totals.entry(key.to_owned()).or_insert_with(|| {
            if matches!(provider, Provider::Claude) {
                json!({"key": key, "label": label, "sessions": 0, "turns": 0, "inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0, "cacheWriteTokens": 0, "estimatedCostUsd": null})
            } else {
                if matches!(provider, Provider::Codex) {
                    json!({"key": key, "label": label, "sessions": 0, "events": 0, "inputTokens": 0, "cachedInputTokens": 0, "outputTokens": 0, "reasoningOutputTokens": 0, "totalTokens": 0, "estimatedCostUsd": null, "hasInferredPricing": false})
                } else {
                    json!({"key": key, "label": label, "sessions": 0, "events": 0, "inputTokens": 0, "cachedInputTokens": 0, "outputTokens": 0, "reasoningOutputTokens": 0, "totalTokens": 0, "estimatedCostUsd": null})
                }
            }
        });
        let fields: &[&str] = if matches!(provider, Provider::Claude) {
            &[
                "inputTokens",
                "outputTokens",
                "cacheReadTokens",
                "cacheWriteTokens",
                "turnCount",
            ]
        } else {
            &[
                "inputTokens",
                "outputTokens",
                "cachedInputTokens",
                "reasoningOutputTokens",
                "totalTokens",
                "eventCount",
            ]
        };
        for field in fields {
            let output_field = match *field {
                "turnCount" => "turns",
                "eventCount" => "events",
                other => other,
            };
            add_number(
                entry,
                output_field,
                number_field(Some(row), field).unwrap_or(0),
            );
        }
        if let Some(cost) = number_float(Some(row), "estimatedCostUsd") {
            add_cost(entry, cost);
        }
        if row_unpriced_tokens(row, provider) > 0 {
            unpriced.insert(key.to_owned());
        }
        if matches!(provider, Provider::Codex)
            && bool_field(Some(row), "hasInferredPricing", false)
            && let Some(object) = entry.as_object_mut()
        {
            object.insert("hasInferredPricing".to_owned(), Value::Bool(true));
        }
    }
    for session in sessions {
        let keys = session_breakdown_keys(session, provider, scope, by_model);
        for key in keys {
            if let Some(entry) = totals.get_mut(&key) {
                add_number(entry, "sessions", 1);
            }
        }
    }
    for key in unpriced {
        if let Some(entry) = totals.get_mut(&key).and_then(Value::as_object_mut) {
            entry.insert("estimatedCostUsd".to_owned(), Value::Null);
        }
    }
    let mut result = totals.into_values().collect::<Vec<_>>();
    result.sort_by_key(|row| {
        std::cmp::Reverse(if matches!(provider, Provider::Claude) {
            number_field(Some(row), "inputTokens").unwrap_or(0)
                + number_field(Some(row), "outputTokens").unwrap_or(0)
        } else {
            number_field(Some(row), "totalTokens").unwrap_or(0)
        })
    });
    result
}

fn row_matches(row: &Value, scope: &str, cutoff: Option<&str>) -> bool {
    (scope != "yiru" || row.get("worktreeId").is_some_and(|value| !value.is_null()))
        && cutoff
            .is_none_or(|cutoff| string_field(Some(row), "day").is_some_and(|day| day >= cutoff))
}

fn row_unpriced_tokens(row: &Value, provider: Provider) -> u64 {
    if matches!(provider, Provider::OpenCode)
        && number_float(Some(row), "estimatedCostUsd").is_none()
    {
        number_field(Some(row), "totalTokens").unwrap_or(0)
    } else {
        number_field(Some(row), "unpricedTokens").unwrap_or(0)
    }
}

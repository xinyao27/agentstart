use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::Value;

pub(super) struct Row {
    pub session_id: String,
    pub created: i64,
    pub updated: Option<i64>,
    pub data: String,
    pub directory: Option<String>,
    pub worktree: Option<String>,
    pub session_model: Option<String>,
    pub cost_override: Option<f64>,
    pub has_step_finish: bool,
}
pub(super) struct Event {
    pub session_id: String,
    pub timestamp: String,
    pub cwd: Option<String>,
    pub model: Option<String>,
    pub cost: Option<f64>,
    pub tokens: Tokens,
}
pub(super) struct Tokens {
    pub input_tokens: u64,
    pub cached_input_tokens: u64,
    pub output_tokens: u64,
    pub reasoning_output_tokens: u64,
    pub total_tokens: u64,
}
fn object(value: Option<&Value>) -> Option<Value> {
    let value = value?;
    if value.is_object() {
        Some(value.clone())
    } else {
        serde_json::from_str(value.as_str()?)
            .ok()
            .filter(Value::is_object)
    }
}
fn string(value: Option<&Value>) -> Option<String> {
    value?
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}
fn finite(value: Option<&Value>) -> Option<f64> {
    let value = value?;
    value
        .as_f64()
        .or_else(|| value.as_str()?.trim().parse().ok())
        .filter(|n| n.is_finite())
}
fn number(value: Option<&Value>) -> u64 {
    finite(value).unwrap_or(0.0).max(0.0).trunc() as u64
}
fn millis(value: Option<&Value>) -> Option<i64> {
    let n = number(value);
    if n == 0 {
        None
    } else {
        i64::try_from(if n < 10_000_000_000 {
            n.saturating_mul(1000)
        } else {
            n
        })
        .ok()
    }
}
pub(super) fn parse(row: Row) -> Option<Event> {
    let data: Value = serde_json::from_str(&row.data).ok()?;
    let tokens = object(data.get("tokens"))?;
    let cache = object(tokens.get("cache")).unwrap_or(Value::Null);
    let input_tokens = number(tokens.get("input"));
    let output_tokens = number(tokens.get("output"));
    let reasoning_output_tokens = number(tokens.get("reasoning"));
    let cached_input_tokens = number(cache.get("read"));
    let explicit = number(tokens.get("total"));
    let total_tokens = if explicit > 0 {
        explicit
    } else {
        input_tokens
            .saturating_add(output_tokens)
            .saturating_add(reasoning_output_tokens)
            .saturating_add(cached_input_tokens)
    };
    if total_tokens == 0
        && input_tokens == 0
        && output_tokens == 0
        && reasoning_output_tokens == 0
        && cached_input_tokens == 0
    {
        return None;
    }
    let time = object(data.get("time")).unwrap_or(Value::Null);
    let timestamp = millis(time.get("completed"))
        .or_else(|| millis(time.get("created")))
        .or_else(|| millis(Some(&serde_json::json!(row.updated))))
        .or_else(|| millis(Some(&serde_json::json!(row.created))))?;
    let timestamp = DateTime::<Utc>::from_timestamp_millis(timestamp)?
        .to_rfc3339_opts(SecondsFormat::Millis, true);
    let session_model = row.session_model.as_ref().map(|s| Value::String(s.clone()));
    let model_object = object(data.get("model"))
        .or_else(|| object(session_model.as_ref()))
        .unwrap_or(Value::Null);
    let direct_model = string(data.get("modelID")).or_else(|| string(data.get("modelId")));
    let direct_provider = string(data.get("providerID")).or_else(|| string(data.get("providerId")));
    let model = if let Some(model) = direct_model {
        Some(
            direct_provider
                .as_ref()
                .map(|p| format!("{p}/{model}"))
                .unwrap_or(model),
        )
    } else {
        string(model_object.get("modelID"))
            .or_else(|| string(model_object.get("id")))
            .map(|model| {
                string(model_object.get("providerID"))
                    .map(|p| format!("{p}/{model}"))
                    .unwrap_or(model)
            })
    };
    let provider = direct_provider
        .or_else(|| string(model_object.get("providerID")))
        .or_else(|| string(model_object.get("providerId")));
    let raw_cost = if row.has_step_finish {
        row.cost_override
    } else {
        finite(data.get("cost"))
    };
    let cost = raw_cost.filter(|v| {
        v.is_finite()
            && *v >= 0.0
            && provider
                .as_deref()
                .is_some_and(|p| p.eq_ignore_ascii_case("opencode-go"))
    });
    let path = object(data.get("path")).unwrap_or(Value::Null);
    let cwd = string(path.get("cwd"))
        .or_else(|| row.directory.filter(|s| !s.trim().is_empty()))
        .or_else(|| row.worktree.filter(|s| !s.trim().is_empty()));
    Some(Event {
        session_id: row.session_id,
        timestamp,
        cwd,
        model,
        cost,
        tokens: Tokens {
            input_tokens,
            cached_input_tokens,
            output_tokens,
            reasoning_output_tokens,
            total_tokens,
        },
    })
}

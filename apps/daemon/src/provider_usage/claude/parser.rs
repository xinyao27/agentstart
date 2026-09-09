use std::collections::HashMap;
use std::path::Path;

use serde_json::Value;

use super::super::ProviderUsageError;
use super::discovery;
use super::model::{Tokens, Turn};

pub(super) fn read(path: &Path) -> Result<(u64, Vec<Turn>), ProviderUsageError> {
    let fallback = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    let mut turns: Vec<Turn> = Vec::new();
    let mut exceeded = false;
    let mut indexes: HashMap<String, usize> = HashMap::new();
    let lines = discovery::read_lines(path, |line| {
        let Some(turn) = parse(line, fallback) else {
            return;
        };
        if let Some(index) = turn
            .dedupe_key
            .as_ref()
            .and_then(|key| indexes.get(key))
            .copied()
        {
            let existing = &mut turns[index];
            existing.tokens.maximum(&turn.tokens);
            existing.cache_write_1h_tokens = existing
                .cache_write_1h_tokens
                .max(turn.cache_write_1h_tokens);
            existing.is_vertex |= turn.is_vertex;
        } else {
            if turns.len() >= 250_000 {
                exceeded = true;
                return;
            }
            if let Some(key) = &turn.dedupe_key {
                indexes.insert(key.clone(), turns.len());
            }
            turns.push(turn);
        }
    })?;
    if exceeded {
        return Err(ProviderUsageError::Scan(
            "Claude transcript exceeds the usage turn limit".to_owned(),
        ));
    }
    Ok((lines, turns))
}

fn parse(line: &[u8], fallback: &str) -> Option<Turn> {
    let record: Value = serde_json::from_slice(line).ok()?;
    if record.get("type")?.as_str()? != "assistant" {
        return None;
    }
    let session_id = text(record.get("sessionId")).unwrap_or_else(|| fallback.to_owned());
    if session_id.is_empty() {
        return None;
    }
    let timestamp = text(record.get("timestamp"))?;
    let message = record.get("message")?;
    let usage = message.get("usage")?;
    let tokens = Tokens {
        input_tokens: token(usage.get("input_tokens")),
        output_tokens: token(usage.get("output_tokens")),
        cache_read_tokens: token(usage.get("cache_read_input_tokens")),
        cache_write_tokens: token(usage.get("cache_creation_input_tokens")),
    };
    if tokens.total() == 0 {
        return None;
    }
    let message_id = text(message.get("id")).filter(|value| !value.trim().is_empty());
    let request_id = text(record.get("requestId")).filter(|value| !value.trim().is_empty());
    let model = text(message.get("model"));
    let dedupe_key = match (&message_id, &request_id) {
        (Some(message), Some(request)) => Some(format!("{}:{}", message.trim(), request.trim())),
        (Some(message), None) => Some(format!("msg:{}", message.trim())),
        _ => text(record.get("uuid"))
            .filter(|value| !value.trim().is_empty())
            .map(|value| format!("uuid:{}", value.trim())),
    };
    Some(Turn {
        session_id,
        timestamp,
        model: model.clone(),
        cwd: text(record.get("cwd")),
        git_branch: text(record.get("gitBranch")),
        dedupe_key,
        cache_write_1h_tokens: token(
            usage
                .get("cache_creation")
                .and_then(|value| value.get("ephemeral_1h_input_tokens")),
        )
        .min(tokens.cache_write_tokens),
        tokens,
        is_vertex: message_id.is_some_and(|id| id.contains("_vrtx_"))
            || request_id.is_some_and(|id| id.contains("_vrtx_"))
            || model.is_some_and(|model| model.starts_with("claude-") && model.contains('@'))
            || vertex_metadata(&record),
    })
}

fn vertex_metadata(value: &Value) -> bool {
    match value {
        Value::Array(values) => values.iter().any(vertex_metadata),
        Value::Object(object) => object.iter().any(|(key, value)| {
            let key = key.to_lowercase();
            key.contains("vertex")
                || key.contains("gcp")
                || (matches!(
                    key.as_str(),
                    "provider"
                        | "platform"
                        | "backend"
                        | "api_provider"
                        | "apiprovider"
                        | "api_type"
                        | "apitype"
                        | "source"
                        | "vendor"
                        | "client"
                ) && value
                    .as_str()
                    .is_some_and(|value| value.to_lowercase().contains("vertex")))
                || vertex_metadata(value)
        }),
        _ => false,
    }
}

fn text(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(ToOwned::to_owned)
}
fn token(value: Option<&Value>) -> u64 {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .unwrap_or(0.0)
        .max(0.0)
        .trunc() as u64
}

use serde_json::{Map, Value};

use super::super::super::model::{PreviewRole, SessionAccumulator};
use super::super::super::{accumulator, text};
use super::super::normalized_usage;

pub(super) fn consume_graph(state: &mut SessionAccumulator, record: &Map<String, Value>) {
    accumulator::timeline(state, record.get("timestamp"));
    match text::string(record.get("type")).as_deref() {
        Some("session") => {
            if let Some(id) = text::string(record.get("id")) {
                state.session_id = id;
            }
            state.cwd = text::string(record.get("cwd")).or(state.cwd.take());
        }
        Some("model_change") => {
            state.model = text::string(record.get("modelId"))
                .or_else(|| text::string(record.get("model")))
                .or(state.model.take());
            state.provider = text::string(record.get("provider")).or(state.provider.take());
        }
        Some("message") => {
            if let Some(message) = record.get("message").and_then(Value::as_object) {
                let role = text::string(message.get("role"));
                if !matches!(role.as_deref(), Some("user" | "assistant")) {
                    return;
                }
                let timestamp = message.get("timestamp").or_else(|| record.get("timestamp"));
                accumulator::timeline(state, timestamp);
                state.message_count = state.message_count.saturating_add(1);
                if role.as_deref() == Some("user") && state.title.is_none() {
                    state.title = message.get("content").and_then(text::title);
                }
                if role.as_deref() == Some("assistant") {
                    state.model = text::string(message.get("model"))
                        .or_else(|| text::string(record.get("model")))
                        .or(state.model.take());
                    state.provider = text::string(message.get("provider"))
                        .or_else(|| text::string(record.get("provider")))
                        .or(state.provider.take());
                    let usage_value = message.get("usage").or_else(|| record.get("usage"));
                    let timestamp_iso = timestamp
                        .and_then(accumulator::timestamp_ms)
                        .and_then(accumulator::timestamp_iso);
                    if let Some(usage) = normalized_usage(
                        usage_value,
                        state.provider.clone(),
                        state.model.clone(),
                        timestamp_iso,
                    ) {
                        accumulator::token_usage(state, usage, timestamp);
                    }
                }
                accumulator::preview_message(
                    state,
                    if role.as_deref() == Some("user") {
                        PreviewRole::User
                    } else {
                        PreviewRole::Assistant
                    },
                    message.get("content").unwrap_or(&Value::Null),
                    timestamp,
                );
            }
        }
        _ => {}
    }
}

pub(super) fn consume_antigravity(state: &mut SessionAccumulator, record: &Map<String, Value>) {
    accumulator::timeline(state, record.get("created_at"));
    let source = text::string(record.get("source"));
    let kind = text::string(record.get("type"));
    let content = text::string(record.get("content"));
    if matches!(source.as_deref(), Some("USER_EXPLICIT" | "USER"))
        && matches!(kind.as_deref(), Some("USER_INPUT" | "REQUEST"))
    {
        let request = content.as_deref().and_then(antigravity_request);
        if let Some(request) = request {
            state.message_count = state.message_count.saturating_add(1);
            if state.title.is_none() {
                state.title = text::title(&Value::String(request.clone()));
            }
            accumulator::preview_message(
                state,
                PreviewRole::User,
                &Value::String(request),
                record.get("created_at"),
            );
        }
    } else if source.as_deref() == Some("MODEL")
        && kind.as_deref() == Some("PLANNER_RESPONSE")
        && let Some(content) = content
    {
        state.message_count = state.message_count.saturating_add(1);
        accumulator::preview_message(
            state,
            PreviewRole::Assistant,
            &Value::String(content),
            record.get("created_at"),
        );
    }
}

pub(super) fn consume_kimi(
    state: &mut SessionAccumulator,
    record: &Map<String, Value>,
    pending: &mut String,
) {
    match text::string(record.get("type")).as_deref() {
        Some("config.update") => {
            state.model = text::string(record.get("modelAlias")).or(state.model.take())
        }
        Some("usage.record")
            if text::string(record.get("usageScope")).as_deref() != Some("session") =>
        {
            state.model = text::string(record.get("model")).or(state.model.take());
            let usage = record.get("usage").and_then(Value::as_object);
            let total = [
                "inputOther",
                "output",
                "inputCacheRead",
                "inputCacheCreation",
            ]
            .into_iter()
            .fold(0_u64, |sum, key| {
                sum.saturating_add(text::number(usage.and_then(|value| value.get(key))))
            });
            accumulator::tokens(state, total, record.get("timestamp"));
        }
        Some("context.append_message") => {
            if let Some(message) = record.get("message").and_then(Value::as_object)
                && text::string(message.get("role")).as_deref() == Some("user")
                && message
                    .get("origin")
                    .and_then(Value::as_object)
                    .and_then(|value| text::string(value.get("kind")))
                    .as_deref()
                    == Some("user")
            {
                state.message_count = state.message_count.saturating_add(1);
                if state.title.is_none() {
                    state.title = message.get("content").and_then(text::title);
                }
                accumulator::preview_message(
                    state,
                    PreviewRole::User,
                    message.get("content").unwrap_or(&Value::Null),
                    None,
                );
            }
        }
        Some("context.append_loop_event") => {
            if let Some(event) = record.get("event").and_then(Value::as_object) {
                match text::string(event.get("type")).as_deref() {
                    Some("content.part") => {
                        if let Some(part) = event.get("part").and_then(Value::as_object)
                            && text::string(part.get("type")).as_deref() == Some("text")
                            && let Some(chunk) = part.get("text").and_then(Value::as_str)
                        {
                            pending.push_str(chunk);
                        }
                    }
                    Some("step.end") => flush_kimi(state, pending),
                    _ => {}
                }
            }
        }
        _ => {}
    }
}

pub(super) fn flush_kimi(state: &mut SessionAccumulator, pending: &mut String) {
    if let Some(preview) = text::preview(&Value::String(std::mem::take(pending))) {
        state.message_count = state.message_count.saturating_add(1);
        accumulator::preview_message(state, PreviewRole::Assistant, &Value::String(preview), None);
    }
}

pub(super) fn antigravity_id(path: &str) -> Option<String> {
    let values = path
        .split(['/', '\\'])
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    (values.len() >= 4
        && values[values.len() - 1] == "transcript.jsonl"
        && values[values.len() - 2] == "logs"
        && values[values.len() - 3] == ".system_generated")
        .then(|| values[values.len() - 4].to_owned())
}

fn antigravity_request(content: &str) -> Option<String> {
    let body = content
        .split_once("<USER_REQUEST>")
        .map_or(content, |(_, body)| {
            body.split_once("</USER_REQUEST>")
                .map_or(body, |(body, _)| body)
        });
    let body = body.trim();
    (!body.is_empty()).then(|| body.to_owned())
}

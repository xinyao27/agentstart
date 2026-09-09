use serde_json::{Map, Value};

use super::super::super::model::{PreviewRole, SessionAccumulator};
use super::super::super::{accumulator, text};
use super::super::token_total;

pub(super) fn consume_gemini(state: &mut SessionAccumulator, record: &Map<String, Value>) {
    if let Some(id) = text::string(record.get("sessionId")) {
        state.session_id = id;
    }
    accumulator::timeline(state, record.get("startTime"));
    accumulator::timeline(state, record.get("lastUpdated"));
    for message in record
        .get("messages")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(message) = message.as_object() else {
            continue;
        };
        accumulator::timeline(state, message.get("timestamp"));
        match text::string(message.get("type")).as_deref() {
            Some("user") => {
                state.message_count = state.message_count.saturating_add(1);
                if state.title.is_none() {
                    state.title = message.get("content").and_then(text::title);
                }
                accumulator::preview_message(
                    state,
                    PreviewRole::User,
                    message.get("content").unwrap_or(&Value::Null),
                    message.get("timestamp"),
                );
            }
            Some("gemini") => {
                state.message_count = state.message_count.saturating_add(1);
                state.model = text::string(message.get("model")).or(state.model.take());
                accumulator::tokens(
                    state,
                    token_total(message.get("tokens")),
                    message.get("timestamp"),
                );
                accumulator::preview_message(
                    state,
                    PreviewRole::Assistant,
                    message.get("content").unwrap_or(&Value::Null),
                    message.get("timestamp"),
                );
            }
            _ => {}
        }
    }
}

pub(super) fn consume_hermes(state: &mut SessionAccumulator, record: &Map<String, Value>) {
    if let Some(id) = text::string(record.get("session_id")) {
        state.session_id = id;
    }
    state.model = text::string(record.get("model"));
    state.cwd = text::string(record.get("cwd"));
    accumulator::timeline(state, record.get("session_start"));
    accumulator::timeline(state, record.get("last_updated"));
    for message in record
        .get("messages")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(message) = message.as_object() else {
            continue;
        };
        let role = text::string(message.get("role"));
        if !matches!(role.as_deref(), Some("user" | "assistant")) {
            continue;
        }
        state.message_count = state.message_count.saturating_add(1);
        let content = message.get("content").unwrap_or(&Value::Null);
        if role.as_deref() == Some("user") && state.title.is_none() {
            state.title = text::title(content);
        }
        accumulator::preview_message(
            state,
            if role.as_deref() == Some("user") {
                PreviewRole::User
            } else {
                PreviewRole::Assistant
            },
            content,
            None,
        );
    }
    if state.message_count == 0 {
        state.message_count = text::number(record.get("message_count"));
    }
}

pub(super) fn consume_devin(state: &mut SessionAccumulator, record: &Map<String, Value>) {
    if let Some(id) =
        text::string(record.get("session_id")).or_else(|| text::string(record.get("sessionId")))
    {
        state.session_id = id;
    }
    let agent = record.get("agent").and_then(Value::as_object);
    state.model = agent
        .and_then(|value| {
            text::string(value.get("model_name")).or_else(|| text::string(value.get("model")))
        })
        .or_else(|| text::string(record.get("generation_model")));
    state.cwd = text::string(record.get("working_directory"));
    for step in record
        .get("steps")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(step) = step.as_object() else {
            continue;
        };
        let metadata = step.get("metadata").and_then(Value::as_object);
        let metrics = metadata
            .and_then(|value| value.get("metrics"))
            .and_then(Value::as_object);
        let timestamp = metadata.and_then(|value| value.get("created_at"));
        accumulator::timeline(state, timestamp);
        state.model = metadata
            .and_then(|value| text::string(value.get("generation_model")))
            .or_else(|| metrics.and_then(|value| text::string(value.get("generation_model"))))
            .or(state.model.take());
        accumulator::tokens(state, devin_tokens(metadata, metrics), timestamp);
        let message_content = step
            .get("message")
            .and_then(Value::as_object)
            .and_then(|value| value.get("content"));
        let content = message_content
            .or_else(|| step.get("content"))
            .or_else(|| step.get("text"))
            .unwrap_or(&Value::Null);
        let is_user = metadata
            .and_then(|value| value.get("is_user_input"))
            .and_then(Value::as_bool)
            == Some(true);
        let is_assistant = text::string(step.get("role")).as_deref() == Some("assistant")
            || step.contains_key("tool_calls");
        if is_user || is_assistant {
            state.message_count = state.message_count.saturating_add(1);
            if is_user && state.title.is_none() {
                state.title = text::title(content);
            }
            accumulator::preview_message(
                state,
                if is_user {
                    PreviewRole::User
                } else {
                    PreviewRole::Assistant
                },
                content,
                timestamp,
            );
        }
    }
}

fn devin_tokens(
    metadata: Option<&Map<String, Value>>,
    metrics: Option<&Map<String, Value>>,
) -> u64 {
    [
        &["total_input_tokens", "input_tokens"][..],
        &["output_tokens"][..],
        &["cache_read_tokens", "cache_read_input_tokens"][..],
        &["cache_creation_tokens", "cache_creation_input_tokens"][..],
    ]
    .into_iter()
    .fold(0_u64, |total, keys| {
        total.saturating_add(
            [metadata, metrics]
                .into_iter()
                .flatten()
                .find_map(|record| {
                    keys.iter().find_map(|key| {
                        let value = text::number(record.get(*key));
                        (value > 0).then_some(value)
                    })
                })
                .unwrap_or(0),
        )
    })
}

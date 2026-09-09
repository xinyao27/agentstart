use serde_json::{Map, Value};

use super::super::super::model::{PreviewRole, SessionAccumulator};
use super::super::super::{accumulator, text};
use super::super::token_total;

pub(super) fn consume_copilot(state: &mut SessionAccumulator, record: &Map<String, Value>) {
    accumulator::timeline(state, record.get("timestamp"));
    let data = record.get("data").and_then(Value::as_object);
    match text::string(record.get("type")).as_deref() {
        Some("session.start") => {
            if let Some(data) = data {
                if let Some(id) = text::string(data.get("sessionId")) {
                    state.session_id = id;
                }
                accumulator::timeline(state, data.get("startTime"));
            }
        }
        Some("session.model_change") => {
            state.model = data
                .and_then(|value| text::string(value.get("newModel")))
                .or(state.model.take())
        }
        Some("session.info") => {
            if let Some(message) = data.and_then(|value| text::string(value.get("message"))) {
                state.cwd = message
                    .strip_prefix("Folder ")
                    .and_then(|value| value.strip_suffix(" has been added to trusted folders."))
                    .map(str::to_owned)
                    .or(state.cwd.take());
            }
        }
        Some("user.message" | "assistant.message") => {
            if let Some(data) = data {
                let user = text::string(record.get("type")).as_deref() == Some("user.message");
                let content = data
                    .get("transformedContent")
                    .or_else(|| data.get("content"))
                    .unwrap_or(&Value::Null);
                state.message_count = state.message_count.saturating_add(1);
                if user && state.title.is_none() {
                    state.title = text::title(content);
                }
                accumulator::preview_message(
                    state,
                    if user {
                        PreviewRole::User
                    } else {
                        PreviewRole::Assistant
                    },
                    content,
                    record.get("timestamp"),
                );
            }
        }
        Some("session.shutdown") => {
            if let Some(data) = data {
                state.model = text::string(data.get("currentModel")).or(state.model.take());
                accumulator::tokens(
                    state,
                    text::number(data.get("currentTokens"))
                        .saturating_add(model_metrics(data.get("modelMetrics"))),
                    record.get("timestamp"),
                );
            }
        }
        _ => {}
    }
}

pub(super) fn consume_cursor(state: &mut SessionAccumulator, record: &Map<String, Value>) {
    accumulator::timeline(state, record.get("timestamp"));
    let role = text::string(record.get("role"));
    if !matches!(role.as_deref(), Some("user" | "assistant")) {
        return;
    }
    let content = record
        .get("message")
        .and_then(Value::as_object)
        .and_then(|value| value.get("content"))
        .or_else(|| record.get("content"))
        .unwrap_or(&Value::Null);
    state.message_count = state.message_count.saturating_add(1);
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
        record.get("timestamp"),
    );
}

pub(super) fn consume_droid(state: &mut SessionAccumulator, record: &Map<String, Value>) {
    accumulator::timeline(state, record.get("timestamp"));
    if let Some(id) =
        text::string(record.get("session_id")).or_else(|| text::string(record.get("sessionId")))
    {
        state.session_id = id;
    }
    match text::string(record.get("type")).as_deref() {
        Some("session_start") => {
            if let Some(id) = text::string(record.get("id")) {
                state.session_id = id;
            }
            state.title = record
                .get("title")
                .and_then(text::title)
                .or(state.title.take());
            state.cwd = text::string(record.get("cwd")).or(state.cwd.take());
        }
        Some("system") => {
            state.cwd = text::string(record.get("cwd")).or(state.cwd.take());
            state.model = text::string(record.get("model")).or(state.model.take());
        }
        Some("message") => consume_role_message(state, record, record.get("timestamp")),
        Some("completion") => {
            state.message_count = state.message_count.saturating_add(1);
            accumulator::tokens(
                state,
                token_total(record.get("usage")),
                record.get("timestamp"),
            );
            accumulator::preview_message(
                state,
                PreviewRole::Assistant,
                record.get("finalText").unwrap_or(&Value::Null),
                record.get("timestamp"),
            );
        }
        _ => {}
    }
}

pub(super) fn consume_gemini(state: &mut SessionAccumulator, record: &Map<String, Value>) {
    if let Some(set) = record.get("$set").and_then(Value::as_object) {
        accumulator::timeline(state, set.get("lastUpdated"));
        return;
    }
    if let Some(id) = text::string(record.get("sessionId")) {
        state.session_id = id;
    }
    accumulator::timeline(state, record.get("startTime"));
    accumulator::timeline(
        state,
        record
            .get("lastUpdated")
            .or_else(|| record.get("timestamp")),
    );
    match text::string(record.get("type")).as_deref() {
        Some("user") => {
            state.message_count = state.message_count.saturating_add(1);
            if state.title.is_none() {
                state.title = record.get("content").and_then(text::title);
            }
            accumulator::preview_message(
                state,
                PreviewRole::User,
                record.get("content").unwrap_or(&Value::Null),
                record.get("timestamp"),
            );
        }
        Some("gemini") => {
            state.message_count = state.message_count.saturating_add(1);
            state.model = text::string(record.get("model")).or(state.model.take());
            accumulator::tokens(
                state,
                token_total(record.get("tokens")),
                record.get("timestamp"),
            );
            accumulator::preview_message(
                state,
                PreviewRole::Assistant,
                record.get("content").unwrap_or(&Value::Null),
                record.get("timestamp"),
            );
        }
        _ => {}
    }
}

pub(super) fn consume_role_message(
    state: &mut SessionAccumulator,
    record: &Map<String, Value>,
    timestamp: Option<&Value>,
) {
    let message = record.get("message").and_then(Value::as_object);
    let role = text::string(record.get("role"))
        .or_else(|| message.and_then(|value| text::string(value.get("role"))));
    if !matches!(role.as_deref(), Some("user" | "assistant")) {
        return;
    }
    let content = record
        .get("text")
        .or_else(|| message.and_then(|value| value.get("content")))
        .unwrap_or(&Value::Null);
    state.message_count = state.message_count.saturating_add(1);
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
        timestamp,
    );
}

pub(super) fn consume_generic(state: &mut SessionAccumulator, record: &Map<String, Value>) {
    accumulator::timeline(
        state,
        record.get("timestamp").or_else(|| record.get("created_at")),
    );
    consume_role_message(state, record, record.get("timestamp"));
}

fn model_metrics(value: Option<&Value>) -> u64 {
    value.and_then(Value::as_object).map_or(0, |metrics| {
        metrics.values().fold(0_u64, |sum, metric| {
            sum.saturating_add(token_total(metric.get("usage")))
        })
    })
}

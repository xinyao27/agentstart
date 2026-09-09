use serde_json::{Map, Value};

use super::super::super::model::{PreviewRole, SessionAccumulator};
use super::super::super::{accumulator, text};
use super::super::token_total;

pub(super) fn consume_claude(state: &mut SessionAccumulator, record: &Map<String, Value>) {
    accumulator::timeline(state, record.get("timestamp"));
    if let Some(id) = text::string(record.get("sessionId")) {
        state.session_id = id;
    }
    if state.cwd.is_none() {
        state.cwd = text::string(record.get("cwd"));
    }
    if let Some(branch) = text::string(record.get("gitBranch")) {
        state.branch = Some(branch);
    }
    match text::string(record.get("type")).as_deref() {
        Some("custom-title") => state.title = record.get("customTitle").and_then(text::title),
        Some("ai-title") => {
            if let Some(title) = record.get("aiTitle").and_then(text::title) {
                state.title = Some(title);
            }
        }
        Some("queue-operation") => match text::string(record.get("operation")).as_deref() {
            Some("enqueue") if text::string(record.get("content")).is_some() => {
                state.queued_message_count = state.queued_message_count.saturating_add(1)
            }
            Some("remove" | "dequeue") => {
                state.queued_message_count = state.queued_message_count.saturating_sub(1)
            }
            _ => {}
        },
        Some("last-prompt") => {
            state.last_user_prompt = record.get("lastPrompt").and_then(text::title)
        }
        Some("user") => {
            state.message_count = state.message_count.saturating_add(1);
            if let Some(message) = record.get("message") {
                state.title.get_or_insert_with(|| {
                    text::message_content(Some(message), false).unwrap_or_default()
                });
                accumulator::preview_message(
                    state,
                    PreviewRole::User,
                    message
                        .as_object()
                        .and_then(|value| value.get("content"))
                        .unwrap_or(message),
                    record.get("timestamp"),
                );
            }
        }
        Some("assistant") => {
            state.message_count = state.message_count.saturating_add(1);
            if let Some(message) = record.get("message") {
                if let Some(model) = message
                    .as_object()
                    .and_then(|value| text::string(value.get("model")))
                {
                    state.model = Some(model);
                }
                let usage = message.as_object().and_then(|value| value.get("usage"));
                accumulator::tokens(state, claude_tokens(usage), record.get("timestamp"));
                accumulator::preview_message(
                    state,
                    PreviewRole::Assistant,
                    message
                        .as_object()
                        .and_then(|value| value.get("content"))
                        .unwrap_or(message),
                    record.get("timestamp"),
                );
            }
        }
        _ => {}
    }
    state.title = state.title.take().filter(|value| !value.is_empty());
}

pub(super) fn consume_codex(
    state: &mut SessionAccumulator,
    record: &Map<String, Value>,
    previous: &mut u64,
    worker: &mut bool,
) {
    accumulator::timeline(state, record.get("timestamp"));
    let kind = text::string(record.get("type"));
    let payload = record.get("payload").and_then(Value::as_object);
    if kind.as_deref() == Some("session_meta") {
        if let Some(payload) = payload {
            let source = text::string(payload.get("thread_source"))
                .or_else(|| text::string(payload.get("threadSource")));
            *worker = source
                .as_deref()
                .is_some_and(|value| !value.eq_ignore_ascii_case("user"))
                || payload
                    .get("source")
                    .and_then(Value::as_object)
                    .and_then(|value| value.get("subagent"))
                    .and_then(Value::as_object)
                    .is_some();
            if let Some(id) = text::string(payload.get("id")) {
                state.session_id = id;
            }
            state.cwd = text::string(payload.get("cwd")).or(state.cwd.take());
            state.title = ["title", "thread_name", "threadName"]
                .into_iter()
                .find_map(|key| payload.get(key).and_then(text::title))
                .or(state.title.take());
            state.branch = payload
                .get("git")
                .and_then(Value::as_object)
                .and_then(|git| {
                    text::string(git.get("branch"))
                        .or_else(|| text::string(git.get("current_branch")))
                })
                .or(state.branch.take());
        }
        return;
    }
    if kind.as_deref() == Some("turn_context") {
        if let Some(payload) = payload {
            state.cwd = text::string(payload.get("cwd")).or(state.cwd.take());
            state.model = extract_model(payload).or(state.model.take());
        }
        return;
    }
    let Some(payload) = payload else { return };
    if kind.as_deref() == Some("response_item")
        && text::string(payload.get("type")).as_deref() == Some("message")
    {
        let role = text::string(payload.get("role"));
        if matches!(role.as_deref(), Some("user" | "assistant")) {
            state.message_count = state.message_count.saturating_add(1);
            if role.as_deref() == Some("user") && state.title.is_none() {
                state.title = payload.get("content").and_then(text::title);
            }
            accumulator::preview_message(
                state,
                if role.as_deref() == Some("assistant") {
                    PreviewRole::Assistant
                } else {
                    PreviewRole::User
                },
                payload.get("content").unwrap_or(&Value::Null),
                record.get("timestamp"),
            );
        }
        return;
    }
    if kind.as_deref() != Some("event_msg") {
        return;
    }
    match text::string(payload.get("type")).as_deref() {
        Some("user_message") => {
            state.message_count = state.message_count.saturating_add(1);
            if state.title.is_none() {
                state.title = payload.get("message").and_then(text::title);
            }
            state.last_user_prompt = payload.get("message").and_then(text::title);
            accumulator::preview_message(
                state,
                PreviewRole::User,
                payload.get("message").unwrap_or(&Value::Null),
                record.get("timestamp"),
            );
        }
        Some("agent_message") => {
            state.message_count = state.message_count.saturating_add(1);
            accumulator::preview_message(
                state,
                PreviewRole::Assistant,
                payload.get("message").unwrap_or(&Value::Null),
                record.get("timestamp"),
            );
        }
        Some("token_count") => {
            let info = payload.get("info").and_then(Value::as_object);
            let total = info
                .and_then(|value| value.get("total_token_usage"))
                .map(|value| token_total(Some(value)));
            let delta = match total {
                Some(total) => {
                    let delta = total.saturating_sub(*previous);
                    *previous = total;
                    delta
                }
                None => info
                    .and_then(|value| value.get("last_token_usage"))
                    .map_or(0, |value| token_total(Some(value))),
            };
            accumulator::tokens(state, delta, record.get("timestamp"));
            state.model = extract_model(payload).or(state.model.take());
        }
        _ => {}
    }
}

fn claude_tokens(value: Option<&Value>) -> u64 {
    let Some(record) = value.and_then(Value::as_object) else {
        return 0;
    };
    [
        "input_tokens",
        "output_tokens",
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
    ]
    .into_iter()
    .fold(0_u64, |sum, key| {
        sum.saturating_add(text::number(record.get(key)))
    })
}

fn extract_model(record: &Map<String, Value>) -> Option<String> {
    text::string(record.get("model"))
        .or_else(|| text::string(record.get("model_name")))
        .or_else(|| {
            record
                .get("metadata")
                .and_then(Value::as_object)
                .and_then(|value| text::string(value.get("model")))
        })
        .or_else(|| {
            record
                .get("info")
                .and_then(Value::as_object)
                .and_then(|value| text::string(value.get("model")))
        })
}

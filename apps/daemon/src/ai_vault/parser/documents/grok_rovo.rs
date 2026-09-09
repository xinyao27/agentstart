use serde_json::{Map, Value};

use crate::hosts::HostFilesystem;

use super::super::super::model::{PreviewRole, SessionAccumulator};
use super::super::super::{accumulator, text};
use super::ParseError;
use super::read;

pub(super) async fn consume_grok(
    state: &mut SessionAccumulator,
    record: &Map<String, Value>,
    filesystem: &HostFilesystem,
) -> Result<(), ParseError> {
    let info = record.get("info").and_then(Value::as_object);
    if let Some(id) = info.and_then(|value| text::string(value.get("id"))) {
        state.session_id = id;
    }
    state.cwd = info.and_then(|value| text::string(value.get("cwd")));
    state.title = record
        .get("generated_title")
        .and_then(text::title)
        .or_else(|| record.get("session_summary").and_then(text::title));
    state.model = text::string(record.get("current_model_id"));
    state.branch = text::string(record.get("head_branch"));
    state.message_count =
        text::number(record.get("num_chat_messages")).max(text::number(record.get("num_messages")));
    for key in ["created_at", "updated_at", "last_active_at"] {
        accumulator::timeline(state, record.get(key));
    }
    let directory = filesystem.paths().dirname(&state.file_path);
    if let Some(chat) = read::optional_text(
        filesystem,
        &filesystem.paths().join(&[&directory, "chat_history.jsonl"]),
    )
    .await?
    {
        for line in chat.lines() {
            let Some(entry) =
                text::parse_json_line(line).and_then(|value| value.as_object().cloned())
            else {
                continue;
            };
            let role = text::string(entry.get("type"));
            if !matches!(role.as_deref(), Some("user" | "assistant")) {
                continue;
            }
            let content = entry.get("content").cloned().unwrap_or(Value::Null);
            let content = if role.as_deref() == Some("user") {
                unwrap_user_query(content)
            } else {
                content
            };
            if role.as_deref() == Some("user") && state.title.is_none() {
                state.title = text::title(&content);
            }
            accumulator::preview_message(
                state,
                if role.as_deref() == Some("user") {
                    PreviewRole::User
                } else {
                    PreviewRole::Assistant
                },
                &content,
                entry.get("timestamp"),
            );
        }
    }
    if let Some(updates) = read::optional_text(
        filesystem,
        &filesystem.paths().join(&[&directory, "updates.jsonl"]),
    )
    .await?
    {
        let mut previous = 0_u64;
        for line in updates
            .lines()
            .filter(|line| line.contains("\"totalTokens\""))
        {
            let total = text::parse_json_line(line)
                .and_then(|value| value.get("params").cloned())
                .and_then(|value| value.get("_meta").cloned())
                .and_then(|value| value.get("totalTokens").cloned())
                .map_or(0, |value| text::number(Some(&value)));
            if total > previous {
                accumulator::tokens(state, total - previous, None);
            }
            previous = total;
        }
    }
    Ok(())
}

pub(super) async fn consume_rovo(
    state: &mut SessionAccumulator,
    record: &Map<String, Value>,
    filesystem: &HostFilesystem,
) -> Result<(), ParseError> {
    state.session_id = filesystem
        .paths()
        .basename(&filesystem.paths().dirname(&state.file_path));
    state.title = text::first_string(record, &["title", "name", "summary"])
        .and_then(|value| text::title(&Value::String(value)));
    state.cwd = text::first_string(
        record,
        &[
            "workspace_path",
            "workspacePath",
            "workspace",
            "cwd",
            "working_directory",
            "workingDirectory",
            "project_path",
            "projectPath",
        ],
    );
    accumulator::timeline(
        state,
        record.get("created_at").or_else(|| record.get("createdAt")),
    );
    accumulator::timeline(
        state,
        record.get("updated_at").or_else(|| record.get("updatedAt")),
    );
    let context_path = filesystem.paths().join(&[
        &filesystem.paths().dirname(&state.file_path),
        "session_context.json",
    ]);
    let Some(context) = read::optional_json(filesystem, &context_path).await? else {
        return Ok(());
    };
    for message in context
        .get("messages")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        consume_rovo_message(state, message.as_object());
    }
    for message in context
        .get("message_history")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        consume_rovo_message(state, message.as_object());
    }
    Ok(())
}

fn consume_rovo_message(state: &mut SessionAccumulator, record: Option<&Map<String, Value>>) {
    let Some(record) = record else { return };
    let role = text::string(record.get("role")).or_else(|| {
        match text::string(record.get("kind")).as_deref() {
            Some("request") => Some("user".to_owned()),
            Some("response") => Some("assistant".to_owned()),
            _ => None,
        }
    });
    if !matches!(role.as_deref(), Some("user" | "assistant")) {
        return;
    }
    let content = record
        .get("content")
        .or_else(|| record.get("text"))
        .or_else(|| record.get("parts"))
        .unwrap_or(&Value::Null);
    let Some(normalized) = text::preview(content) else {
        return;
    };
    state.message_count = state.message_count.saturating_add(1);
    accumulator::timeline(state, record.get("timestamp"));
    if role.as_deref() == Some("user") && state.title.is_none() {
        state.title = text::title(&Value::String(normalized.clone()));
    }
    accumulator::preview_message(
        state,
        if role.as_deref() == Some("user") {
            PreviewRole::User
        } else {
            PreviewRole::Assistant
        },
        &Value::String(normalized),
        record.get("timestamp"),
    );
}

fn unwrap_user_query(value: Value) -> Value {
    let Some(value) = value.as_str() else {
        return value;
    };
    let lowercase = value.to_ascii_lowercase();
    let Some(start) = lowercase
        .find("<user_query>")
        .map(|index| index + "<user_query>".len())
    else {
        return Value::String(value.to_owned());
    };
    let end = lowercase[start..]
        .find("</user_query>")
        .map_or(value.len(), |offset| start + offset);
    Value::String(value[start..end].to_owned())
}

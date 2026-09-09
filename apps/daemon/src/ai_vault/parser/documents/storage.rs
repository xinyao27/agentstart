use serde_json::{Map, Value};

use crate::hosts::{HostFilesystem, HostPlatform};

use super::super::super::model::{AiVaultAgent, PreviewRole, SessionAccumulator, SessionCandidate};
use super::super::super::{accumulator, text};
use super::super::token_total;
use super::ParseError;
use super::read;

pub(super) async fn consume_opencode(
    state: &mut SessionAccumulator,
    record: &Map<String, Value>,
    filesystem: &HostFilesystem,
) -> Result<(), ParseError> {
    if let Some(id) = text::string(record.get("id")) {
        state.session_id = id;
    }
    state.title = record.get("title").and_then(text::title);
    state.cwd = text::string(record.get("directory"));
    if let Some(time) = record.get("time").and_then(Value::as_object) {
        accumulator::timeline(state, time.get("created"));
        accumulator::timeline(state, time.get("updated"));
    }
    let session_directory = filesystem.paths().dirname(&state.file_path);
    let session_root = filesystem.paths().dirname(&session_directory);
    if filesystem.paths().basename(&session_root) != "session" {
        return Ok(());
    }
    let storage_root = filesystem.paths().dirname(&session_root);
    let message_directory = filesystem
        .paths()
        .join(&[&storage_root, "message", &state.session_id]);
    let entries = match filesystem.read_dir(&message_directory).await {
        Ok(entries) => entries,
        Err(_) => return Ok(()),
    };
    for entry in entries
        .into_iter()
        .filter(|entry| {
            entry.kind == crate::hosts::HostFileKind::File && entry.name.ends_with(".json")
        })
        .take(10_000)
    {
        let path = filesystem.paths().join(&[&message_directory, &entry.name]);
        let Some(message) = read::optional_json(filesystem, &path).await? else {
            continue;
        };
        let role = text::string(message.get("role"));
        if !matches!(role.as_deref(), Some("user" | "assistant")) {
            continue;
        }
        state.message_count = state.message_count.saturating_add(1);
        let timestamp = message
            .get("time")
            .and_then(Value::as_object)
            .and_then(|value| value.get("created"));
        accumulator::timeline(state, timestamp);
        let summary = message.get("summary").and_then(Value::as_object);
        if role.as_deref() == Some("user") && state.title.is_none() {
            state.title = summary
                .and_then(|value| value.get("title").or_else(|| value.get("body")))
                .and_then(text::title);
        }
        let content = message
            .get("content")
            .or_else(|| summary.and_then(|value| value.get("body").or_else(|| value.get("title"))))
            .unwrap_or(&Value::Null);
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
        state.model = message
            .get("model")
            .and_then(Value::as_object)
            .and_then(|value| text::string(value.get("modelID")))
            .or_else(|| text::string(message.get("modelID")))
            .or(state.model.take());
        accumulator::tokens(state, token_total(message.get("tokens")), timestamp);
    }
    Ok(())
}

pub(super) async fn consume_kimi(
    state: &mut SessionAccumulator,
    record: &Map<String, Value>,
    filesystem: &HostFilesystem,
) -> Result<(), ParseError> {
    let session_directory = filesystem.paths().dirname(&state.file_path);
    state.session_id = filesystem.paths().basename(&session_directory);
    state.title = record
        .get("title")
        .and_then(text::title)
        .or_else(|| record.get("lastPrompt").and_then(text::title));
    accumulator::timeline(state, record.get("createdAt"));
    accumulator::timeline(state, record.get("updatedAt"));
    let sessions_directory = filesystem
        .paths()
        .dirname(&filesystem.paths().dirname(&session_directory));
    let index_path = filesystem.paths().join(&[
        &filesystem.paths().dirname(&sessions_directory),
        "session_index.jsonl",
    ]);
    if let Some(index) = read::optional_text(filesystem, &index_path).await? {
        for line in index.lines() {
            let Some(entry) = text::parse_json_line(line) else {
                continue;
            };
            if text::string(entry.get("sessionId")).as_deref() == Some(&state.session_id) {
                state.cwd = text::string(entry.get("workDir"));
            }
        }
    }
    let primary = record
        .get("agents")
        .and_then(Value::as_object)
        .and_then(|agents| {
            agents.iter().find_map(|(id, value)| {
                let agent = value.as_object()?;
                (text::string(agent.get("type")).as_deref() == Some("main")
                    && agent.get("parentAgentId").is_none_or(Value::is_null))
                .then(|| id.clone())
            })
        })
        .unwrap_or_else(|| "main".to_owned());
    let wire_path =
        filesystem
            .paths()
            .join(&[&session_directory, "agents", &primary, "wire.jsonl"]);
    if let Some(wire) = read::optional_text(filesystem, &wire_path).await? {
        let wire_candidate = SessionCandidate {
            agent: AiVaultAgent::Kimi,
            codex_home: None,
            modified_at: state.modified_at.clone(),
            modified_at_ms: 0,
            path: wire_path,
            size_bytes: wire.len() as u64,
        };
        if let Some(wire_session) = super::super::lines::parse(
            &wire_candidate,
            &wire,
            filesystem,
            "local",
            HostPlatform::Unknown,
        )
        .await?
        {
            state.model = wire_session.model;
            state.message_count = wire_session.message_count;
            state.preview_messages = wire_session.preview_messages;
            state.total_tokens = wire_session.total_tokens;
            state.tokens_by_day = wire_session
                .tokens_by_day
                .unwrap_or_default()
                .into_iter()
                .map(|item| (item.day, item.tokens))
                .collect();
        }
    }
    Ok(())
}

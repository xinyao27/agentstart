use serde_json::Value;

use crate::hosts::HostPlatform;

use super::super::super::model::{AiVaultSession, PreviewRole, SessionCandidate};
use super::super::super::{accumulator, text};
use super::super::token_total;

pub(super) struct SqliteRow {
    pub(super) agent: Option<String>,
    pub(super) cache_read: u64,
    pub(super) created: i64,
    pub(super) cwd: Option<String>,
    pub(super) id: String,
    pub(super) input: u64,
    pub(super) message_count: u64,
    pub(super) model: Option<String>,
    pub(super) output: u64,
    pub(super) preview: Vec<(String, i64, String)>,
    pub(super) reasoning: u64,
    pub(super) title: Option<String>,
    pub(super) updated: i64,
    pub(super) usage: Vec<(i64, Value)>,
}

pub(super) fn to_session(
    candidate: &SessionCandidate,
    row: SqliteRow,
    execution_host_id: &str,
    platform: HostPlatform,
) -> Option<AiVaultSession> {
    let mut state = accumulator::create(candidate);
    state.file_path = candidate
        .path
        .rsplit_once("#session:")
        .map_or_else(|| candidate.path.clone(), |(path, _)| path.to_owned());
    state.session_id = row.id;
    state.title = row
        .title
        .and_then(|value| text::title(&Value::String(value)));
    state.cwd = row.cwd;
    state.model = row.model.and_then(parse_model);
    state.provider = row.agent;
    accumulator::timeline(&mut state, Some(&Value::from(row.created)));
    accumulator::timeline(&mut state, Some(&Value::from(row.updated)));
    state.message_count = row.message_count;
    for (time, usage) in row.usage {
        accumulator::tokens(
            &mut state,
            token_total(Some(&usage)),
            Some(&Value::from(time)),
        );
    }
    if state.total_tokens == 0 {
        accumulator::tokens(
            &mut state,
            row.input
                .saturating_add(row.output)
                .saturating_add(row.reasoning)
                .saturating_add(row.cache_read),
            Some(&Value::from(row.updated)),
        );
    }
    let mut previews = row.preview;
    previews.sort_by_key(|(_, time, _)| *time);
    for (role, time, content) in previews
        .into_iter()
        .rev()
        .take(5)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
    {
        accumulator::preview_message(
            &mut state,
            PreviewRole::parse(&role),
            &Value::String(content),
            Some(&Value::from(time)),
        );
    }
    accumulator::finalize(state, execution_host_id, platform)
}

fn parse_model(value: String) -> Option<String> {
    serde_json::from_str::<Value>(&value)
        .ok()
        .and_then(|value| {
            text::string(value.get("id")).or_else(|| text::string(value.get("modelID")))
        })
        .or(Some(value))
}

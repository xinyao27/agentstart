use chrono::{DateTime, Local, SecondsFormat, TimeZone, Utc};
use serde_json::Value;

use crate::hosts::HostPlatform;

use super::model::{
    AiVaultAgent, AiVaultSession, AiVaultSessionDayTokens, AiVaultSessionPreviewMessage,
    AiVaultSessionTokenUsage, PreviewRole, SessionAccumulator, SessionCandidate,
};
use super::{resume, text};

const PREVIEW_LIMIT: usize = 5;

pub(super) fn create(candidate: &SessionCandidate) -> SessionAccumulator {
    SessionAccumulator {
        agent: candidate.agent,
        branch: None,
        codex_home: candidate.codex_home.clone(),
        created_at_ms: None,
        cwd: None,
        file_path: candidate.path.clone(),
        last_user_prompt: None,
        message_count: 0,
        model: None,
        modified_at: candidate.modified_at.clone(),
        preview_messages: Vec::new(),
        provider: None,
        queued_message_count: 0,
        session_id: session_id_from_path(&candidate.path),
        subagent_transcript_count: 0,
        title: None,
        token_usage: Vec::new(),
        tokens_by_day: std::collections::BTreeMap::new(),
        total_tokens: 0,
        updated_at_ms: None,
    }
}

pub(super) fn finalize(
    accumulator: SessionAccumulator,
    execution_host_id: &str,
    platform: HostPlatform,
) -> Option<AiVaultSession> {
    let session_id = accumulator.session_id.trim().to_owned();
    if session_id.is_empty() {
        return None;
    }
    let title = accumulator
        .title
        .clone()
        .unwrap_or_else(|| format!("{} {}", accumulator.agent.label(), prefix(&session_id, 8)));
    let tokens_by_day = (!accumulator.tokens_by_day.is_empty()).then(|| {
        accumulator
            .tokens_by_day
            .into_iter()
            .map(|(day, tokens)| AiVaultSessionDayTokens { day, tokens })
            .collect()
    });
    let token_usage = (!accumulator.token_usage.is_empty()).then_some(accumulator.token_usage);
    Some(AiVaultSession {
        id: format!(
            "{execution_host_id}:{}:{session_id}:{}",
            accumulator.agent.as_str(),
            accumulator.file_path
        ),
        execution_host_id: execution_host_id.to_owned(),
        execution_host_platform: platform_name(platform).map(str::to_owned),
        agent: accumulator.agent,
        session_id: session_id.clone(),
        title,
        cwd: accumulator.cwd.clone(),
        branch: accumulator.branch,
        model: accumulator.model,
        file_path: accumulator.file_path.clone(),
        codex_home: (accumulator.agent == AiVaultAgent::Codex)
            .then_some(accumulator.codex_home.clone())
            .flatten(),
        created_at: accumulator.created_at_ms.and_then(timestamp_iso),
        updated_at: accumulator.updated_at_ms.and_then(timestamp_iso),
        modified_at: accumulator.modified_at,
        message_count: accumulator.message_count,
        total_tokens: accumulator.total_tokens,
        tokens_by_day,
        token_usage,
        preview_messages: accumulator.preview_messages,
        last_user_prompt: accumulator.last_user_prompt,
        queued_message_count: accumulator.queued_message_count,
        subagent_transcript_count: accumulator.subagent_transcript_count,
        resume_command: resume::command(
            accumulator.agent,
            &session_id,
            &accumulator.file_path,
            accumulator.cwd.as_deref(),
            accumulator.codex_home.as_deref(),
            platform,
        ),
        subagent: None,
    })
}

pub(super) fn timeline(accumulator: &mut SessionAccumulator, value: Option<&Value>) {
    let Some(timestamp) = value.and_then(timestamp_ms) else {
        return;
    };
    accumulator.created_at_ms = Some(
        accumulator
            .created_at_ms
            .map_or(timestamp, |at| at.min(timestamp)),
    );
    if accumulator.updated_at_ms.is_none_or(|at| timestamp >= at) {
        accumulator.updated_at_ms = Some(timestamp);
    }
}

pub(super) fn preview_message(
    accumulator: &mut SessionAccumulator,
    role: PreviewRole,
    content: &Value,
    timestamp: Option<&Value>,
) {
    let Some(text) = text::preview(content) else {
        return;
    };
    accumulator
        .preview_messages
        .push(AiVaultSessionPreviewMessage {
            role,
            text,
            timestamp: timestamp.and_then(timestamp_ms).and_then(timestamp_iso),
        });
    if accumulator.preview_messages.len() > PREVIEW_LIMIT {
        accumulator.preview_messages.remove(0);
    }
}

pub(super) fn tokens(accumulator: &mut SessionAccumulator, count: u64, timestamp: Option<&Value>) {
    if count == 0 {
        return;
    }
    accumulator.total_tokens = accumulator.total_tokens.saturating_add(count);
    let at = timestamp
        .and_then(timestamp_ms)
        .or(accumulator.updated_at_ms);
    if let Some(day) = at.and_then(local_day) {
        let current = accumulator.tokens_by_day.entry(day).or_default();
        *current = current.saturating_add(count);
    }
}

pub(super) fn token_usage(
    accumulator: &mut SessionAccumulator,
    usage: AiVaultSessionTokenUsage,
    timestamp: Option<&Value>,
) {
    tokens(accumulator, usage.total_tokens, timestamp);
    accumulator.token_usage.push(usage);
}

pub(super) fn timestamp_ms(value: &Value) -> Option<i64> {
    if let Some(value) = value.as_str() {
        return DateTime::parse_from_rfc3339(value)
            .ok()
            .map(|value| value.timestamp_millis())
            .or_else(|| {
                value
                    .parse::<i64>()
                    .ok()
                    .and_then(normalize_numeric_timestamp)
            });
    }
    value
        .as_i64()
        .and_then(normalize_numeric_timestamp)
        .or_else(|| {
            value
                .as_f64()
                .filter(|value| value.is_finite() && *value > 0.0)
                .map(|value| value as i64)
                .and_then(normalize_numeric_timestamp)
        })
}

pub(super) fn timestamp_iso(value: i64) -> Option<String> {
    Utc.timestamp_millis_opt(value)
        .single()
        .map(|value| value.to_rfc3339_opts(SecondsFormat::Millis, true))
}

pub(super) fn session_id_from_path(path: &str) -> String {
    let filename = path
        .trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(path);
    let stem = filename.rsplit_once('.').map_or(filename, |(stem, _)| stem);
    let bytes = stem.as_bytes();
    if bytes.len() >= 36 {
        let tail = &stem[bytes.len() - 36..];
        if is_uuid_like(tail) {
            return tail.to_owned();
        }
    }
    stem.to_owned()
}

pub(super) fn sort_time(session: &AiVaultSession) -> i64 {
    session
        .updated_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map_or_else(
            || {
                DateTime::parse_from_rfc3339(&session.modified_at)
                    .ok()
                    .map_or(0, |value| value.timestamp_millis())
            },
            |value| value.timestamp_millis(),
        )
}

fn normalize_numeric_timestamp(value: i64) -> Option<i64> {
    (value > 0).then(|| {
        if value > 1_000_000_000_000 {
            value
        } else {
            value.saturating_mul(1_000)
        }
    })
}

fn local_day(value: i64) -> Option<String> {
    Local
        .timestamp_millis_opt(value)
        .single()
        .map(|value| value.format("%Y-%m-%d").to_string())
}

fn platform_name(platform: HostPlatform) -> Option<&'static str> {
    match platform {
        HostPlatform::Darwin => Some("darwin"),
        HostPlatform::Linux => Some("linux"),
        HostPlatform::Windows => Some("win32"),
        HostPlatform::Unknown => None,
    }
}

fn prefix(value: &str, count: usize) -> String {
    value.chars().take(count).collect()
}

fn is_uuid_like(value: &str) -> bool {
    value.len() == 36
        && value.char_indices().all(|(index, character)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                character == '-'
            } else {
                character.is_ascii_hexdigit()
            }
        })
}

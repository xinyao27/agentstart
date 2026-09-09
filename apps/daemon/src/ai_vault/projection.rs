use std::collections::HashMap;

use super::accumulator;
use super::model::{AiVaultAgent, AiVaultListResult, AiVaultSession};

pub(super) fn normalize_scope(value: Option<&str>) -> String {
    let value = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("local");
    if value == "all"
        || value == "local"
        || ["runtime:", "ssh:", "wsl:"]
            .iter()
            .any(|prefix| valid_host_id(value, prefix))
    {
        value.to_owned()
    } else {
        "all".to_owned()
    }
}

pub(super) fn cache_key(
    scope: &str,
    stamp: Option<&str>,
    limit: usize,
    scope_paths: &[String],
) -> String {
    format!(
        "{scope}\0{}\0{limit}\0{}",
        stamp.unwrap_or(""),
        scope_paths.join("\0")
    )
}

pub(super) fn dedupe(sessions: Vec<AiVaultSession>) -> Vec<AiVaultSession> {
    let mut by_id = HashMap::<String, AiVaultSession>::new();
    for session in sessions {
        let key = if session.agent == AiVaultAgent::Codex {
            format!("{}:{}", session.execution_host_id, session.session_id)
        } else {
            session.id.clone()
        };
        if by_id.get(&key).is_none_or(|current| {
            accumulator::sort_time(&session) > accumulator::sort_time(current)
        }) {
            by_id.insert(key, session);
        }
    }
    by_id.into_values().collect()
}

pub(super) fn requested(result: AiVaultListResult, compact: bool) -> AiVaultListResult {
    if compact {
        compact_result(result)
    } else {
        result
    }
}

pub(super) fn path_inside(parent: &str, child: &str) -> bool {
    let parent = parent.trim_end_matches(['/', '\\']);
    let child = child.trim_end_matches(['/', '\\']);
    child == parent
        || child
            .strip_prefix(parent)
            .is_some_and(|suffix| suffix.starts_with(['/', '\\']))
}

fn compact_result(mut result: AiVaultListResult) -> AiVaultListResult {
    let mut remaining = 64 * 1_024;
    for session in &mut result.sessions {
        if session.preview_messages.len() > 5 {
            session
                .preview_messages
                .drain(..session.preview_messages.len() - 5);
        }
        session.preview_messages.retain_mut(|message| {
            if remaining == 0 {
                return false;
            }
            message.text = truncate_utf8(&message.text, remaining.min(1_024));
            remaining = remaining.saturating_sub(message.text.len());
            true
        });
        session.tokens_by_day = None;
        session.token_usage = None;
        session.last_user_prompt = None;
        session.subagent = None;
    }
    result
}

fn valid_host_id(value: &str, prefix: &str) -> bool {
    let Some(encoded) = value.strip_prefix(prefix).filter(|value| !value.is_empty()) else {
        return false;
    };
    let bytes = encoded.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let Some(high) = bytes.get(index + 1).and_then(|value| hex(*value)) else {
                return false;
            };
            let Some(low) = bytes.get(index + 2).and_then(|value| hex(*value)) else {
                return false;
            };
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    std::str::from_utf8(&decoded).is_ok_and(|value| !value.trim().is_empty())
}

fn hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn truncate_utf8(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_owned();
    }
    if max_bytes < '…'.len_utf8() {
        return String::new();
    }
    let mut end = max_bytes - '…'.len_utf8();
    while !value.is_char_boundary(end) {
        end = end.saturating_sub(1);
    }
    format!("{}…", &value[..end])
}

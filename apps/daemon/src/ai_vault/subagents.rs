use std::cmp::Reverse;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::hosts::{ExecutionHost, HostFileKind, HostFilesystem};

use super::model::{
    AiVaultAgent, AiVaultScanIssue, AiVaultSession, AiVaultSessionSubagentInfo,
    AiVaultSubagentRunStatus, SessionCandidate,
};
use super::{accumulator, parser, text};

const MAX_PARENT_BYTES: usize = 32 * 1024 * 1024;
const RUNNING_RECENCY_MS: i64 = 5 * 60 * 1_000;

pub(super) async fn count(
    filesystem: &HostFilesystem,
    parent_path: &str,
) -> Result<u64, crate::hosts::HostFilesystemError> {
    let directory = directory(filesystem, parent_path);
    let entries = match filesystem.read_dir(&directory).await {
        Ok(entries) => entries,
        Err(_) => return Ok(0),
    };
    Ok(entries
        .into_iter()
        .filter(|entry| entry.kind == HostFileKind::File && is_transcript(&entry.name))
        .count() as u64)
}

pub(crate) async fn list(
    parent_path: &str,
    host: &dyn ExecutionHost,
    filesystem: &HostFilesystem,
    claude_roots: &[String],
) -> (Vec<AiVaultSession>, Vec<AiVaultScanIssue>) {
    if !safe_parent_path(parent_path, claude_roots).await {
        return (Vec::new(), Vec::new());
    }
    let statuses = task_statuses(filesystem, parent_path).await;
    let parent_id = accumulator::session_id_from_path(parent_path);
    let subagents_directory = directory(filesystem, parent_path);
    let entries = match filesystem.read_dir(&subagents_directory).await {
        Ok(entries) => entries,
        Err(_) => return (Vec::new(), Vec::new()),
    };
    let mut sessions = Vec::new();
    let mut issues = Vec::new();
    for entry in entries
        .into_iter()
        .filter(|entry| entry.kind == HostFileKind::File && is_transcript(&entry.name))
        .take(2_000)
    {
        let path = filesystem
            .paths()
            .join(&[&subagents_directory, &entry.name]);
        let Some(stat) = filesystem.stat(&path).await.ok().flatten() else {
            continue;
        };
        let modified_at_ms = stat.modified_at_ms.unwrap_or(0);
        let candidate = SessionCandidate {
            agent: AiVaultAgent::Claude,
            codex_home: None,
            modified_at: accumulator::timestamp_iso(modified_at_ms).unwrap_or_else(now_iso),
            modified_at_ms,
            path: path.clone(),
            size_bytes: stat.size_bytes,
        };
        match parser::parse(&candidate, filesystem, host, "local").await {
            Ok(Some(mut session)) => {
                let meta = meta(filesystem, &path).await;
                if let Some(description) = meta.description {
                    session.title = description;
                }
                let agent_id = entry
                    .name
                    .strip_prefix("agent-")
                    .and_then(|value| value.strip_suffix(".jsonl"))
                    .unwrap_or("");
                session.subagent = Some(AiVaultSessionSubagentInfo {
                    parent_session_id: parent_id.clone(),
                    agent_type: meta.agent_type,
                    status: status(statuses.get(agent_id).map(String::as_str), modified_at_ms),
                });
                sessions.push(session);
            }
            Ok(None) => {}
            Err(error) => issues.push(AiVaultScanIssue {
                execution_host_id: Some("local".to_owned()),
                agent: AiVaultAgent::Claude,
                path,
                message: error.to_string(),
            }),
        }
    }
    sessions.sort_by_key(|session| Reverse(accumulator::sort_time(session)));
    (sessions, issues)
}

pub(crate) async fn local_claude_roots(filesystem: &HostFilesystem) -> Vec<String> {
    filesystem
        .home_directory()
        .await
        .ok()
        .flatten()
        .map(|home| vec![filesystem.paths().join(&[&home, ".claude", "projects"])])
        .unwrap_or_default()
}

fn directory(filesystem: &HostFilesystem, parent_path: &str) -> String {
    let parent_directory = filesystem.paths().dirname(parent_path);
    let stem = accumulator::session_id_from_path(parent_path);
    filesystem
        .paths()
        .join(&[&parent_directory, &stem, "subagents"])
}

async fn safe_parent_path(parent_path: &str, roots: &[String]) -> bool {
    if !Path::new(parent_path).is_absolute() {
        return false;
    }
    let Ok(parent) = tokio::fs::canonicalize(parent_path).await else {
        return false;
    };
    for root in roots {
        if let Ok(root) = tokio::fs::canonicalize(root).await
            && parent.starts_with(root)
            && parent.is_file()
        {
            return true;
        }
    }
    false
}

async fn task_statuses(filesystem: &HostFilesystem, parent_path: &str) -> HashMap<String, String> {
    let Some(bytes) = filesystem
        .read_prefix(parent_path, MAX_PARENT_BYTES)
        .await
        .ok()
        .flatten()
    else {
        return HashMap::new();
    };
    let content = String::from_utf8_lossy(&bytes);
    let mut statuses = HashMap::new();
    for line in content.lines().filter(|line| {
        line.contains("<task-notification>")
            || (line.contains("\"toolUseResult\"") && line.contains("\"agentId\""))
    }) {
        let Some(record) = text::parse_json_line(line) else {
            continue;
        };
        if line.contains("<task-notification>") {
            let notification = notification_text(&record);
            if notification.trim_start().starts_with("<task-notification>")
                && let (Some(id), Some(status)) =
                    (xml(&notification, "task-id"), xml(&notification, "status"))
            {
                statuses.insert(id, status);
                continue;
            }
        }
        let result = record.get("toolUseResult").and_then(Value::as_object);
        if let (Some(id), Some(status)) = (
            result.and_then(|value| text::string(value.get("agentId"))),
            result.and_then(|value| text::string(value.get("status"))),
        ) {
            statuses.insert(id, status);
        }
    }
    statuses
}

fn notification_text(record: &Value) -> String {
    if let Some(content) = text::string(record.get("content")) {
        return content;
    }
    match record.get("message").and_then(|value| value.get("content")) {
        Some(Value::String(value)) => value.trim().to_owned(),
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(|value| {
                value.as_str().map(str::to_owned).or_else(|| {
                    text::string(value.get("text")).or_else(|| text::string(value.get("content")))
                })
            })
            .collect::<Vec<_>>()
            .join(" "),
        _ => String::new(),
    }
}

fn xml(value: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let (_, rest) = value.split_once(&open)?;
    let (value, _) = rest.split_once(&close)?;
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

async fn meta(filesystem: &HostFilesystem, transcript_path: &str) -> Meta {
    let path = PathBuf::from(transcript_path)
        .with_extension("meta.json")
        .to_string_lossy()
        .into_owned();
    let Some(bytes) = filesystem.read(&path, 64 * 1_024).await.ok().flatten() else {
        return Meta::default();
    };
    let Ok(value) = serde_json::from_slice::<Value>(&bytes) else {
        return Meta::default();
    };
    Meta {
        agent_type: text::string(value.get("agentType")),
        description: value.get("description").and_then(text::title),
    }
}

fn status(reported: Option<&str>, modified_at_ms: i64) -> Option<AiVaultSubagentRunStatus> {
    match reported {
        Some("completed") => Some(AiVaultSubagentRunStatus::Completed),
        Some("failed") => Some(AiVaultSubagentRunStatus::Failed),
        Some("killed" | "stopped") => Some(AiVaultSubagentRunStatus::Stopped),
        _ if now_ms().saturating_sub(modified_at_ms) <= RUNNING_RECENCY_MS => {
            Some(AiVaultSubagentRunStatus::Running)
        }
        _ => None,
    }
}

fn is_transcript(name: &str) -> bool {
    name.starts_with("agent-") && name.to_ascii_lowercase().ends_with(".jsonl")
}
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
        .unwrap_or(0)
}
fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[derive(Default)]
struct Meta {
    agent_type: Option<String>,
    description: Option<String>,
}

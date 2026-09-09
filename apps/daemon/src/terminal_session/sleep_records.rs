use super::model::TerminalLaunchConfig;
use serde_json::{Map, Value, json};

const STALE_AFTER_MS: i64 = 30 * 60 * 1_000;

pub(super) fn checkpoint(
    row: &Value,
    launch: Option<&TerminalLaunchConfig>,
    now: i64,
) -> Option<Value> {
    let agent = row.get("agentType")?.as_str()?;
    let provider = row.get("providerSession")?;
    if !resumable(agent, provider)
        || row.get("interrupted").and_then(Value::as_bool) == Some(true)
        || now.saturating_sub(row.get("receivedAt").and_then(Value::as_i64).unwrap_or(0))
            > STALE_AFTER_MS
    {
        return None;
    }
    let mut record = json!({
        "paneKey": row.get("paneKey")?,
        "tabId": row.get("tabId")?,
        "worktreeId": row.get("worktreeId")?,
        "agent": agent,
        "providerSession": provider,
        "prompt": row.get("prompt").and_then(Value::as_str).unwrap_or_default(),
        "state": if row.get("state").and_then(Value::as_str) == Some("done") { json!("working") } else { row.get("state")?.clone() },
        "capturedAt": now,
        "updatedAt": row.get("receivedAt")?,
        "origin": "live"
    });
    for key in ["terminalTitle", "lastAssistantMessage", "connectionId"] {
        if let Some(value) = row.get(key).filter(|value| !value.is_null()) {
            record[key] = value.clone();
        }
    }
    if let Some(launch) = launch {
        let environment: Map<String, Value> = launch
            .agent_env
            .iter()
            .map(|(name, value)| (name.clone(), Value::String(value.clone())))
            .collect();
        let mut config = json!({"agentArgs": launch.agent_args, "agentEnv": environment});
        if let Some(command) = &launch.agent_command {
            config["agentCommand"] = json!(command);
        }
        if let Some(path) = &launch.omp_resume_file_path {
            config["ompResumeFilePath"] = json!(path);
        }
        record["launchConfig"] = config;
    }
    Some(record)
}

pub(super) fn resumable(agent: &str, provider: &Value) -> bool {
    let key = provider.get("key").and_then(Value::as_str);
    let Some(id) = provider.get("id").and_then(Value::as_str) else {
        return false;
    };
    if id.is_empty()
        || id.starts_with('-')
        || id.encode_utf16().count() > 512
        || id
            .chars()
            .any(|character| character <= '\u{1f}' || character == '\u{7f}')
    {
        return false;
    }
    match agent {
        "antigravity" => key == Some("conversation_id"),
        "pi" => {
            key == Some("session_id")
                && provider
                    .get("transcriptPath")
                    .and_then(Value::as_str)
                    .is_some_and(|path| !path.trim().is_empty())
        }
        "claude" | "codex" | "gemini" | "opencode" | "mimo-code" | "droid" | "grok" | "devin"
        | "omp" => key == Some("session_id"),
        _ => false,
    }
}

use std::collections::HashSet;

use serde_json::{Map, Value};

use super::SettingsError;
use super::agents::is_agent;

pub(crate) const MAX_COMMANDS: usize = 40;
pub(crate) const MAX_ID: usize = 80;
pub(crate) const MAX_LABEL: usize = 80;
pub(crate) const MAX_REPO_ID: usize = 200;
pub(crate) const MAX_TERMINAL_TEXT: usize = 4_000;
pub(crate) const MAX_AGENT_PROMPT: usize = 6_000;

const PROMPT_AGENTS: &[&str] = &[
    "claude",
    "openclaude",
    "codex",
    "opencode",
    "mimo-code",
    "pi",
    "omp",
    "gemini",
    "antigravity",
    "command-code",
    "cursor",
    "droid",
    "hermes",
    "copilot",
    "grok",
];

pub(super) fn normalize(value: Option<&Value>) -> Vec<Value> {
    let Some(values) = value.and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut commands = Vec::new();
    let mut seen = HashSet::new();
    for value in values {
        let Some(input) = value.as_object() else {
            continue;
        };
        let raw_id = input.get("id").and_then(Value::as_str).unwrap_or("").trim();
        if matches!(raw_id, "default-pwd" | "default-git-status") {
            continue;
        }
        let has_label = input.get("label").is_some_and(Value::is_string);
        let has_command = input.get("command").is_some_and(Value::is_string);
        let has_prompt = input.get("prompt").is_some_and(Value::is_string);
        if !has_label && !has_command && !has_prompt {
            continue;
        }
        let is_prompt = input.get("action").and_then(Value::as_str) == Some("agent-prompt");
        let agent = input.get("agent").and_then(Value::as_str);
        if is_prompt && !agent.is_some_and(|agent| PROMPT_AGENTS.contains(&agent)) {
            continue;
        }
        let id_base = if raw_id.is_empty() {
            format!("quick-command-{}", commands.len() + 1)
        } else {
            raw_id.to_owned()
        };
        let mut id = truncate(&id_base, MAX_ID);
        let mut suffix = 2;
        while seen.contains(&id) {
            id = format!("{}-{suffix}", truncate(&id_base, MAX_ID - 4));
            suffix += 1;
        }
        seen.insert(id.clone());
        let label = input
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let mut command = Map::from_iter([
            ("id".to_owned(), Value::String(id)),
            (
                "label".to_owned(),
                Value::String(truncate(label, MAX_LABEL)),
            ),
            ("scope".to_owned(), scope(input.get("scope"))),
        ]);
        if is_prompt {
            command.insert(
                "action".to_owned(),
                Value::String("agent-prompt".to_owned()),
            );
            command.insert(
                "agent".to_owned(),
                Value::String(agent.expect("prompt agent was checked").to_owned()),
            );
            command.insert(
                "prompt".to_owned(),
                Value::String(truncate(
                    input
                        .get("prompt")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .trim_end(),
                    MAX_AGENT_PROMPT,
                )),
            );
        } else {
            command.insert(
                "action".to_owned(),
                Value::String("terminal-command".to_owned()),
            );
            command.insert(
                "command".to_owned(),
                Value::String(truncate(
                    input
                        .get("command")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .trim_end(),
                    MAX_TERMINAL_TEXT,
                )),
            );
            command.insert(
                "appendEnter".to_owned(),
                Value::Bool(input.get("appendEnter").and_then(Value::as_bool) != Some(false)),
            );
        }
        commands.push(Value::Object(command));
        if commands.len() >= MAX_COMMANDS {
            break;
        }
    }
    commands
}

pub(super) fn apply(
    current: &[Value],
    mutation: &Map<String, Value>,
) -> Result<Vec<Value>, SettingsError> {
    let mutation_type = mutation.get("type").and_then(Value::as_str).unwrap_or("");
    if mutation_type == "delete" {
        let id = mutation.get("id").and_then(Value::as_str).unwrap_or("");
        return Ok(current
            .iter()
            .filter(|command| command.get("id").and_then(Value::as_str) != Some(id))
            .cloned()
            .collect());
    }
    let command = mutation.get("command").cloned().unwrap_or(Value::Null);
    let command = normalize(Some(&Value::Array(vec![command])))
        .into_iter()
        .next()
        .ok_or(SettingsError::QuickCommandInvalid)?;
    let id = command
        .get("id")
        .and_then(Value::as_str)
        .expect("normalized command has id");
    let existing = current
        .iter()
        .position(|candidate| candidate.get("id").and_then(Value::as_str) == Some(id));
    if existing.is_none() && current.len() >= MAX_COMMANDS {
        return Err(SettingsError::QuickCommandLimit);
    }
    let mut output = current.to_vec();
    match existing {
        Some(index) => output[index] = command,
        None => output.push(command),
    }
    Ok(output)
}

pub(crate) fn valid_prompt_agent(value: &str) -> bool {
    is_agent(value) && PROMPT_AGENTS.contains(&value)
}

pub(crate) fn utf16_len(value: &str) -> usize {
    value.encode_utf16().count()
}

fn scope(value: Option<&Value>) -> Value {
    let Some(value) = value.and_then(Value::as_object) else {
        return Value::Object(Map::from_iter([(
            "type".to_owned(),
            Value::String("global".to_owned()),
        )]));
    };
    let repo_id = value
        .get("repoId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if value.get("type").and_then(Value::as_str) == Some("repo") && !repo_id.is_empty() {
        Value::Object(Map::from_iter([
            ("type".to_owned(), Value::String("repo".to_owned())),
            (
                "repoId".to_owned(),
                Value::String(truncate(repo_id, MAX_REPO_ID)),
            ),
        ]))
    } else {
        Value::Object(Map::from_iter([(
            "type".to_owned(),
            Value::String("global".to_owned()),
        )]))
    }
}

fn truncate(value: &str, maximum: usize) -> String {
    let mut units = 0;
    value
        .chars()
        .take_while(|character| {
            let width = character.len_utf16();
            if units + width > maximum {
                return false;
            }
            units += width;
            true
        })
        .collect()
}

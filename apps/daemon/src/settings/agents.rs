use std::collections::{BTreeMap, HashSet};

use serde_json::{Map, Value};

pub(super) const TUI_AGENTS: &[&str] = &[
    "claude",
    "openclaude",
    "codex",
    "autohand",
    "opencode",
    "mimo-code",
    "pi",
    "omp",
    "gemini",
    "antigravity",
    "aider",
    "goose",
    "amp",
    "kilo",
    "kiro",
    "crush",
    "aug",
    "cline",
    "codebuff",
    "command-code",
    "continue",
    "cursor",
    "droid",
    "kimi",
    "mistral-vibe",
    "qwen-code",
    "rovo",
    "hermes",
    "openclaw",
    "copilot",
    "grok",
    "devin",
    "ante",
    "trae",
];

const DEFAULT_ARGS: &[(&str, &str)] = &[
    ("aider", "--yes-always"),
    ("amp", "--dangerously-allow-all"),
    ("ante", "--yolo"),
    ("antigravity", "--dangerously-skip-permissions"),
    ("autohand", "--unrestricted"),
    ("claude", "--dangerously-skip-permissions"),
    ("cline", "--auto-approve true"),
    ("codex", "--dangerously-bypass-approvals-and-sandbox"),
    ("command-code", "--yolo"),
    ("continue", "--allow \"*\""),
    ("copilot", "--yolo"),
    ("crush", "--yolo"),
    ("cursor", "--yolo"),
    ("devin", "--permission-mode bypass"),
    ("gemini", "--yolo"),
    ("grok", "--permission-mode bypassPermissions"),
    ("hermes", "--yolo"),
    ("kimi", "--yolo"),
    ("kiro", "--trust-all-tools"),
    ("mistral-vibe", "--agent auto-approve"),
    ("openclaude", "--dangerously-skip-permissions"),
    ("qwen-code", "--approval-mode yolo"),
    ("rovo", "--yolo"),
    ("trae", "--yolo"),
];

pub(super) fn normalize(settings: &mut Map<String, Value>) {
    let command_overrides = string_map(settings.get("agentCmdOverrides"), false);
    let migrated = settings
        .get("agentYoloDefaultsMigrated")
        .and_then(Value::as_bool)
        == Some(true);
    let mut args = string_map(settings.get("agentDefaultArgs"), true);
    let mut env = env_map(settings.get("agentDefaultEnv"));
    if !migrated {
        for (agent, default) in DEFAULT_ARGS {
            args.entry((*agent).to_owned()).or_insert_with(|| {
                if command_overrides.contains_key(*agent) {
                    String::new()
                } else {
                    (*default).to_owned()
                }
            });
        }
        env.entry("goose".to_owned()).or_insert_with(|| {
            if command_overrides.contains_key("goose") {
                Value::Object(Map::new())
            } else {
                Value::Object(Map::from_iter([(
                    "GOOSE_MODE".to_owned(),
                    Value::String("auto".to_owned()),
                )]))
            }
        });
    }
    let disabled = string_list(settings.get("disabledTuiAgents"));
    settings.insert(
        "agentCmdOverrides".to_owned(),
        Value::Object(strings(command_overrides)),
    );
    settings.insert("agentDefaultArgs".to_owned(), Value::Object(strings(args)));
    settings.insert("agentDefaultEnv".to_owned(), Value::Object(env));
    settings.insert("agentYoloDefaultsMigrated".to_owned(), Value::Bool(true));
    settings.insert(
        "disabledTuiAgents".to_owned(),
        Value::Array(disabled.into_iter().map(Value::String).collect()),
    );
}

pub(super) fn string_list(value: Option<&Value>) -> Vec<String> {
    let mut seen = HashSet::new();
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|agent| is_agent(agent) && seen.insert((*agent).to_owned()))
        .map(str::to_owned)
        .collect()
}

pub(super) fn string_map(value: Option<&Value>, sanitize_args: bool) -> BTreeMap<String, String> {
    value
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter_map(|(agent, value)| {
            let value = value.as_str()?;
            is_agent(agent).then(|| {
                let value = if sanitize_args {
                    sanitize_launch_args(agent, value)
                } else {
                    value.to_owned()
                };
                (agent.clone(), value)
            })
        })
        .collect()
}

pub(super) fn env_map(value: Option<&Value>) -> Map<String, Value> {
    value
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter_map(|(agent, value)| {
            if !is_agent(agent) {
                return None;
            }
            let values = value.as_object()?;
            let env = values
                .iter()
                .filter_map(|(name, value)| {
                    let name = name.trim();
                    let value = value.as_str()?;
                    (!name.is_empty()).then(|| (name.to_owned(), Value::String(value.to_owned())))
                })
                .collect();
            Some((agent.clone(), Value::Object(env)))
        })
        .collect()
}

pub(super) fn is_agent(value: &str) -> bool {
    TUI_AGENTS.contains(&value)
}

fn sanitize_launch_args(agent: &str, value: &str) -> String {
    let trimmed = value.trim();
    if !matches!(agent, "opencode" | "kilo") {
        return trimmed.to_owned();
    }
    remove_bounded_arg(trimmed, "--dangerously-skip-permissions")
        .trim()
        .to_owned()
}

fn remove_bounded_arg(value: &str, argument: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut cursor = 0;
    for (start, _) in value.match_indices(argument) {
        let end = start + argument.len();
        let before = value[..start].chars().next_back();
        let after = value[end..].chars().next();
        if before.is_some_and(|character| !character.is_whitespace())
            || after.is_some_and(|character| !character.is_whitespace())
        {
            continue;
        }
        let replacement_start = before.map_or(start, |character| start - character.len_utf8());
        if replacement_start < cursor {
            continue;
        }
        output.push_str(&value[cursor..replacement_start]);
        output.push(' ');
        cursor = end;
    }
    output.push_str(&value[cursor..]);
    output
}

fn strings(values: BTreeMap<String, String>) -> Map<String, Value> {
    values
        .into_iter()
        .map(|(key, value)| (key, Value::String(value)))
        .collect()
}

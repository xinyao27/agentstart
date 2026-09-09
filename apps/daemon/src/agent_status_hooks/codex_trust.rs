use std::fs;
use std::path::Path;

use serde_json::json;
use sha2::{Digest, Sha256};

use super::AgentStatusHooksError;
use super::storage;

pub(super) const EVENTS: &[(&str, &str)] = &[
    ("SessionStart", "session_start"),
    ("UserPromptSubmit", "user_prompt_submit"),
    ("PreToolUse", "pre_tool_use"),
    ("PermissionRequest", "permission_request"),
    ("PostToolUse", "post_tool_use"),
    ("SubagentStart", "subagent_start"),
    ("SubagentStop", "subagent_stop"),
    ("Stop", "stop"),
];

pub(super) fn install(
    toml_path: &Path,
    hooks_path: &Path,
    command: &str,
) -> Result<(), AgentStatusHooksError> {
    let existing = read(toml_path)?;
    let source = trust_source(hooks_path);
    let keys = trust_keys(&source);
    let mut updated = remove_entries(&existing, &keys);
    if cfg!(windows) && !updated.lines().any(|line| line.trim() == "[hooks.state]") {
        if !updated.is_empty() && !updated.ends_with('\n') {
            updated.push('\n');
        }
        updated.push_str("\n[hooks.state]\n");
    }
    for (_, event_label) in EVENTS {
        let hash = trusted_hash(event_label, command);
        for key in keys_for_event(&source, event_label) {
            if !updated.is_empty() && !updated.ends_with("\n\n") {
                if !updated.ends_with('\n') {
                    updated.push('\n');
                }
                updated.push('\n');
            }
            updated.push_str(&format!(
                "[hooks.state.{}]\nenabled = true\ntrusted_hash = \"{hash}\"\n",
                serde_json::to_string(&key)?
            ));
        }
    }
    if updated != existing {
        storage::write_text(toml_path, &updated)?;
    }
    Ok(())
}

pub(super) fn remove(toml_path: &Path, hooks_path: &Path) -> Result<(), AgentStatusHooksError> {
    let existing = read(toml_path)?;
    if existing.is_empty() {
        return Ok(());
    }
    let updated = remove_entries(&existing, &trust_keys(&trust_source(hooks_path)));
    if updated != existing {
        storage::write_text(toml_path, &updated)?;
    }
    Ok(())
}

fn read(path: &Path) -> Result<String, AgentStatusHooksError> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(content
            .strip_prefix('\u{feff}')
            .unwrap_or(&content)
            .to_owned()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.into()),
    }
}

fn trust_source(path: &Path) -> String {
    let resolved = path
        .parent()
        .and_then(|parent| fs::canonicalize(parent).ok())
        .and_then(|parent| path.file_name().map(|name| parent.join(name)))
        .unwrap_or_else(|| path.to_owned());
    resolved.display().to_string()
}

fn trust_keys(source: &str) -> Vec<String> {
    EVENTS
        .iter()
        .flat_map(|(_, label)| keys_for_event(source, label))
        .collect()
}

fn keys_for_event(source: &str, event_label: &str) -> Vec<String> {
    let mut sources = vec![source.to_owned()];
    if cfg!(windows) && source.contains('\\') {
        sources.push(source.replace('\\', "/"));
    }
    sources
        .into_iter()
        .map(|source| format!("{source}:{event_label}:0:0"))
        .collect()
}

fn trusted_hash(event_label: &str, command: &str) -> String {
    let identity = json!({
        "event_name": event_label,
        "hooks": [{
            "async": false,
            "command": command,
            "timeout": 10,
            "type": "command"
        }]
    });
    let bytes = serde_json::to_vec(&identity).unwrap_or_default();
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn remove_entries(content: &str, keys: &[String]) -> String {
    let lines = content.split_inclusive('\n').collect::<Vec<_>>();
    let mut output = String::new();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index].trim_end_matches(['\r', '\n']);
        if header_key(line).is_some_and(|key| keys.iter().any(|candidate| candidate == &key)) {
            index += 1;
            while index < lines.len() && !is_table_header(lines[index]) {
                index += 1;
            }
            continue;
        }
        output.push_str(lines[index]);
        index += 1;
    }
    output
}

fn header_key(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let encoded = trimmed.strip_prefix("[hooks.state.")?.strip_suffix(']')?;
    serde_json::from_str(encoded).ok()
}

fn is_table_header(line: &str) -> bool {
    line.trim_start().starts_with('[')
}

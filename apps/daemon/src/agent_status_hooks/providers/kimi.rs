use std::fs;
use std::path::PathBuf;

use super::{ProviderContext, ProviderResult};
use crate::agent_status_hooks::command::managed_posix_command;
use crate::agent_status_hooks::{scripts, storage};

const SCRIPT_NAME: &str = "kimi-hook.sh";
const BLOCK_START: &str = "# >>> yiru-managed-kimi-hooks (managed by Yiru; do not edit) >>>";
const BLOCK_END: &str = "# <<< yiru-managed-kimi-hooks <<<";
const EVENTS: &[&str] = &[
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "PermissionRequest",
    "Stop",
    "StopFailure",
];

pub(super) fn apply(context: &ProviderContext, enabled: bool) -> ProviderResult {
    let home = std::env::var("KIMI_CODE_HOME")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| context.home_path.join(".kimi-code"));
    let config_path = home.join("config.toml");
    let script_path = context.scripts_path.join(SCRIPT_NAME);
    let current = match fs::read_to_string(&config_path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.into()),
    };
    let without_managed = remove_block(&current);
    let next = if enabled {
        let command = managed_posix_command(&script_path, &[]);
        let block = managed_block(&command);
        storage::write_script(&script_path, &scripts::kimi())?;
        if without_managed.trim_end().is_empty() {
            format!("{block}\n")
        } else {
            format!("{}\n\n{block}\n", without_managed.trim_end())
        }
    } else if without_managed.len() == current.len() {
        current.clone()
    } else if without_managed.trim_end().is_empty() {
        String::new()
    } else {
        format!("{}\n", without_managed.trim_end())
    };
    if next != current {
        storage::write_text(&config_path, &next)?;
    }
    Ok(())
}

fn managed_block(command: &str) -> String {
    let command = toml_string(command);
    let mut lines = vec![BLOCK_START.to_owned()];
    for event in EVENTS {
        lines.extend([
            "[[hooks]]".to_owned(),
            format!("event = \"{event}\""),
            format!("command = {command}"),
            "timeout = 10".to_owned(),
        ]);
    }
    lines.push(BLOCK_END.to_owned());
    lines.join("\n")
}

fn remove_block(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut cursor = 0;
    while let Some(relative_start) = text[cursor..].find(BLOCK_START) {
        let start = cursor + relative_start;
        let mut remove_start = start;
        while remove_start > cursor && text.as_bytes()[remove_start - 1] == b'\n' {
            remove_start -= 1;
        }
        output.push_str(&text[cursor..remove_start]);
        let Some(relative_end) = text[start..].find(BLOCK_END) else {
            cursor = text.len();
            break;
        };
        let marker_end = start + relative_end + BLOCK_END.len();
        cursor = text[marker_end..]
            .find('\n')
            .map(|offset| marker_end + offset)
            .unwrap_or(text.len());
    }
    output.push_str(&text[cursor..]);
    output
}

fn toml_string(value: &str) -> String {
    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t")
    )
}

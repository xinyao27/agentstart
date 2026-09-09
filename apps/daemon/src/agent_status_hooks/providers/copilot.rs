use serde_json::{Value, json};

use super::json_hooks::remove_from_all;
use super::{ProviderContext, ProviderResult};
use crate::agent_status_hooks::command::{ManagedCommandMatcher, managed_command_with_env};
use crate::agent_status_hooks::{config, scripts, storage};

const EVENTS: &[&str] = &[
    "SessionStart",
    "SessionEnd",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "subagentStart",
    "SubagentStop",
    "PreCompact",
    "Stop",
    "ErrorOccurred",
    "PermissionRequest",
    "Notification",
];

pub(super) fn apply(context: &ProviderContext, enabled: bool) -> ProviderResult {
    let home = std::env::var("COPILOT_HOME")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| context.home_path.join(".copilot"));
    let config_path = home.join("hooks").join("yiru.json");
    if !enabled && !config_path.exists() {
        return Ok(());
    }
    let script_name = if cfg!(windows) {
        "copilot-hook.ps1"
    } else {
        "copilot-hook.sh"
    };
    let script_path = context.scripts_path.join(script_name);
    let mut document = config::read(&config_path)?;
    let original = document.clone();
    let current_hooks = config::hooks(&document);
    let matcher = ManagedCommandMatcher::new(script_name);
    let mut next_hooks = remove_from_all(current_hooks.clone(), &matcher);
    if enabled {
        for event in EVENTS {
            let mut definitions = next_hooks
                .get(*event)
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let command = managed_command_with_env(
                &script_path,
                "copilot",
                &[("YIRU_COPILOT_HOOK_EVENT", event)],
            );
            let definition = if cfg!(windows) {
                json!({ "type": "command", "powershell": command, "timeoutSec": 5 })
            } else {
                json!({ "type": "command", "bash": command, "timeoutSec": 5 })
            };
            definitions.push(definition);
            next_hooks.insert((*event).to_owned(), Value::Array(definitions));
        }
        document.insert("version".to_owned(), json!(1));
        document.remove("disableAllHooks");
        storage::write_script(&script_path, &scripts::copilot())?;
    }
    document.insert("hooks".to_owned(), Value::Object(next_hooks));
    if enabled || document != original {
        storage::write_json(&config_path, &document)?;
    }
    Ok(())
}

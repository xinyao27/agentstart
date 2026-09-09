use serde_json::{Map, Value, json};

use super::json_hooks::{NestedEvent, remove_from_all};
use super::{ProviderContext, ProviderResult, script_file};
use crate::agent_status_hooks::command::{ManagedCommandMatcher, managed_command};
use crate::agent_status_hooks::{config, scripts, storage};

const EVENTS: &[NestedEvent] = &[
    NestedEvent {
        name: "SessionStart",
        matcher: None,
    },
    NestedEvent {
        name: "UserPromptSubmit",
        matcher: None,
    },
    NestedEvent {
        name: "Stop",
        matcher: None,
    },
    NestedEvent {
        name: "PostCompaction",
        matcher: None,
    },
    NestedEvent {
        name: "SessionEnd",
        matcher: None,
    },
    NestedEvent {
        name: "PreToolUse",
        matcher: None,
    },
    NestedEvent {
        name: "PostToolUse",
        matcher: None,
    },
    NestedEvent {
        name: "PermissionRequest",
        matcher: None,
    },
];

pub(super) fn apply(context: &ProviderContext, enabled: bool) -> ProviderResult {
    let config_path = devin_config_path(context);
    let script_name = script_file("devin");
    let script_path = context.scripts_path.join(&script_name);
    let mut document = config::read_jsonc(&config_path)?;
    let current_hooks = config::hooks(&document);
    let matcher = ManagedCommandMatcher::new(&script_name);
    let mut next_hooks = remove_from_all(current_hooks.clone(), &matcher);
    if enabled {
        let command = managed_command(&script_path, "devin");
        for event in EVENTS {
            let mut definitions = next_hooks
                .get(event.name)
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let mut definition = Map::new();
            definition.insert(
                "hooks".to_owned(),
                json!([{ "type": "command", "command": command, "timeout": 10 }]),
            );
            definitions.push(Value::Object(definition));
            next_hooks.insert(event.name.to_owned(), Value::Array(definitions));
        }
        storage::write_script(&script_path, &scripts::standard("devin", false))?;
    }
    let changed = next_hooks != current_hooks;
    if changed {
        document.insert("hooks".to_owned(), Value::Object(next_hooks));
    }
    if enabled || changed {
        storage::write_json(&config_path, &document)?;
    }
    Ok(())
}

fn devin_config_path(context: &ProviderContext) -> std::path::PathBuf {
    if cfg!(windows) {
        std::env::var_os("APPDATA")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| context.home_path.join("AppData").join("Roaming"))
            .join("devin")
            .join("config.json")
    } else {
        context
            .home_path
            .join(".config")
            .join("devin")
            .join("config.json")
    }
}

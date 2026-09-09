use serde_json::{Map, Value, json};

use super::{ProviderContext, ProviderResult, script_file};
use crate::agent_status_hooks::command::{ManagedCommandMatcher, managed_command};
use crate::agent_status_hooks::{config, scripts, storage};

const EVENTS: &[&str] = &["BeforeAgent", "AfterAgent", "AfterTool", "BeforeTool"];

pub(super) fn apply(context: &ProviderContext, enabled: bool) -> ProviderResult {
    let config_path = context.home_path.join(".gemini").join("settings.json");
    let script_name = script_file("gemini");
    let script_path = context.scripts_path.join(&script_name);
    let mut document = config::read(&config_path)?;
    let current_hooks = config::hooks(&document);
    let matcher = ManagedCommandMatcher::new(&script_name);
    let mut next_hooks = remove_from_all(current_hooks.clone(), &matcher);
    if enabled {
        let command = managed_command(&script_path, "gemini");
        for event in EVENTS {
            let mut definitions = next_hooks
                .get(*event)
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            definitions.push(json!({
                "hooks": [{ "type": "command", "command": command, "timeout": 10_000 }]
            }));
            next_hooks.insert((*event).to_owned(), Value::Array(definitions));
        }
        storage::write_script(&script_path, &scripts::gemini())?;
    }
    if next_hooks != current_hooks {
        document.insert("hooks".to_owned(), Value::Object(next_hooks));
        storage::write_json(&config_path, &document)?;
    }
    Ok(())
}

fn remove_from_all(
    hooks: Map<String, Value>,
    matcher: &ManagedCommandMatcher,
) -> Map<String, Value> {
    hooks
        .into_iter()
        .filter_map(|(event, definitions)| {
            let Some(definitions) = definitions.as_array() else {
                return Some((event, definitions));
            };
            let cleaned = config::remove_managed(definitions, matcher);
            (!cleaned.is_empty()).then_some((event, Value::Array(cleaned)))
        })
        .collect()
}

use std::path::Path;

use serde_json::{Map, Value, json};

use super::ProviderResult;
use crate::agent_status_hooks::command::ManagedCommandMatcher;
use crate::agent_status_hooks::{config, storage};

pub(super) struct NestedEvent {
    pub(super) name: &'static str,
    pub(super) matcher: Option<&'static str>,
}

pub(super) struct NestedScript<'a> {
    pub(super) path: &'a Path,
    pub(super) name: &'a str,
    pub(super) command: &'a str,
    pub(super) content: &'a str,
}

pub(super) fn apply_nested(
    config_path: &Path,
    script: NestedScript<'_>,
    events: &[NestedEvent],
    enabled: bool,
    write_empty_on_disable: bool,
) -> ProviderResult {
    let mut document = config::read(config_path)?;
    let original = document.clone();
    let current_hooks = config::hooks(&document);
    let matcher = ManagedCommandMatcher::new(script.name);
    let mut next_hooks = remove_from_all(current_hooks.clone(), &matcher);
    if enabled {
        for event in events {
            let mut definitions = next_hooks
                .get(event.name)
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let mut definition = Map::new();
            if let Some(pattern) = event.matcher {
                definition.insert("matcher".to_owned(), Value::String(pattern.to_owned()));
            }
            definition.insert(
                "hooks".to_owned(),
                json!([{ "type": "command", "command": script.command, "timeout": 10 }]),
            );
            definitions.push(Value::Object(definition));
            next_hooks.insert(event.name.to_owned(), Value::Array(definitions));
        }
        storage::write_script(script.path, script.content)?;
    }
    if enabled || next_hooks != current_hooks || write_empty_on_disable {
        document.insert("hooks".to_owned(), Value::Object(next_hooks));
    }
    if enabled || document != original || write_empty_on_disable {
        storage::write_json(config_path, &document)?;
    }
    Ok(())
}

pub(super) fn apply_direct(
    config_path: &Path,
    script_path: &Path,
    script_name: &str,
    command: &str,
    script: &str,
    events: &[&str],
    enabled: bool,
) -> ProviderResult {
    let mut document = config::read(config_path)?;
    let current_hooks = config::hooks(&document);
    let matcher = ManagedCommandMatcher::new(script_name);
    let mut next_hooks = remove_from_all(current_hooks.clone(), &matcher);
    if enabled {
        for event in events {
            let mut definitions = next_hooks
                .get(*event)
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            definitions.push(json!({ "command": command, "timeout": 10 }));
            next_hooks.insert((*event).to_owned(), Value::Array(definitions));
        }
        document.entry("version").or_insert(json!(1));
        storage::write_script(script_path, script)?;
    }
    document.insert("hooks".to_owned(), Value::Object(next_hooks));
    storage::write_json(config_path, &document)
}

pub(super) fn remove_from_all(
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

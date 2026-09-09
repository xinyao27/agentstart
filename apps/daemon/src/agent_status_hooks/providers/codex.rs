use std::path::Path;

use serde_json::{Map, Value, json};

use super::{ProviderContext, ProviderResult, script_file};
use crate::agent_status_hooks::codex_trust::{self, EVENTS};
use crate::agent_status_hooks::command::{ManagedCommandMatcher, managed_command};
use crate::agent_status_hooks::{config, scripts, storage};

pub(super) fn apply(context: &ProviderContext, enabled: bool) -> ProviderResult {
    let runtime_home = context
        .user_data_path
        .join("codex-runtime-home")
        .join("home");
    let config_path = runtime_home.join("hooks.json");
    let toml_path = runtime_home.join("config.toml");
    let script_name = script_file("codex");
    let script_path = context.scripts_path.join(&script_name);
    let matcher = ManagedCommandMatcher::new(&script_name);
    if enabled {
        install(context, &config_path, &toml_path, &script_path, &matcher)
    } else {
        remove(&config_path, &toml_path, &matcher)
    }
}

fn install(
    context: &ProviderContext,
    config_path: &Path,
    toml_path: &Path,
    script_path: &Path,
    matcher: &ManagedCommandMatcher,
) -> ProviderResult {
    let _ = config::read(config_path)?;
    let system_path = context.home_path.join(".codex").join("hooks.json");
    let system = config::read(&system_path).unwrap_or_default();
    let mut hooks = mirrored_user_hooks(&system, matcher);
    let command = managed_command(script_path, "codex");
    for (event, _) in EVENTS {
        let current = hooks
            .get(*event)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut definitions = config::remove_managed(&current, matcher);
        definitions.insert(
            0,
            json!({
                "hooks": [{ "type": "command", "command": command, "timeout": 10 }]
            }),
        );
        hooks.insert((*event).to_owned(), Value::Array(definitions));
    }
    storage::write_script(script_path, &scripts::codex())?;
    storage::write_json(
        config_path,
        &Map::from_iter([("hooks".to_owned(), Value::Object(hooks))]),
    )?;
    codex_trust::install(toml_path, config_path, &command)?;
    if let Err(error) = sweep_system_config(&system_path, matcher) {
        eprintln!("[agent-hooks] failed to clean legacy system Codex hooks: {error}");
    }
    Ok(())
}

fn remove(config_path: &Path, toml_path: &Path, matcher: &ManagedCommandMatcher) -> ProviderResult {
    let existed = config_path.exists();
    let mut document = config::read(config_path)?;
    let current = config::hooks(&document);
    let hooks = remove_from_all(current.clone(), matcher);
    if existed {
        document.clear();
        document.insert("hooks".to_owned(), Value::Object(hooks));
        storage::write_json(config_path, &document)?;
    }
    if let Err(error) = codex_trust::remove(toml_path, config_path) {
        eprintln!("[agent-hooks] failed to remove Codex trust entries: {error}");
    }
    Ok(())
}

fn mirrored_user_hooks(
    system: &Map<String, Value>,
    matcher: &ManagedCommandMatcher,
) -> Map<String, Value> {
    config::hooks(system)
        .into_iter()
        .filter_map(|(event, value)| {
            let definitions = value.as_array()?;
            let cleaned = config::remove_managed(definitions, matcher);
            let cleaned = config::remove_matching(&cleaned, uses_plugin_placeholder);
            let mut unique = Vec::new();
            for definition in cleaned {
                if !unique.contains(&definition) {
                    unique.push(definition);
                }
            }
            (!unique.is_empty()).then_some((event, Value::Array(unique)))
        })
        .collect()
}

fn uses_plugin_placeholder(command: &str) -> bool {
    const PLACEHOLDERS: &[&str] = &[
        "${CLAUDE_PLUGIN_ROOT}",
        "${CLAUDE_PLUGIN_DATA}",
        "${PLUGIN_ROOT}",
        "${PLUGIN_DATA}",
    ];
    PLACEHOLDERS.iter().any(|value| command.contains(value))
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

fn sweep_system_config(path: &Path, matcher: &ManagedCommandMatcher) -> ProviderResult {
    if !path.exists() {
        return Ok(());
    }
    let mut document = config::read(path)?;
    let current = config::hooks(&document);
    let hooks = remove_from_all(current.clone(), matcher);
    if hooks != current {
        document.insert("hooks".to_owned(), Value::Object(hooks));
        storage::write_text(
            path,
            &format!("{}\n", serde_json::to_string_pretty(&document)?),
        )?;
    }
    Ok(())
}

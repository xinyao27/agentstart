use serde_json::{Map, Value, json};

use super::{ProviderContext, ProviderResult, script_file};
use crate::agent_status_hooks::command::ManagedCommandMatcher;
#[cfg(windows)]
use crate::agent_status_hooks::command::managed_command;
#[cfg(not(windows))]
use crate::agent_status_hooks::command::managed_command_with_env;
use crate::agent_status_hooks::{config, scripts, storage};

const BUNDLE: &str = "agentstart-status";
const EVENTS: &[(&str, bool, &str)] = &[
    ("PreInvocation", false, "antigravity-pre-invocation.cmd"),
    ("PostInvocation", false, "antigravity-post-invocation.cmd"),
    ("Stop", false, "antigravity-stop.cmd"),
    ("PostToolUse", true, "antigravity-post-tool-use.cmd"),
];

pub(super) fn apply(context: &ProviderContext, enabled: bool) -> ProviderResult {
    let config_path = context
        .home_path
        .join(".gemini")
        .join("config")
        .join("hooks.json");
    let script_name = script_file("antigravity");
    let script_path = context.scripts_path.join(&script_name);
    let mut document = config::read(&config_path)?;
    let current = document
        .get(BUNDLE)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let matchers = [
        "antigravity-hook.sh",
        "antigravity-hook.cmd",
        "antigravity-pre-invocation.cmd",
        "antigravity-post-invocation.cmd",
        "antigravity-stop.cmd",
        "antigravity-post-tool-use.cmd",
    ]
    .map(ManagedCommandMatcher::new);
    let mut bundle = remove_from_bundle(current.clone(), &matchers);
    if enabled {
        for (event, tool_schema, wrapper_name) in EVENTS {
            let mut definitions = bundle
                .get(*event)
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let command = event_command(context, &script_path, event, wrapper_name);
            let definition = if *tool_schema {
                json!({
                    "matcher": "*",
                    "hooks": [{ "type": "command", "command": command, "timeout": 10 }]
                })
            } else {
                json!({ "type": "command", "command": command, "timeout": 10 })
            };
            definitions.push(definition);
            bundle.insert((*event).to_owned(), Value::Array(definitions));
        }
        storage::write_script(&script_path, &scripts::antigravity())?;
        write_windows_wrappers(context)?;
    }
    if bundle != current {
        if bundle.is_empty() {
            document.remove(BUNDLE);
        } else {
            document.insert(BUNDLE.to_owned(), Value::Object(bundle));
        }
    }
    storage::write_json(&config_path, &document)?;
    Ok(())
}

#[cfg(not(windows))]
fn event_command(
    _context: &ProviderContext,
    script_path: &std::path::Path,
    event: &str,
    _wrapper_name: &str,
) -> String {
    managed_command_with_env(
        script_path,
        "antigravity",
        &[("AGENTSTART_ANTIGRAVITY_EVENT", event)],
    )
}

#[cfg(windows)]
fn event_command(
    context: &ProviderContext,
    _script_path: &std::path::Path,
    _event: &str,
    wrapper_name: &str,
) -> String {
    managed_command(&context.scripts_path.join(wrapper_name), "antigravity")
}

#[cfg(not(windows))]
fn write_windows_wrappers(_context: &ProviderContext) -> ProviderResult {
    Ok(())
}

#[cfg(windows)]
fn write_windows_wrappers(context: &ProviderContext) -> ProviderResult {
    for (event, _, wrapper_name) in EVENTS {
        storage::write_script(
            &context.scripts_path.join(wrapper_name),
            &scripts::antigravity_wrapper(event),
        )?;
    }
    Ok(())
}

fn remove_from_bundle(
    bundle: Map<String, Value>,
    matchers: &[ManagedCommandMatcher],
) -> Map<String, Value> {
    bundle
        .into_iter()
        .filter_map(|(event, value)| {
            let Some(definitions) = value.as_array() else {
                return Some((event, value));
            };
            let cleaned = config::remove_matching(definitions, |command| {
                matchers.iter().any(|matcher| matcher.matches(command))
            });
            (!cleaned.is_empty()).then_some((event, Value::Array(cleaned)))
        })
        .collect()
}

use super::json_hooks::{NestedEvent, NestedScript, apply_nested};
use super::{ProviderContext, ProviderResult, script_file};
use crate::agent_status_hooks::command::managed_command;
use crate::agent_status_hooks::scripts;

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
        name: "StopFailure",
        matcher: None,
    },
    NestedEvent {
        name: "SessionEnd",
        matcher: None,
    },
    NestedEvent {
        name: "PreToolUse",
        matcher: Some(".*"),
    },
    NestedEvent {
        name: "PostToolUse",
        matcher: Some(".*"),
    },
    NestedEvent {
        name: "PostToolUseFailure",
        matcher: Some(".*"),
    },
    NestedEvent {
        name: "Notification",
        matcher: None,
    },
];

pub(super) fn apply(context: &ProviderContext, enabled: bool) -> ProviderResult {
    let grok_home = std::env::var("GROK_HOME")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| context.home_path.join(".grok"));
    let config_path = grok_home.join("hooks").join("agentstart-status.json");
    let script_name = script_file("grok");
    let script_path = context.scripts_path.join(&script_name);
    apply_nested(
        &config_path,
        NestedScript {
            path: &script_path,
            name: &script_name,
            command: &managed_command(&script_path, "grok"),
            content: &scripts::grok(),
        },
        EVENTS,
        enabled,
        true,
    )
}

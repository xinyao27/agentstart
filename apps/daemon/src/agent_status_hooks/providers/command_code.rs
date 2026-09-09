use super::json_hooks::{NestedEvent, NestedScript, apply_nested};
use super::{ProviderContext, ProviderResult, script_file};
use crate::agent_status_hooks::command::managed_command;
use crate::agent_status_hooks::scripts;

const EVENTS: &[NestedEvent] = &[
    NestedEvent {
        name: "PreToolUse",
        matcher: Some(".*"),
    },
    NestedEvent {
        name: "PostToolUse",
        matcher: Some(".*"),
    },
    NestedEvent {
        name: "Stop",
        matcher: None,
    },
];

pub(super) fn apply(context: &ProviderContext, enabled: bool) -> ProviderResult {
    let config_path = context.home_path.join(".commandcode").join("settings.json");
    let script_name = script_file("command-code");
    let script_path = context.scripts_path.join(&script_name);
    apply_nested(
        &config_path,
        NestedScript {
            path: &script_path,
            name: &script_name,
            command: &managed_command(&script_path, "command-code"),
            content: &scripts::command_code(),
        },
        EVENTS,
        enabled,
        true,
    )
}

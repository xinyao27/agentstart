use super::json_hooks::apply_direct;
use super::{ProviderContext, ProviderResult, script_file};
use crate::agent_status_hooks::command::managed_command;
use crate::agent_status_hooks::scripts;

const EVENTS: &[&str] = &[
    "beforeSubmitPrompt",
    "stop",
    "preToolUse",
    "postToolUse",
    "postToolUseFailure",
    "beforeShellExecution",
    "beforeMCPExecution",
    "afterAgentResponse",
];

pub(super) fn apply(context: &ProviderContext, enabled: bool) -> ProviderResult {
    let config_path = context.home_path.join(".cursor").join("hooks.json");
    let script_name = script_file("cursor");
    let script_path = context.scripts_path.join(&script_name);
    apply_direct(
        &config_path,
        &script_path,
        &script_name,
        &managed_command(&script_path, "cursor"),
        &scripts::standard("cursor", false),
        EVENTS,
        enabled,
    )
}

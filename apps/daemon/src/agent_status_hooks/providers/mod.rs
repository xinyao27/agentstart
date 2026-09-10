mod amp;
mod antigravity;
mod claude;
mod codex;
mod command_code;
mod copilot;
mod cursor;
mod devin;
mod droid;
mod gemini;
mod grok;
mod hermes;
mod json_hooks;
mod kimi;
mod openclaude;

use std::path::PathBuf;

use super::AgentStatusHooksError;

pub(super) type ProviderResult = Result<(), AgentStatusHooksError>;

#[derive(Clone)]
pub(super) struct ProviderContext {
    pub(super) home_path: PathBuf,
    pub(super) scripts_path: PathBuf,
    pub(super) user_data_path: PathBuf,
}

impl ProviderContext {
    pub(super) fn new(home_path: PathBuf, user_data_path: PathBuf) -> Self {
        let scripts_path = user_data_path.join("agent-hooks");
        Self {
            home_path,
            scripts_path,
            user_data_path,
        }
    }
}

pub(super) fn apply_claude(context: &ProviderContext, enabled: bool) -> ProviderResult {
    claude::apply(context, enabled)
}

pub(super) fn apply_amp(context: &ProviderContext, enabled: bool) -> ProviderResult {
    amp::apply(context, enabled)
}

pub(super) fn apply_antigravity(context: &ProviderContext, enabled: bool) -> ProviderResult {
    antigravity::apply(context, enabled)
}

pub(super) fn apply_codex(context: &ProviderContext, enabled: bool) -> ProviderResult {
    codex::apply(context, enabled)
}

pub(super) fn apply_gemini(context: &ProviderContext, enabled: bool) -> ProviderResult {
    gemini::apply(context, enabled)
}

pub(super) fn apply_command_code(context: &ProviderContext, enabled: bool) -> ProviderResult {
    command_code::apply(context, enabled)
}

pub(super) fn apply_copilot(context: &ProviderContext, enabled: bool) -> ProviderResult {
    copilot::apply(context, enabled)
}

pub(super) fn apply_cursor(context: &ProviderContext, enabled: bool) -> ProviderResult {
    cursor::apply(context, enabled)
}

pub(super) fn apply_devin(context: &ProviderContext, enabled: bool) -> ProviderResult {
    devin::apply(context, enabled)
}

pub(super) fn apply_droid(context: &ProviderContext, enabled: bool) -> ProviderResult {
    droid::apply(context, enabled)
}

pub(super) fn apply_grok(context: &ProviderContext, enabled: bool) -> ProviderResult {
    grok::apply(context, enabled)
}

pub(super) fn apply_hermes(context: &ProviderContext, enabled: bool) -> ProviderResult {
    hermes::apply(context, enabled)
}

pub(super) fn apply_kimi(context: &ProviderContext, enabled: bool) -> ProviderResult {
    kimi::apply(context, enabled)
}

pub(super) fn apply_openclaude(context: &ProviderContext, enabled: bool) -> ProviderResult {
    openclaude::apply(context, enabled)
}

pub(super) fn script_file(provider: &str) -> String {
    format!(
        "{provider}-hook.{}",
        if cfg!(windows) { "cmd" } else { "sh" }
    )
}

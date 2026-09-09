mod codex_trust;
mod command;
mod config;
mod providers;
mod scripts;
mod storage;

use std::path::Path;
use std::sync::Arc;

use thiserror::Error;
use tokio::sync::Mutex;

use providers::{
    ProviderContext, apply_amp, apply_antigravity, apply_claude, apply_codex, apply_command_code,
    apply_copilot, apply_cursor, apply_devin, apply_droid, apply_gemini, apply_grok, apply_hermes,
    apply_kimi, apply_openclaude,
};

#[derive(Clone)]
pub(crate) struct AgentStatusHooksAuthority {
    inner: Arc<AuthorityInner>,
}

struct AuthorityInner {
    context: Option<ProviderContext>,
    update_gate: Mutex<()>,
}

#[derive(Debug, Error)]
pub(crate) enum AgentStatusHooksError {
    #[error("agent status hook I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("agent status hook JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("agent status hook random identifier generation failed: {0}")]
    Random(#[from] getrandom::Error),
}

impl AgentStatusHooksAuthority {
    pub(crate) fn local(user_data_path: &Path) -> Self {
        Self {
            inner: Arc::new(AuthorityInner {
                context: crate::paths::resolve_local_home_path()
                    .map(|home| ProviderContext::new(home, user_data_path.to_owned())),
                update_gate: Mutex::new(()),
            }),
        }
    }

    // Why: global settings belong to this runtime host. WSL and SSH configs
    // are reconciled by their launch/remote installers against their own homes.
    pub(crate) async fn apply_local(&self, enabled: bool) {
        let _guard = self.inner.update_gate.lock().await;
        let Some(context) = self.inner.context.clone() else {
            eprintln!("[agent-hooks] local home directory is unavailable");
            return;
        };
        if let Err(error) = tokio::task::spawn_blocking(move || apply(&context, enabled)).await {
            eprintln!("[agent-hooks] managed hook worker failed: {error}");
        }
    }
}

pub(crate) fn codex_managed_hook_command(home_path: &Path) -> String {
    let context = providers::ProviderContext::new(home_path.to_owned(), Path::new("").to_owned());
    let script_path = context.scripts_path.join(providers::script_file("codex"));
    command::managed_command(&script_path, "codex")
}

fn apply(context: &ProviderContext, enabled: bool) {
    for (provider, result) in [
        ("claude", apply_claude(context, enabled)),
        ("openclaude", apply_openclaude(context, enabled)),
        ("codex", apply_codex(context, enabled)),
        ("gemini", apply_gemini(context, enabled)),
        ("antigravity", apply_antigravity(context, enabled)),
        ("amp", apply_amp(context, enabled)),
        ("cursor", apply_cursor(context, enabled)),
        ("droid", apply_droid(context, enabled)),
        ("command-code", apply_command_code(context, enabled)),
        ("grok", apply_grok(context, enabled)),
        ("copilot", apply_copilot(context, enabled)),
        ("hermes", apply_hermes(context, enabled)),
        ("devin", apply_devin(context, enabled)),
        ("kimi", apply_kimi(context, enabled)),
    ] {
        if let Err(error) = result {
            eprintln!("[agent-hooks] failed to update {provider} managed hooks: {error}");
        }
    }
}

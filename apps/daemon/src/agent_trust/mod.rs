mod atomic;
mod clock;
mod codex;
mod copilot;
mod toml;
mod toml_scan;
mod toml_syntax;
mod workspace;

use std::path::Path;
use std::sync::Arc;

use thiserror::Error;
use tokio::sync::Mutex;

use crate::hosts::{
    ExecutionHost, HostCommandError, HostFilesystem, HostFilesystemError, LocalHost,
};

#[derive(Debug, Error)]
enum AgentTrustError {
    #[error(transparent)]
    Command(#[from] HostCommandError),
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
    #[error("agent trust home directory is unavailable")]
    HomeUnavailable,
    #[error("agent trust JSON update failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("agent trust configuration is too large")]
    ConfigTooLarge,
    #[error("agent trust local file update failed: {0}")]
    LocalIo(#[from] std::io::Error),
    #[error("agent trust clock failed: {0}")]
    Time(#[from] std::time::SystemTimeError),
    #[error("agent trust temporary path entropy failed: {0}")]
    Entropy(String),
    #[error("agent trust symlink could not be resolved")]
    SymlinkResolution,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AgentTrustPreset {
    Codex,
    Copilot,
    Cursor,
}

pub struct AgentTrustInput {
    pub preset: AgentTrustPreset,
    pub workspace_path: String,
}

#[derive(Clone)]
pub struct AgentTrustService {
    inner: Arc<AgentTrustInner>,
}

struct AgentTrustInner {
    filesystem: HostFilesystem,
    gate: Mutex<()>,
    host: Arc<dyn ExecutionHost>,
    managed_codex_home: String,
}

impl AgentTrustService {
    pub fn local(user_data_path: &Path) -> Self {
        let host: Arc<dyn ExecutionHost> = Arc::new(LocalHost::new());
        let managed_codex_home = user_data_path
            .join("codex-runtime-home")
            .join("home")
            .to_string_lossy()
            .into_owned();
        Self::new(host, managed_codex_home)
    }

    pub fn new(host: Arc<dyn ExecutionHost>, managed_codex_home: String) -> Self {
        Self {
            inner: Arc::new(AgentTrustInner {
                filesystem: HostFilesystem::new(host.clone()),
                gate: Mutex::new(()),
                host,
                managed_codex_home,
            }),
        }
    }

    pub async fn mark_trusted(&self, input: AgentTrustInput) {
        // Why: Copilot and Codex store many workspaces in one file. Serialize the complete
        // read-modify-replace cycle so simultaneous RPC calls cannot discard one another.
        let _guard = self.inner.gate.lock().await;
        let result = match input.preset {
            AgentTrustPreset::Codex => {
                codex::mark_trusted(
                    &self.inner.filesystem,
                    self.inner.host.as_ref(),
                    &self.inner.managed_codex_home,
                    &input.workspace_path,
                )
                .await
            }
            AgentTrustPreset::Copilot => {
                copilot::mark_trusted(
                    &self.inner.filesystem,
                    self.inner.host.as_ref(),
                    &input.workspace_path,
                )
                .await
            }
            AgentTrustPreset::Cursor => {
                workspace::mark_cursor_trusted(
                    &self.inner.filesystem,
                    self.inner.host.as_ref(),
                    &input.workspace_path,
                )
                .await
            }
        };
        // Why: this is an ergonomic preflight. The agent's own trust prompt remains the safe
        // fallback when its user-owned configuration is malformed or cannot be written.
        drop(result);
    }
}

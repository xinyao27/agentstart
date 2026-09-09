use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::sync::{Mutex, MutexGuard};

use thiserror::Error;

use crate::agent_arguments::{Shell, quote, tokenize};
use crate::agent_trust::{AgentTrustInput, AgentTrustPreset, AgentTrustService};
use crate::hosts::{ExecutionHost, HostFilesystem, HostKind};
use crate::settings::SettingsAuthority;
use crate::terminal_session::{
    TerminalCreateRequest, TerminalLaunchConfig, TerminalPresentation, TerminalSessionAuthority,
    TerminalSessionError, TerminalStartupCommandDelivery,
};

const REMOTE_TRUST_CACHE_ENTRIES: usize = 16;

#[derive(Debug, Error)]
pub(super) enum AgentLaunchError {
    #[error("Selected agent is disabled. Choose an enabled agent before creating.")]
    Disabled,
    #[error("Could not build launch command for codex.")]
    InvalidCommand,
    #[error(transparent)]
    Terminal(Box<TerminalSessionError>),
}

pub(super) struct AgentLauncher<'a> {
    pub(super) settings: &'a SettingsAuthority,
    pub(super) terminals: &'a TerminalSessionAuthority,
    pub(super) trust: &'a AgentTrustRegistry,
}

#[derive(Clone)]
pub(super) struct AgentTrustRegistry {
    local: AgentTrustService,
    remote: Arc<Mutex<RemoteTrustState>>,
}

struct CachedTrust {
    host: Arc<dyn ExecutionHost>,
    service: AgentTrustService,
}

#[derive(Default)]
struct RemoteTrustState {
    entries: HashMap<String, CachedTrust>,
    order: VecDeque<String>,
}

impl AgentTrustRegistry {
    pub(super) fn new(local: AgentTrustService) -> Self {
        Self {
            local,
            remote: Arc::new(Mutex::new(RemoteTrustState::default())),
        }
    }

    async fn mark_trusted(&self, host: Arc<dyn ExecutionHost>, worktree_path: &str) {
        let service = if host.kind() == HostKind::Local {
            self.local.clone()
        } else {
            let Some(service) = self.remote_service(host).await else {
                return;
            };
            service
        };
        service
            .mark_trusted(AgentTrustInput {
                preset: AgentTrustPreset::Codex,
                workspace_path: worktree_path.to_owned(),
            })
            .await;
    }

    async fn remote_service(&self, host: Arc<dyn ExecutionHost>) -> Option<AgentTrustService> {
        if let Some(service) = self.cached(host.as_ref(), &host) {
            return Some(service);
        }
        let filesystem = HostFilesystem::new(host.clone());
        let home = filesystem.home_directory().await.ok().flatten()?;
        let managed_home = filesystem.paths().join(&[
            &home,
            ".local",
            "share",
            "yiru",
            "codex-runtime-home",
            "home",
        ]);
        let candidate = AgentTrustService::new(host.clone(), managed_home);
        let host_id = host.id().to_owned();
        let mut remote = lock(&self.remote);
        match remote.entries.get(&host_id) {
            Some(cached) if Arc::ptr_eq(&cached.host, &host) => Some(cached.service.clone()),
            Some(_) | None => {
                remote.entries.insert(
                    host_id.clone(),
                    CachedTrust {
                        host,
                        service: candidate.clone(),
                    },
                );
                touch_remote(&mut remote, &host_id);
                Some(candidate)
            }
        }
    }

    fn cached(
        &self,
        host: &dyn ExecutionHost,
        identity: &Arc<dyn ExecutionHost>,
    ) -> Option<AgentTrustService> {
        let mut remote = lock(&self.remote);
        let service = remote
            .entries
            .get(host.id())
            .filter(|cached| Arc::ptr_eq(&cached.host, identity))
            .map(|cached| cached.service.clone());
        if service.is_some() {
            touch_remote(&mut remote, host.id());
        }
        service
    }
}

fn touch_remote(state: &mut RemoteTrustState, host_id: &str) {
    state.order.retain(|candidate| candidate != host_id);
    state.order.push_back(host_id.to_owned());
    while state.entries.len() > REMOTE_TRUST_CACHE_ENTRIES {
        let Some(oldest) = state.order.pop_front() else {
            break;
        };
        state.entries.remove(&oldest);
    }
}

impl AgentLauncher<'_> {
    pub(super) async fn launch(
        &self,
        host: Arc<dyn ExecutionHost>,
        worktree_id: &str,
        worktree_path: &str,
        prompt: &str,
    ) -> Result<String, AgentLaunchError> {
        let settings = self.settings.agent_launch_settings("codex");
        if settings.disabled {
            return Err(AgentLaunchError::Disabled);
        }
        let shell = Shell::for_host(host.as_ref(), settings.terminal_windows_shell.as_deref());
        let agent_command = settings
            .command_override
            .unwrap_or_else(|| "codex".to_owned());
        let args = tokenize(&settings.args, shell).ok_or(AgentLaunchError::InvalidCommand)?;
        let mut command = agent_command.clone();
        for argument in args {
            command.push(' ');
            command.push_str(&quote(&argument, shell));
        }
        let resumable_command = command.clone();
        command.push(' ');
        command.push_str(&quote(prompt.trim(), shell));
        self.trust.mark_trusted(host, worktree_path).await;
        let result = self
            .terminals
            .create(TerminalCreateRequest {
                activate: false,
                cols: 120,
                command: Some(command),
                cwd: None,
                cwd_fallback: false,
                env: settings.environment.clone(),
                env_to_delete: Vec::new(),
                focus: false,
                launch_agent: Some("codex".to_owned()),
                launch_config: Some(TerminalLaunchConfig {
                    omp_resume_file_path: None,
                    agent_args: settings.args,
                    agent_command: Some(resumable_command),
                    agent_env: settings.environment,
                }),
                launch_token: None,
                leaf_id: None,
                presentation: Some(TerminalPresentation::Visible),
                renderer_backed: false,
                rows: 40,
                split_direction: None,
                split_from_leaf_id: None,
                split_telemetry_source: None,
                startup_command_delivery: Some(TerminalStartupCommandDelivery::ShellReady),
                tab_id: None,
                title: Some("Browser writeback".to_owned()),
                worktree: Some(format!("id:{worktree_id}")),
            })
            .await
            .map_err(|error| AgentLaunchError::Terminal(Box::new(error)))?;
        Ok(result.handle)
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

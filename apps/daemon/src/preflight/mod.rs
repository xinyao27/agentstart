mod agents;
mod model;
mod shell_path;
mod target;

use std::sync::{Arc, Mutex, MutexGuard};

use thiserror::Error;

use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{HostCommandError, HostCommandOutput};

use model::{CliAuthStatus, InstalledStatus, PreflightStatus};
pub(crate) use model::{
    PreflightContext, PreflightRequest, PreflightResponse, ProjectRuntime, RefreshAgentsResult,
    ResolvedRuntime, ShellHydrationFailureReason,
};
use shell_path::ShellPath;
use target::{ProbeTarget, select_target};

#[derive(Clone)]
pub(crate) struct Preflight {
    inner: Arc<PreflightInner>,
}

struct PreflightInner {
    check_cache: Mutex<Option<PreflightStatus>>,
    hosts: HostRegistry,
    shell_path: ShellPath,
}

#[derive(Debug, Error)]
pub(crate) enum PreflightError {
    #[error(transparent)]
    Command(#[from] HostCommandError),
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error("Project runtime requires repair before preflight: {0}")]
    RuntimeRepair(String),
}

impl Preflight {
    pub(crate) fn new(hosts: HostRegistry) -> Self {
        Self {
            inner: Arc::new(PreflightInner {
                check_cache: Mutex::new(None),
                hosts,
                shell_path: ShellPath::new(),
            }),
        }
    }

    pub(crate) async fn execute(
        &self,
        request: PreflightRequest,
    ) -> Result<PreflightResponse, PreflightError> {
        match request {
            PreflightRequest::Check { context, force } => Ok(PreflightResponse::Status(
                self.check(&context, force).await?,
            )),
            PreflightRequest::DetectAgents(context) => Ok(PreflightResponse::Agents(
                self.detect_agents(&context, false).await?.0,
            )),
            PreflightRequest::DetectRemoteAgents => Ok(PreflightResponse::Agents(Vec::new())),
            PreflightRequest::RefreshAgents(context) => Ok(PreflightResponse::Refresh(
                self.refresh_agents(&context).await?,
            )),
        }
    }

    async fn check(
        &self,
        context: &PreflightContext,
        force: bool,
    ) -> Result<PreflightStatus, PreflightError> {
        let host = self.inner.hosts.execution_host("local").await?;
        self.inner
            .shell_path
            .refresh_windows_path(host.clone())
            .await;
        let target = select_target(host, context)?;
        if !target.is_wsl()
            && !force
            && let Some(status) = lock(&self.inner.check_cache).clone()
        {
            return Ok(status);
        }
        let path = self.inner.shell_path.effective();
        let (git, gh) = tokio::join!(
            is_available(target.clone(), "git", &path),
            is_available(target.clone(), "gh", &path)
        );
        let gh_auth = cli_auth(target.clone(), "gh", gh, &path);
        let gh_authenticated = gh_auth.await;
        let result = PreflightStatus {
            git: InstalledStatus { installed: git },
            gh: CliAuthStatus {
                installed: gh,
                authenticated: gh_authenticated,
            },
        };
        if !target.is_wsl() {
            *lock(&self.inner.check_cache) = Some(result.clone());
        }
        Ok(result)
    }

    async fn detect_agents(
        &self,
        context: &PreflightContext,
        force_hydration: bool,
    ) -> Result<(Vec<String>, Option<model::ShellHydration>), PreflightError> {
        let host = self.inner.hosts.execution_host("local").await?;
        self.inner
            .shell_path
            .refresh_windows_path(host.clone())
            .await;
        let target = select_target(host.clone(), context)?;
        let hydration = if target.is_wsl() {
            None
        } else {
            let hydration = self.inner.shell_path.hydrate(host, force_hydration).await;
            if hydration.is_ok() {
                self.inner
                    .shell_path
                    .merge(&hydration.segments, target.platform());
            }
            Some(hydration)
        };
        let path = self.inner.shell_path.effective();
        Ok((agents::detect(&target, &path).await, hydration))
    }

    async fn refresh_agents(
        &self,
        context: &PreflightContext,
    ) -> Result<RefreshAgentsResult, PreflightError> {
        let host = self.inner.hosts.execution_host("local").await?;
        self.inner
            .shell_path
            .refresh_windows_path(host.clone())
            .await;
        let target = select_target(host, context)?;
        if target.is_wsl() {
            let path = self.inner.shell_path.effective();
            return Ok(RefreshAgentsResult {
                agents: agents::detect(&target, &path).await,
                added_path_segments: Vec::new(),
                shell_hydration_ok: true,
                path_source: "sync_seed_only",
                path_failure_reason: ShellHydrationFailureReason::None,
            });
        }
        let before = self.inner.shell_path.effective();
        let (agents, hydration) = self.detect_agents(context, true).await?;
        let hydration = hydration.expect("non-WSL detection always hydrates");
        let added_path_segments = if hydration.is_ok() {
            added_segments(&before, &hydration.segments, target.platform())
        } else {
            Vec::new()
        };
        Ok(RefreshAgentsResult {
            agents,
            added_path_segments,
            shell_hydration_ok: hydration.is_ok(),
            path_source: if hydration.is_ok() {
                "shell_hydrate"
            } else {
                "sync_seed_only"
            },
            path_failure_reason: hydration.failure_reason,
        })
    }
}

async fn is_available(target: ProbeTarget, command: &str, path: &str) -> bool {
    successful(target.command(command, &["--version"], Some(path)).await)
}

async fn cli_auth(target: ProbeTarget, command: &str, installed: bool, path: &str) -> bool {
    if !installed {
        return false;
    }
    let output = target
        .command(command, &["auth", "status"], Some(path))
        .await;
    match output {
        Ok(output) if output.exit_code == 0 => true,
        Ok(output) if command == "gh" => {
            auth_marker(&output, &["Logged in", "Active account: true"])
        }
        Ok(output) => auth_marker(&output, &["Logged in"]),
        Err(_) => false,
    }
}

fn auth_marker(output: &HostCommandOutput, markers: &[&str]) -> bool {
    markers
        .iter()
        .any(|marker| output.stdout.contains(marker) || output.stderr.contains(marker))
}

fn successful(output: Result<HostCommandOutput, PreflightError>) -> bool {
    output.is_ok_and(|output| output.exit_code == 0)
}

fn added_segments(
    before: &str,
    segments: &[String],
    platform: crate::hosts::HostPlatform,
) -> Vec<String> {
    let separator = if platform == crate::hosts::HostPlatform::Windows {
        ';'
    } else {
        ':'
    };
    let existing: std::collections::HashSet<&str> = before.split(separator).collect();
    segments
        .iter()
        .filter(|segment| !existing.contains(segment.as_str()))
        .cloned()
        .collect()
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

use std::collections::BTreeSet;

use serde_json::Value;

use crate::account_usage::{CodexRuntimeTarget, PreparedCodexHome};
use crate::hosts::HostKind;
use crate::hosts::HostPlatform;

use super::model::{
    TerminalAgentStartup, TerminalAgentState, TerminalHeadlessBinding, TerminalLaunchConfig,
    TerminalListResult, TerminalManagementSession, TerminalMobileBinding,
    TerminalProcessInspection, TerminalReadResult, TerminalResolvePane, TerminalShow,
    TerminalStartupCommandDelivery, TerminalSummary,
};
use super::{TerminalFileContext, identity, scope, visual_layout};
use super::{TerminalSessionAuthority, TerminalSessionError};

impl TerminalSessionAuthority {
    pub(crate) async fn agent_startup(
        &self,
        selector: &str,
        agent: &str,
        prompt: Option<&str>,
    ) -> Result<TerminalAgentStartup, TerminalSessionError> {
        self.agent_startup_with_executable(selector, agent, prompt, None)
            .await
    }

    pub(crate) async fn agent_startup_with_executable(
        &self,
        selector: &str,
        agent: &str,
        prompt: Option<&str>,
        executable: Option<&str>,
    ) -> Result<TerminalAgentStartup, TerminalSessionError> {
        let scope = scope::resolve(selector, &self.worktrees, &self.hosts).await?;
        let mut settings = self.settings.agent_launch_settings(agent);
        if settings.disabled {
            return Err(TerminalSessionError::InvalidInput(
                "selected agent is disabled",
            ));
        }
        if agent == "codex" {
            let home = self
                .codex_runtime
                .prepare_for_launch(codex_target(scope.host.kind(), scope.host.target()))
                .await
                .map_err(|error| TerminalSessionError::LaunchPreparation(error.to_string()))?;
            apply_codex_home(&mut settings.environment, home.as_ref());
        }
        let base = settings
            .command_override
            .or_else(|| executable.map(str::to_owned))
            .unwrap_or_else(|| agent_command(agent).to_owned());
        let command_without_prompt = if settings.args.trim().is_empty() {
            base
        } else {
            format!("{base} {}", settings.args.trim())
        };
        let prompt = prompt.map(str::trim).filter(|value| !value.is_empty());
        let command = match (prompt, agent_prompt_mode(agent)) {
            (None, _) => command_without_prompt.clone(),
            (Some(prompt), AgentPromptMode::Argv { separator }) => format!(
                "{command_without_prompt}{} {}",
                separator.map_or("", |separator| separator),
                quote_agent_prompt(prompt, scope.host.platform())
            ),
            (Some(prompt), AgentPromptMode::Flag(flag)) => format!(
                "{command_without_prompt} {flag} {}",
                quote_agent_prompt(prompt, scope.host.platform())
            ),
            (Some(_), AgentPromptMode::Followup) => {
                return Err(TerminalSessionError::InvalidInput(
                    "agent does not support startup prompt quick commands",
                ));
            }
        };
        Ok(TerminalAgentStartup {
            command,
            environment: settings.environment.clone(),
            launch_config: TerminalLaunchConfig {
                omp_resume_file_path: None,
                agent_args: settings.args,
                agent_command: Some(command_without_prompt),
                agent_env: settings.environment,
            },
            startup_command_delivery: (agent == "codex" && prompt.is_some())
                .then_some(TerminalStartupCommandDelivery::ShellReady),
        })
    }

    pub(crate) fn subscribe_changes(&self) -> tokio::sync::watch::Receiver<u64> {
        self.revision.subscribe()
    }

    pub(crate) fn current_revision(&self) -> u64 {
        *self.revision.borrow()
    }

    pub(crate) fn mobile_binding(
        &self,
        pty_id: &str,
        worktree_id: &str,
    ) -> Option<TerminalMobileBinding> {
        self.state.mobile_binding(pty_id, worktree_id)
    }

    pub(crate) fn headless_bindings(&self) -> Vec<TerminalHeadlessBinding> {
        self.state.headless_bindings()
    }

    pub(crate) fn handle_for_pty(&self, pty_id: &str) -> Option<String> {
        self.state.handle_for_pty(pty_id)
    }

    pub(crate) fn terminal_drivers(&self) -> Vec<super::TerminalDriverSnapshot> {
        self.state.terminal_drivers()
    }

    pub(crate) fn terminal_fit_overrides(&self) -> Vec<super::TerminalFitOverrideSnapshot> {
        self.state.terminal_fit_overrides()
    }

    pub(crate) async fn inspect_process(&self, handle: &str) -> TerminalProcessInspection {
        let terminal = self.state.with(handle, |record| {
            (
                record.process_exit_code.is_none(),
                record.host_id.clone(),
                record.control.clone(),
            )
        });
        let Some((true, host_id, control)) = terminal else {
            return TerminalProcessInspection {
                foreground_process: None,
                has_child_processes: false,
            };
        };
        if let Some(host_id) = host_id {
            return TerminalProcessInspection {
                foreground_process: Some(host_id),
                has_child_processes: true,
            };
        }
        let Some(control) = control else {
            return TerminalProcessInspection {
                foreground_process: None,
                has_child_processes: false,
            };
        };
        control
            .inspect()
            .await
            .unwrap_or(TerminalProcessInspection {
                foreground_process: None,
                has_child_processes: false,
            })
    }

    pub(crate) fn get_auto_restore_fit_ms(&self) -> Option<f64> {
        self.settings.mobile_auto_restore_fit_ms()
    }

    pub(crate) async fn set_auto_restore_fit_ms(
        &self,
        milliseconds: Option<f64>,
    ) -> Result<Option<f64>, TerminalSessionError> {
        let milliseconds = self
            .settings
            .set_mobile_auto_restore_fit_ms(milliseconds)
            .await?;
        if milliseconds.is_none() {
            self.auto_restore_fit.cancel_all();
        }
        Ok(milliseconds)
    }

    pub(crate) fn resolve_file_context(&self, handle: &str) -> Option<TerminalFileContext> {
        self.state
            .with(handle, |record| {
                record
                    .process_exit_code
                    .is_none()
                    .then(|| TerminalFileContext {
                        cwd: record.cwd.clone(),
                        host_id: record.host_id.clone().unwrap_or_else(|| "local".to_owned()),
                        worktree_id: record.worktree_id.clone(),
                    })
            })
            .flatten()
    }

    pub(crate) fn has_recent_output_path(
        &self,
        handle: &str,
        path_text_or_absolute: &str,
        canonical: &str,
    ) -> bool {
        self.state
            .with(handle, |record| {
                record.process_exit_code.is_none()
                    && record
                        .path_provenance
                        .has_recent_output_path(path_text_or_absolute, canonical)
            })
            .unwrap_or(false)
    }

    pub(crate) async fn list(
        &self,
        worktree: Option<&str>,
        limit: usize,
        require_fresh_pty_liveness: bool,
    ) -> Result<TerminalListResult, TerminalSessionError> {
        let worktree = match worktree {
            Some(selector) => {
                let scope = scope::resolve(selector, &self.worktrees, &self.hosts).await?;
                Some((scope.worktree_id, scope.host_id))
            }
            None => None,
        };
        let mut records = self
            .state
            .summaries()
            .into_iter()
            .filter(|(summary, record_host)| {
                worktree.as_ref().is_none_or(|(worktree_id, host_id)| {
                    summary.worktree_id == *worktree_id && record_host == host_id
                })
            })
            .filter(|(summary, _)| {
                !require_fresh_pty_liveness
                    || self
                        .state
                        .with(&summary.handle, |record| {
                            record
                                .control
                                .as_ref()
                                .is_some_and(|control| control.is_live())
                        })
                        .unwrap_or(false)
            })
            .collect::<Vec<_>>();
        records.sort_unstable_by(|(left, _), (right, _)| left.handle.cmp(&right.handle));
        let total_count = records.len();
        records.truncate(limit);
        let hosts = records
            .iter()
            .map(|(_, host)| host.clone())
            .collect::<BTreeSet<_>>();
        let mut sessions = Vec::with_capacity(hosts.len());
        for host in hosts {
            sessions.push((
                host.clone(),
                self.workspace_session.get(host.as_deref()).await?,
            ));
        }
        let terminals = records
            .iter()
            .map(|(summary, _)| summary.clone())
            .collect::<Vec<_>>();
        let visual_layouts = visual_layout::build(&records, &sessions);
        Ok(TerminalListResult {
            truncated: total_count > terminals.len(),
            terminals,
            total_count,
            visual_layouts,
        })
    }

    pub(crate) async fn read(
        &self,
        handle: &str,
        cursor: Option<u64>,
        limit: Option<usize>,
    ) -> Result<TerminalReadResult, TerminalSessionError> {
        let (provider, status) = self
            .state
            .with(handle, |record| {
                (
                    record.snapshot_provider.clone(),
                    if record.process_exit_code.is_some() {
                        "exited"
                    } else {
                        "running"
                    },
                )
            })
            .ok_or(TerminalSessionError::NotFound)?;
        provider
            .read(handle.to_owned(), status, cursor, limit)
            .await
            .ok_or(TerminalSessionError::NotFound)
    }

    pub(crate) fn show(&self, handle: &str) -> Result<TerminalShow, TerminalSessionError> {
        self.state
            .with(handle, |record| TerminalShow {
                summary: record.summary(),
                pane_runtime_id: -1,
                renderer_graph_epoch: 0,
                transport_generation: record.transport_generation.clone(),
            })
            .ok_or(TerminalSessionError::NotFound)
    }

    pub(crate) fn agent_status(
        &self,
        handle: &str,
    ) -> Result<TerminalAgentState, TerminalSessionError> {
        self.state
            .with(handle, |record| TerminalAgentState {
                handle: handle.to_owned(),
                is_running_agent: record.has_agent && record.process_exit_code.is_none(),
                status: match record.agent_status {
                    Some(super::terminal_title::AgentStatus::Working) => Some("working"),
                    Some(super::terminal_title::AgentStatus::Permission) => Some("permission"),
                    Some(super::terminal_title::AgentStatus::Idle) => Some("idle"),
                    None => None,
                },
            })
            .ok_or(TerminalSessionError::NotFound)
    }

    pub(crate) fn agent_status_snapshot(&self) -> Vec<super::model::TerminalAgentStatusSnapshot> {
        self.state
            .summaries()
            .into_iter()
            .filter_map(|(summary, _connection_id)| {
                let (has_agent, status, created_at, is_running_agent, process_exited, agent_type) =
                    self.state.with(&summary.handle, |record| {
                        (
                            record.has_agent,
                            match record.agent_status {
                                Some(super::terminal_title::AgentStatus::Working) => {
                                    Some("working")
                                }
                                Some(super::terminal_title::AgentStatus::Permission) => {
                                    Some("permission")
                                }
                                Some(super::terminal_title::AgentStatus::Idle) => Some("idle"),
                                None => None,
                            },
                            record.created_at,
                            record.has_agent
                                && record.process_exit_code.is_none()
                                && record
                                    .control
                                    .as_ref()
                                    .is_some_and(|control| control.is_live()),
                            record.process_exit_code.is_some(),
                            record.launch_agent.clone(),
                        )
                    })?;
                if !has_agent {
                    return None;
                }
                Some(super::model::TerminalAgentStatusSnapshot {
                    agent_type,
                    created_at,
                    handle: summary.handle.clone(),
                    is_running_agent,
                    process_exited,
                    status,
                    title: summary.title,
                    updated_at: summary.last_output_at.unwrap_or(created_at),
                    worktree_id: summary.worktree_id,
                })
            })
            .collect()
    }

    pub(crate) fn management_sessions(&self) -> Vec<TerminalManagementSession> {
        self.state.management_sessions()
    }

    pub(crate) fn resolve_pane(
        &self,
        pane_key: &str,
    ) -> Result<TerminalResolvePane, TerminalSessionError> {
        let (tab_id, leaf_id) = pane_key
            .split_once(':')
            .filter(|(tab_id, leaf_id)| identity::is_uuid(tab_id) && identity::is_uuid(leaf_id))
            .ok_or(TerminalSessionError::NotFound)?;
        self.state
            .summaries()
            .into_iter()
            .find_map(|(summary, _)| {
                (summary.tab_id == tab_id && summary.leaf_id == leaf_id).then_some(
                    TerminalResolvePane {
                        handle: summary.handle,
                        leaf_id: summary.leaf_id,
                        pty_id: summary.pty_id,
                        tab_id: summary.tab_id,
                    },
                )
            })
            .ok_or(TerminalSessionError::NotFound)
    }

    pub(crate) fn launch_token_for_pane(
        &self,
        pane_key: &str,
    ) -> Result<Option<String>, TerminalSessionError> {
        let pane = self.resolve_pane(pane_key)?;
        self.state
            .with(&pane.handle, |record| record.launch_token.clone())
            .ok_or(TerminalSessionError::NotFound)
    }

    pub(crate) async fn resolve_active(
        &self,
        worktree: Option<&str>,
    ) -> Result<String, TerminalSessionError> {
        let mut records = self.state.summaries();
        records.sort_unstable_by(|(left, _), (right, _)| left.handle.cmp(&right.handle));
        records.retain(|(summary, _)| summary.connected);
        if let Some(selector) = worktree {
            let scope = scope::resolve(selector, &self.worktrees, &self.hosts).await?;
            let host_id = scope.host_id;
            let session = self.workspace_session.get(host_id.as_deref()).await?;
            return active_handle(&records, &session, Some(&scope.worktree_id), &host_id)
                .or_else(|| first_handle(&records, Some(&scope.worktree_id), &host_id))
                .ok_or(TerminalSessionError::InvalidInput("no active terminal"));
        }
        let hosts = records
            .iter()
            .map(|(_, host_id)| host_id.clone())
            .collect::<std::collections::BTreeSet<_>>();
        for host_id in hosts {
            let session = self.workspace_session.get(host_id.as_deref()).await?;
            if let Some(handle) = active_handle(&records, &session, None, &host_id) {
                return Ok(handle);
            }
        }
        records
            .first()
            .map(|(summary, _)| summary.handle.clone())
            .ok_or(TerminalSessionError::InvalidInput("no active terminal"))
    }

    pub(crate) fn identity(
        &self,
        handle: &str,
    ) -> Result<(String, String, String), TerminalSessionError> {
        self.state
            .with(handle, |record| {
                (
                    record.tab_id.clone(),
                    record.worktree_id.clone(),
                    record.transport_generation.clone(),
                )
            })
            .ok_or(TerminalSessionError::NotFound)
    }
}

pub(super) fn codex_target(kind: HostKind, target: Option<&str>) -> CodexRuntimeTarget {
    match kind {
        HostKind::Local => CodexRuntimeTarget::Host,
        HostKind::Ssh => CodexRuntimeTarget::Remote,
        HostKind::Wsl => CodexRuntimeTarget::Wsl {
            distro: target.unwrap_or_default().to_owned(),
        },
    }
}

pub(super) fn apply_codex_home(
    environment: &mut Vec<(String, String)>,
    home: Option<&PreparedCodexHome>,
) {
    let Some(home) = home else {
        return;
    };
    environment.retain(|(name, _)| name != "CODEX_HOME");
    environment.push(("CODEX_HOME".to_owned(), home.launch_path.clone()));
}

enum AgentPromptMode {
    Argv { separator: Option<&'static str> },
    Flag(&'static str),
    Followup,
}

pub(super) fn agent_command(agent: &str) -> &'static str {
    match agent {
        "mimo-code" => "mimo",
        "kiro" => "kiro-cli chat --tui",
        "aug" => "auggie",
        "command-code" => "command-code --trust",
        "continue" => "cn",
        "cursor" => "cursor-agent",
        "mistral-vibe" => "vibe",
        "qwen-code" => "qwen",
        "hermes" => "hermes --tui",
        "trae" => "traecli",
        value => match value {
            "claude" => "claude",
            "openclaude" => "openclaude",
            "codex" => "codex",
            "autohand" => "autohand",
            "ante" => "ante",
            "opencode" => "opencode",
            "pi" => "pi",
            "omp" => "omp",
            "gemini" => "gemini",
            "antigravity" => "agy",
            "aider" => "aider",
            "goose" => "goose",
            "amp" => "amp",
            "kilo" => "kilo",
            "crush" => "crush",
            "cline" => "cline",
            "codebuff" => "codebuff",
            "droid" => "droid",
            "kimi" => "kimi",
            "rovo" => "rovo",
            "openclaw" => "openclaw",
            "copilot" => "copilot",
            "grok" => "grok",
            "devin" => "devin",
            _ => "",
        },
    }
}

fn agent_prompt_mode(agent: &str) -> AgentPromptMode {
    match agent {
        "claude" | "openclaude" | "codex" | "pi" | "omp" | "command-code" | "cursor" | "droid" => {
            AgentPromptMode::Argv { separator: None }
        }
        "trae" | "grok" => AgentPromptMode::Argv {
            separator: Some(" --"),
        },
        "opencode" | "mimo-code" => AgentPromptMode::Flag("--prompt"),
        "gemini" | "antigravity" => AgentPromptMode::Flag("--prompt-interactive"),
        "copilot" => AgentPromptMode::Flag("-i"),
        _ => AgentPromptMode::Followup,
    }
}

fn quote_agent_prompt(prompt: &str, platform: HostPlatform) -> String {
    if platform == HostPlatform::Windows {
        return format!("'{}'", prompt.replace('\'', "''"));
    }
    format!("'{}'", prompt.replace('\'', "'\"'\"'"))
}

fn active_handle(
    records: &[(TerminalSummary, Option<String>)],
    session: &Value,
    requested_worktree: Option<&str>,
    host_id: &Option<String>,
) -> Option<String> {
    let worktree_id = requested_worktree.or_else(|| {
        session
            .get("activeWorktreeId")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
    })?;
    let tab_id = session
        .get("activeTabIdByWorktree")
        .and_then(Value::as_object)
        .and_then(|active| active.get(worktree_id))
        .and_then(Value::as_str)
        .or_else(|| session.get("activeTabId").and_then(Value::as_str));
    let leaf_id = tab_id.and_then(|tab_id| {
        session
            .get("terminalLayoutsByTabId")
            .and_then(Value::as_object)
            .and_then(|layouts| layouts.get(tab_id))
            .and_then(|layout| layout.get("activeLeafId"))
            .and_then(Value::as_str)
    });
    records
        .iter()
        .find(|(summary, record_host)| {
            record_host == host_id
                && summary.worktree_id == worktree_id
                && tab_id.is_none_or(|tab_id| summary.tab_id == tab_id)
                && leaf_id.is_none_or(|leaf_id| summary.leaf_id == leaf_id)
        })
        .map(|(summary, _)| summary.handle.clone())
}

fn first_handle(
    records: &[(TerminalSummary, Option<String>)],
    worktree_id: Option<&str>,
    host_id: &Option<String>,
) -> Option<String> {
    records
        .iter()
        .find(|(summary, record_host)| {
            record_host == host_id
                && worktree_id.is_none_or(|worktree_id| summary.worktree_id == worktree_id)
        })
        .map(|(summary, _)| summary.handle.clone())
}

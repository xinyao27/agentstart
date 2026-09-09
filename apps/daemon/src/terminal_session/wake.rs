use super::model::{TerminalCreateRequest, TerminalLaunchConfig, TerminalPresentation};
use super::{TerminalSessionAuthority, TerminalSessionError, scope, wake_plan};
use crate::agent_arguments::{Shell, quote, tokenize};
use serde_json::Value;

impl TerminalSessionAuthority {
    pub(crate) async fn wake_worktree(
        &self,
        host_id: &str,
        worktree_id: &str,
    ) -> Result<usize, TerminalSessionError> {
        let host_scope = (host_id != "local").then_some(host_id);
        let guard = self.worktree_gate.acquire(host_scope, worktree_id).await;
        let session = self.workspace_session.get(host_scope).await?;
        let panes = wake_plan::panes(&session, worktree_id)?;
        let selector = format!("id:{worktree_id}");
        let scope = scope::resolve(&selector, &self.worktrees, &self.hosts).await?;
        if scope.host_id.as_deref() != host_scope {
            return Err(TerminalSessionError::InvalidInput(
                "worktree owner changed during wake",
            ));
        }
        let mut resumed = 0;
        for pane in panes {
            if let Some(existing) =
                self.state
                    .reattach(host_scope, worktree_id, &pane.tab_id, &pane.leaf_id)
            {
                let receipt = self
                    .state
                    .with(&existing.handle, |terminal| {
                        terminal.restored_checkpoint.clone()
                    })
                    .flatten();
                if let Some(receipt) = receipt {
                    match &pane.record {
                        Some(record) if record == &receipt => {
                            self.consume_restored_checkpoint(host_scope, &existing.handle, receipt)
                                .await?;
                        }
                        None => {
                            self.flush_restored_checkpoint(&existing.handle, &receipt)
                                .await?;
                        }
                        Some(_) => {}
                    }
                }
                continue;
            }
            let mut request = TerminalCreateRequest {
                activate: false,
                cols: 120,
                rows: 30,
                command: None,
                cwd: pane.cwd,
                cwd_fallback: true,
                env: Vec::new(),
                env_to_delete: Vec::new(),
                focus: false,
                launch_agent: None,
                launch_config: None,
                launch_token: None,
                leaf_id: Some(pane.leaf_id.clone()),
                tab_id: Some(pane.tab_id.clone()),
                presentation: Some(TerminalPresentation::Background),
                startup_command_delivery: None,
                renderer_backed: false,
                title: pane.title,
                split_direction: None,
                split_from_leaf_id: None,
                split_telemetry_source: None,
                worktree: Some(selector.clone()),
            };
            if let Some(record) = &pane.record {
                let agent = record.get("agent").and_then(Value::as_str).ok_or(
                    TerminalSessionError::InvalidInput("missing sleeping agent type"),
                )?;
                let settings = self.settings.agent_launch_settings(agent);
                if settings.disabled {
                    return Err(TerminalSessionError::InvalidInput(
                        "selected agent is disabled",
                    ));
                }
                let shell = Shell::for_host(
                    scope.host.as_ref(),
                    settings.terminal_windows_shell.as_deref(),
                );
                let config = record.get("launchConfig");
                let mut launch = match config {
                    Some(config) => launch_config(config)?,
                    None => {
                        self.agent_startup(&selector, agent, None)
                            .await?
                            .launch_config
                    }
                };
                let base = launch
                    .agent_command
                    .as_deref()
                    .filter(|command| !command.trim().is_empty());
                let mut command = if let Some(base) = base {
                    base.to_owned()
                } else {
                    let base = settings
                        .command_override
                        .as_deref()
                        .unwrap_or_else(|| super::query::agent_command(agent));
                    let arguments = tokenize(&launch.agent_args, shell).ok_or(
                        TerminalSessionError::InvalidInput("invalid agent arguments"),
                    )?;
                    std::iter::once(base.to_owned())
                        .chain(arguments.iter().map(|arg| quote(arg, shell)))
                        .collect::<Vec<_>>()
                        .join(" ")
                };
                launch.agent_command = Some(command.clone());
                let provider =
                    record
                        .get("providerSession")
                        .ok_or(TerminalSessionError::InvalidInput(
                            "missing provider session",
                        ))?;
                for argument in wake_plan::resume_arguments(
                    agent,
                    provider,
                    launch.omp_resume_file_path.as_deref(),
                )? {
                    command.push(' ');
                    command.push_str(&quote(&argument, shell));
                }
                request.command = Some(command);
                request.launch_agent = Some(agent.to_owned());
                request.env = launch.agent_env.clone();
                request.launch_config = Some(launch);
            } else if pane.agent.is_some() {
                return Err(TerminalSessionError::InvalidInput(
                    "agent session resume identity is unavailable",
                ));
            }
            let created = self
                .create_while_worktree_locked(request, &guard, pane.buffer)
                .await?;
            if let Some(record) = pane.record {
                self.state.with_mut(&created.handle, |terminal| {
                    terminal.restored_checkpoint = Some(record.clone())
                });
                self.consume_restored_checkpoint(host_scope, &created.handle, record)
                    .await?;
                resumed += 1;
            }
        }
        Ok(resumed)
    }
    async fn consume_restored_checkpoint(
        &self,
        host_scope: Option<&str>,
        handle: &str,
        record: Value,
    ) -> Result<(), TerminalSessionError> {
        let expected = record.clone();
        let pane = record
            .get("paneKey")
            .and_then(Value::as_str)
            .ok_or(TerminalSessionError::InvalidInput(
                "missing sleeping pane identity",
            ))?
            .to_owned();
        self.workspace_session
            .mutate(host_scope, move |session| {
                let Some(records) = session
                    .get_mut("sleepingAgentSessionsByPaneKey")
                    .and_then(Value::as_object_mut)
                else {
                    return ((), false);
                };
                if records.get(&pane) == Some(&expected) {
                    records.remove(&pane);
                    ((), true)
                } else {
                    ((), false)
                }
            })
            .await?;
        self.flush_restored_checkpoint(handle, &record).await
    }

    async fn flush_restored_checkpoint(
        &self,
        handle: &str,
        record: &Value,
    ) -> Result<(), TerminalSessionError> {
        self.workspace_session.flush().await?;
        self.state.with_mut(handle, |terminal| {
            if terminal.restored_checkpoint.as_ref() == Some(record) {
                terminal.restored_checkpoint = None;
            }
        });
        Ok(())
    }
}

fn launch_config(value: &Value) -> Result<TerminalLaunchConfig, TerminalSessionError> {
    let agent_args = value
        .get("agentArgs")
        .and_then(Value::as_str)
        .ok_or(TerminalSessionError::InvalidInput(
            "invalid sleeping agent arguments",
        ))?
        .to_owned();
    let environment = value.get("agentEnv").and_then(Value::as_object).ok_or(
        TerminalSessionError::InvalidInput("invalid sleeping agent environment"),
    )?;
    let agent_env = environment
        .iter()
        .map(|(name, value)| {
            value
                .as_str()
                .map(|value| (name.clone(), value.to_owned()))
                .ok_or(TerminalSessionError::InvalidInput(
                    "invalid sleeping agent environment",
                ))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(TerminalLaunchConfig {
        agent_args,
        agent_env,
        agent_command: value
            .get("agentCommand")
            .and_then(Value::as_str)
            .map(str::to_owned),
        omp_resume_file_path: value
            .get("ompResumeFilePath")
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}

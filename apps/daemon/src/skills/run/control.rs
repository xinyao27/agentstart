use serde_json::Value;
use std::collections::BTreeSet;
use std::sync::Arc;
use tokio::sync::watch;

use crate::hosts::{HostCommand, HostCommandErrorKind, HostFilesystem};

use super::super::run_output;
use super::super::{
    SkillDiscoverRequest, SkillRunFailure, SkillRunOperation, SkillRunStart, SkillRunStartFailure,
    SkillRunStartOutcome, SkillUpdateRun, SkillsAuthority, freshness, now,
};
use super::policy::{canonical_names, canonical_source, cli_args};
use super::state::relay_output;

impl SkillsAuthority {
    // Why: the legacy JSON verbs and the protobuf SkillsService start verbs
    // both route through this one typed entry, so validation, the
    // already-running guard, and the failure-reason mapping cannot drift.
    pub(crate) async fn start_run(&self, start: SkillRunStart) -> SkillRunStartOutcome {
        let SkillRunStart {
            operation: operation_kind,
            names: requested_names,
            source: requested_source,
            scope: requested_scope,
        } = start;
        let operation = match operation_kind {
            SkillRunOperation::Update => "update",
            SkillRunOperation::Install => "install",
            SkillRunOperation::Remove => "remove",
        };
        let scope = requested_scope.map(|scope| scope.to_value());
        let mut run = self.run.lock().await;
        if !matches!(
            *run,
            SkillUpdateRun::Idle | SkillUpdateRun::Success { .. } | SkillUpdateRun::Error { .. }
        ) {
            return SkillRunStartOutcome::failed(SkillRunStartFailure::AlreadyRunning);
        }
        let Some(names) = canonical_names(requested_names, operation == "install") else {
            return SkillRunStartOutcome::failed(SkillRunStartFailure::InvalidNames);
        };
        let source = match (operation, requested_source) {
            ("install", Some(value)) => {
                let Some(value) = canonical_source(&value) else {
                    return SkillRunStartOutcome::failed(SkillRunStartFailure::InvalidSource);
                };
                Some(value)
            }
            ("install", None) => {
                return SkillRunStartOutcome::failed(SkillRunStartFailure::InvalidSource);
            }
            ("update" | "remove", None) => None,
            _ => return SkillRunStartOutcome::failed(SkillRunStartFailure::InvalidSource),
        };
        if let Some(scope) = scope.as_ref()
            && !self.valid_scope(scope).await
        {
            return SkillRunStartOutcome::failed(SkillRunStartFailure::InvalidScope);
        }
        let operation = operation.to_owned();
        let started_at = now();
        let running = SkillUpdateRun::Running {
            operation: operation.clone(),
            names: names.clone(),
            source: source.clone(),
            started_at,
            output: String::new(),
            stopping: None,
        };
        *run = running.clone();
        drop(run);
        let _ = self.events.send(running);
        let (cancel_tx, cancel_rx) = watch::channel(false);
        *self.cancel.lock().await = Some(cancel_tx);
        let authority = self.clone();
        tokio::spawn(async move {
            let Ok(host) = authority.hosts.execution_host("local").await else {
                authority
                    .finish_error(
                        operation,
                        names.clone(),
                        source,
                        String::new(),
                        SkillRunFailure {
                            detail: "local host unavailable".to_owned(),
                            exit_code: None,
                            failed_names: names,
                            kind: "launch-failed",
                        },
                    )
                    .await;
                return;
            };
            let command_name = HostFilesystem::new(host.clone())
                .which("npx")
                .await
                .ok()
                .flatten()
                .unwrap_or_else(|| "npx".to_owned());
            let args = cli_args(&operation, &names, source.as_deref(), scope.as_ref());
            let mut command = HostCommand::new(command_name, args);
            if let Some(path) = scope
                .as_ref()
                .filter(|value| value.get("kind").and_then(Value::as_str) == Some("project"))
                .and_then(|value| value.get("repoPath"))
                .and_then(Value::as_str)
            {
                command.cwd = Some(path.to_owned());
            }
            command.cancel = Some(cancel_rx);
            command.kill_process_tree = true;
            command.retain_stderr = false;
            command.retain_stdout = false;
            command.timeout_ms = Some(15 * 60 * 1_000);
            let output = Arc::new(run_output::SkillRunOutput::new());
            command.output_observer = Some(output.clone());
            let (output_done, output_done_rx) = watch::channel(false);
            let output_relay = tokio::spawn(relay_output(
                authority.clone(),
                output.clone(),
                output.subscribe(),
                output_done_rx,
            ));
            let result = host.exec(command).await;
            let _ = output_done.send(true);
            let _ = output_relay.await;
            let output = output.text();
            if result
                .as_ref()
                .is_err_and(|error| error.kind() == HostCommandErrorKind::Cancelled)
            {
                authority.finish_cancelled().await;
                *authority.cancel.lock().await = None;
                return;
            }
            let failure = match &result {
                Ok(result) if result.exit_code == 0 => None,
                Ok(result) => Some(("command-exited", String::new(), Some(result.exit_code))),
                Err(error) => Some(("launch-failed", error.to_string(), None)),
            };
            let rescanned = authority
                .failed_names(&operation, &names, scope.as_ref())
                .await
                .ok()
                .flatten();
            let failed_names = rescanned
                .clone()
                .unwrap_or_else(|| failure.as_ref().map_or_else(Vec::new, |_| names.clone()));
            if !(rescanned.is_none() && failure.is_some()) && failed_names.is_empty() {
                authority
                    .finish_success(operation, names, source, output)
                    .await;
            } else {
                let (kind, detail, exit_code) =
                    failure.unwrap_or_else(|| ("incomplete", String::new(), None));
                authority
                    .finish_error(
                        operation,
                        names,
                        source,
                        output,
                        SkillRunFailure {
                            detail,
                            exit_code,
                            failed_names,
                            kind,
                        },
                    )
                    .await;
            }
            *authority.cancel.lock().await = None;
        });
        SkillRunStartOutcome::started()
    }

    async fn valid_scope(&self, scope: &Value) -> bool {
        if scope.get("kind").and_then(Value::as_str) == Some("global") {
            return true;
        }
        let Some(path) = scope.get("repoPath").and_then(Value::as_str) else {
            return false;
        };
        self.repositories.list().await.ok().is_some_and(|list| {
            list.repos
                .iter()
                .any(|repo| repo.get("path").and_then(Value::as_str) == Some(path))
        })
    }

    async fn failed_names(
        &self,
        operation: &str,
        names: &[String],
        scope: Option<&Value>,
    ) -> Result<Option<Vec<String>>, String> {
        match operation {
            "update" => {
                let (inventory, locks) = tokio::join!(self.freshness(), freshness::global_locks());
                Ok(Some(freshness::failed_update_names(
                    names,
                    &inventory?,
                    &locks,
                )))
            }
            "install" | "remove"
                if scope
                    .and_then(|value| value.get("kind"))
                    .and_then(Value::as_str)
                    == Some("global")
                    && !names.is_empty() =>
            {
                let discovered = self.discover_for(SkillDiscoverRequest::default()).await?;
                let installed = discovered
                    .get("skills")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter(|skill| skill.get("sourceKind").and_then(Value::as_str) == Some("home"))
                    .filter_map(|skill| skill.get("folderName").and_then(Value::as_str))
                    .map(str::to_lowercase)
                    .collect::<BTreeSet<_>>();
                Ok(Some(
                    names
                        .iter()
                        .filter(|name| {
                            let present = installed.contains(&name.to_lowercase());
                            if operation == "install" {
                                !present
                            } else {
                                present
                            }
                        })
                        .cloned()
                        .collect(),
                ))
            }
            "install" | "remove" => Ok(None),
            _ => Err("invalid_skill_operation".to_owned()),
        }
    }
}

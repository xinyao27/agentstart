mod agent;
mod context;
mod prompt;
mod text;

use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use serde_json::{Map, Value, json};
use tokio::sync::watch;

use crate::hosts::{HostCommand, HostCommandErrorKind};

use super::scope::{GitAuthority, GitAuthorityError, GitScope, lock};

type CancelMap = HashMap<String, (u64, watch::Sender<bool>)>;

const GENERATION_TIMEOUT_MS: u64 = 60_000;
const MAX_AGENT_OUTPUT_BYTES: usize = 4 * 1_024 * 1_024;

#[derive(Clone)]
pub(crate) struct GenerationParams {
    pub(crate) agent_args: Option<String>,
    pub(crate) agent_command_override: Option<String>,
    pub(crate) agent_id: String,
    pub(crate) command_input_template: Option<String>,
    pub(crate) custom_agent_command: Option<String>,
    pub(crate) custom_prompt: Option<String>,
    pub(crate) model: String,
    pub(crate) thinking_level: Option<String>,
}

#[derive(Clone)]
pub(crate) struct GenerationOverrides {
    pub(crate) agent_commands: HashMap<String, String>,
    pub(crate) discovery_host_key: Option<String>,
    pub(crate) legacy_settings: Option<Value>,
    pub(crate) params: Option<GenerationParams>,
    pub(crate) source_settings: Option<Value>,
}

pub(crate) struct PullRequestGenerationInput {
    pub(crate) base: String,
    pub(crate) body: String,
    pub(crate) draft: bool,
    pub(crate) title: String,
    pub(crate) use_template: Option<bool>,
}

pub(super) struct PullRequestContext {
    base: String,
    body: String,
    branch: Option<String>,
    changes: String,
    commits: String,
    draft: bool,
    patch: String,
    title: String,
}

impl GitAuthority {
    pub(crate) async fn generate_commit_message(
        &self,
        worktree: &str,
        overrides: GenerationOverrides,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let params = match self.resolve_generation_params("commitMessage", overrides) {
            Ok(params) => params,
            Err(error) => return Ok(failure(error)),
        };
        let context = match context::staged(&scope.runner).await {
            Ok(Some(context)) => context,
            Ok(None) => return Ok(failure("No staged changes to summarize.")),
            Err(_) => return Ok(failure("Failed to read staged changes.")),
        };
        let plan = match agent::plan(&params, prompt::commit(&context, &params)) {
            Ok(plan) => plan,
            Err(error) => return Ok(failure(error)),
        };
        let result = self
            .run_plan(&scope, "commit-message", &params.agent_id, plan)
            .await;
        Ok(match result {
            PlanResult::Success { label, output } => json!({
                "success": true,
                "message": prompt::parse_commit_output(&output),
                "agentLabel": label
            }),
            PlanResult::Failure { canceled, error } => generation_failure(error, canceled, None),
        })
    }

    pub(crate) async fn cancel_generate_commit_message(
        &self,
        worktree: &str,
    ) -> Result<Value, GitAuthorityError> {
        self.cancel_generation(worktree, "commit-message").await?;
        Ok(json!({ "ok": true }))
    }

    pub(crate) async fn generate_pull_request_fields(
        &self,
        worktree: &str,
        input: PullRequestGenerationInput,
        overrides: GenerationOverrides,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let params = match self.resolve_generation_params("pullRequest", overrides) {
            Ok(params) => params,
            Err(error) => return Ok(generation_failure(error, false, Some(false))),
        };
        let branch_context = match context::pull_request(&scope.runner, &input).await {
            Ok(Some(context)) => context,
            Ok(None) => {
                return Ok(generation_failure(
                    "No branch changes to summarize.",
                    false,
                    Some(false),
                ));
            }
            Err(error) => return Ok(generation_failure(error, false, Some(false))),
        };
        let plan = match agent::plan(&params, prompt::pull_request(&branch_context, &params)) {
            Ok(plan) => plan,
            Err(error) => return Ok(generation_failure(error, false, Some(false))),
        };
        let result = self
            .run_plan(&scope, "pull-request-fields", &params.agent_id, plan)
            .await;
        Ok(match result {
            PlanResult::Success { label, output } => {
                match prompt::parse_pull_request_output(&output, &branch_context) {
                    Ok(fields) => {
                        json!({ "success": true, "fields": fields, "agentLabel": label, "branchChangedByPreparation": false })
                    }
                    Err(_) => generation_failure(
                        "Generated pull request details could not be parsed.",
                        false,
                        Some(false),
                    ),
                }
            }
            PlanResult::Failure { canceled, error } => {
                generation_failure(error, canceled, Some(false))
            }
        })
    }

    pub(crate) async fn cancel_generate_pull_request_fields(
        &self,
        worktree: &str,
    ) -> Result<Value, GitAuthorityError> {
        self.cancel_generation(worktree, "pull-request-fields")
            .await?;
        Ok(json!({ "ok": true }))
    }

    async fn run_plan(
        &self,
        scope: &GitScope,
        operation: &str,
        agent_id: &str,
        plan: agent::AgentPlan,
    ) -> PlanResult {
        let sequence = self.generation_sequence.fetch_add(1, Ordering::Relaxed);
        let lane = lane_key(operation, &scope.host_id, &scope.runner.cwd);
        let (sender, receiver) = watch::channel(false);
        lock(&self.generation_cancels).insert(lane.clone(), (sequence, sender));
        let lane_guard = GenerationLane {
            cancels: self.generation_cancels.clone(),
            lane,
            sequence,
        };
        let launch = self.settings.agent_launch_settings(agent_id);
        let mut request = HostCommand::new(plan.binary.clone(), plan.args);
        request.cancel = Some(receiver);
        request.cwd = Some(scope.runner.cwd.clone());
        request.env = launch.environment;
        request.max_output_bytes = Some(MAX_AGENT_OUTPUT_BYTES);
        request.stdin = plan.stdin;
        request.timeout_ms = Some(GENERATION_TIMEOUT_MS);
        let output = scope.host.exec(request).await;
        drop(lane_guard);
        match output {
            Ok(output) if output.exit_code == 0 && !output.stdout.trim().is_empty() => {
                PlanResult::Success {
                    label: plan.label,
                    output: output.stdout,
                }
            }
            Ok(output) if output.exit_code == 0 => PlanResult::Failure {
                canceled: false,
                error: format!("{} returned an empty message.", plan.label),
            },
            Ok(output) => PlanResult::Failure {
                canceled: false,
                error: cli_failure(
                    &plan.label,
                    output.exit_code,
                    &output.stdout,
                    &output.stderr,
                ),
            },
            Err(error) if error.kind() == HostCommandErrorKind::Cancelled => PlanResult::Failure {
                canceled: true,
                error: "Generation canceled.".to_owned(),
            },
            Err(error) if error.kind() == HostCommandErrorKind::Timeout => PlanResult::Failure {
                canceled: false,
                error: "Generation timed out after 60s.".to_owned(),
            },
            Err(error) if error.kind() == HostCommandErrorKind::OutputLimit => {
                PlanResult::Failure {
                    canceled: false,
                    error: format!(
                        "{} CLI command produced too much output. Check the agent CLI configuration and try again.",
                        plan.label
                    ),
                }
            }
            Err(error) => PlanResult::Failure {
                canceled: false,
                error: format!(
                    "{} could not be started. Check the agent command in Settings and try again. ({error})",
                    plan.label
                ),
            },
        }
    }

    async fn cancel_generation(
        &self,
        worktree: &str,
        operation: &str,
    ) -> Result<(), GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let lane = lane_key(operation, &scope.host_id, &scope.runner.cwd);
        if let Some((_, sender)) = lock(&self.generation_cancels).get(&lane) {
            let _ = sender.send(true);
        }
        Ok(())
    }

    fn resolve_generation_params(
        &self,
        operation: &str,
        overrides: GenerationOverrides,
    ) -> Result<GenerationParams, String> {
        let mut params = overrides.params.unwrap_or_else(|| {
            params_from_settings(
                operation,
                overrides.source_settings.as_ref(),
                overrides.legacy_settings.as_ref(),
                overrides.discovery_host_key.as_deref(),
            )
        });
        let launch = self.settings.agent_launch_settings(&params.agent_id);
        if params.agent_command_override.is_none() {
            params.agent_command_override = overrides
                .agent_commands
                .get(&params.agent_id)
                .cloned()
                .or(launch.command_override);
        }
        if params.agent_args.is_none() && !launch.args.is_empty() {
            params.agent_args = Some(launch.args);
        }
        if launch.disabled {
            return Err(format!("Agent \"{}\" is disabled.", params.agent_id));
        }
        Ok(params)
    }
}

enum PlanResult {
    Success { label: String, output: String },
    Failure { canceled: bool, error: String },
}

struct GenerationLane {
    cancels: Arc<Mutex<CancelMap>>,
    lane: String,
    sequence: u64,
}

impl Drop for GenerationLane {
    fn drop(&mut self) {
        let mut cancels = lock(&self.cancels);
        if cancels
            .get(&self.lane)
            .is_some_and(|(sequence, _)| *sequence == self.sequence)
        {
            cancels.remove(&self.lane);
        }
    }
}

fn params_from_settings(
    operation: &str,
    source: Option<&Value>,
    legacy: Option<&Value>,
    host_key: Option<&str>,
) -> GenerationParams {
    let source = source.and_then(Value::as_object);
    let legacy = legacy.and_then(Value::as_object);
    let action = source
        .and_then(|source| source.get("actions"))
        .and_then(Value::as_object)
        .and_then(|actions| actions.get(operation_action(operation)))
        .and_then(Value::as_object);
    let agent_id = action
        .and_then(|value| value.get("agentId"))
        .and_then(Value::as_str)
        .or_else(|| {
            source
                .and_then(|value| value.get("agentId"))
                .and_then(Value::as_str)
        })
        .or_else(|| {
            legacy
                .and_then(|value| value.get("agentId"))
                .and_then(Value::as_str)
        })
        .unwrap_or("claude")
        .to_owned();
    let model = selected_model(operation, &agent_id, source, legacy, host_key)
        .or_else(|| agent::spec(&agent_id).map(|spec| spec.default_model.to_owned()))
        .unwrap_or_default();
    let thinking_level = source
        .and_then(|value| value.get("selectedThinkingByModel"))
        .and_then(Value::as_object)
        .and_then(|values| values.get(&model))
        .and_then(Value::as_str)
        .map(str::to_owned);
    let custom_prompt = source
        .and_then(|value| value.get("instructionsByOperation"))
        .and_then(Value::as_object)
        .and_then(|values| values.get(operation))
        .and_then(Value::as_str)
        .or_else(|| {
            legacy
                .and_then(|value| value.get("customPrompt"))
                .and_then(Value::as_str)
        })
        .map(str::to_owned);
    GenerationParams {
        agent_args: action
            .and_then(|value| value.get("agentArgs"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        agent_command_override: None,
        agent_id,
        command_input_template: action
            .and_then(|value| value.get("commandInputTemplate"))
            .and_then(Value::as_str)
            .map(str::to_owned),
        custom_agent_command: source
            .and_then(|value| value.get("customAgentCommand"))
            .and_then(Value::as_str)
            .or_else(|| {
                legacy
                    .and_then(|value| value.get("customAgentCommand"))
                    .and_then(Value::as_str)
            })
            .map(str::to_owned),
        custom_prompt,
        model,
        thinking_level,
    }
}

fn selected_model(
    operation: &str,
    agent: &str,
    source: Option<&Map<String, Value>>,
    legacy: Option<&Map<String, Value>>,
    host_key: Option<&str>,
) -> Option<String> {
    let operation_model = source
        .and_then(|value| value.get("modelOverridesByOperation"))
        .and_then(Value::as_object)
        .and_then(|values| values.get(operation))
        .and_then(Value::as_object);
    for settings in [operation_model, source, legacy] {
        if let Some(value) = host_key.and_then(|host| {
            settings
                .and_then(|value| value.get("selectedModelByAgentByHost"))
                .and_then(Value::as_object)
                .and_then(|hosts| hosts.get(host))
                .and_then(Value::as_object)
                .and_then(|agents| agents.get(agent))
                .and_then(Value::as_str)
        }) {
            return Some(value.to_owned());
        }
        if let Some(value) = settings
            .and_then(|value| value.get("selectedModelByAgent"))
            .and_then(Value::as_object)
            .and_then(|agents| agents.get(agent))
            .and_then(Value::as_str)
        {
            return Some(value.to_owned());
        }
    }
    None
}

fn operation_action(operation: &str) -> &str {
    if operation == "pullRequest" {
        "generatePullRequest"
    } else {
        "generateCommitMessage"
    }
}
fn lane_key(operation: &str, host: &str, cwd: &str) -> String {
    format!("{operation}:{host}:{cwd}")
}
fn failure(error: impl Into<String>) -> Value {
    json!({ "success": false, "error": error.into() })
}
fn generation_failure(
    error: impl Into<String>,
    canceled: bool,
    branch_changed: Option<bool>,
) -> Value {
    let mut value = json!({ "success": false, "error": error.into() });
    if canceled {
        value["canceled"] = Value::Bool(true);
    }
    if let Some(changed) = branch_changed {
        value["branchChangedByPreparation"] = Value::Bool(changed);
    }
    value
}
fn cli_failure(label: &str, code: i32, stdout: &str, stderr: &str) -> String {
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        format!("{label} CLI command failed with code {code}.")
    } else {
        format!(
            "{label} CLI command failed with code {code}: {}",
            detail.chars().take(240).collect::<String>()
        )
    }
}

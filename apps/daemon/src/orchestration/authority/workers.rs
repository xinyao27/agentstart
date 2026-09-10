use std::time::Duration;

use base64::Engine;
use rusqlite::{OptionalExtension, params};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

use crate::terminal_session::{
    TerminalClient, TerminalClientType, TerminalCreateRequest, TerminalPresentation,
    TerminalSendRequest, WaitCondition,
};

use super::OrchestrationAuthority;
use crate::orchestration::{
    OrchestrationError, capability_hash, find_dispatch, find_task, find_worker, insert_message,
    message_row, object, parse_json, random_prefixed_id, require_string, string, value_string,
};

const DEFAULT_TIMEOUT_MS: u64 = 60_000;
const FEDERATION_CONTROL_MAIL_PROTOCOL_VERSION: i64 = 2;
const TUI_AGENTS: &[&str] = &[
    "claude",
    "openclaude",
    "codex",
    "opencode",
    "mimo",
    "gemini",
    "droid",
    "grok",
    "cursor",
];

type TerminalObservation = (Option<Value>, bool, &'static str);

#[derive(Clone, Copy, PartialEq)]
enum WorkerOutputSource {
    Terminal,
    Transcript,
}

impl WorkerOutputSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::Terminal => "terminal",
            Self::Transcript => "transcript",
        }
    }
}

struct WorkerOutputCursor {
    source: WorkerOutputSource,
    source_identity: Option<String>,
    position: u64,
}

struct LocalWorkerLaunch<'a> {
    input: &'a Map<String, Value>,
    task: &'a Value,
    coordinator: &'a str,
    worktree_id: &'a str,
    terminal: Option<String>,
    agent: Option<String>,
    timeout_ms: u64,
    dispatch_id: &'a str,
}

struct RemoteWorkerLaunch<'a> {
    input: &'a Map<String, Value>,
    dispatch_id: &'a str,
    task_id: &'a str,
    task_spec: &'a str,
    worktree_id: &'a str,
    terminal: Option<String>,
    agent: Option<String>,
    timeout_ms: u64,
}

struct RemoteAttachmentAuthorization<'a> {
    dispatch_id: &'a str,
    worktree_id: &'a str,
    handle: &'a str,
    pane_key: &'a str,
    incarnation: &'a str,
    capability: &'a str,
    effects: &'a [Value],
}

impl OrchestrationAuthority {
    pub(super) async fn relay_remote_worker_message(
        &self,
        input: &Map<String, Value>,
        from: &str,
        pane_key: Option<&str>,
        process_incarnation: Option<&str>,
        capability: Option<&str>,
    ) -> Result<Option<Value>, OrchestrationError> {
        let Some(pane_key) = pane_key else {
            return Ok(None);
        };
        let Some(attachment) = self.active_remote_attachment(pane_key).await? else {
            return Ok(None);
        };
        if string(input, "to").is_some() || string(input, "run").is_some() {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Federated Dispatch messages route to their Run home; omit --to and --run.",
            ));
        }
        verify_remote_authority(&attachment, pane_key, process_incarnation, capability)?;
        let dispatch_id = value_string(&attachment, "dispatch_id").ok_or_else(|| {
            OrchestrationError::domain("dispatch_not_found", "Remote Dispatch ID was not recorded.")
        })?;
        let message_type = string(input, "type").unwrap_or_else(|| "status".to_owned());
        let payload = string(input, "payload");
        let payload_object = match payload.as_deref() {
            Some(encoded) => {
                let value: Value = serde_json::from_str(encoded).map_err(|_| {
                    OrchestrationError::domain(
                        "invalid_argument",
                        "Message payload must be valid JSON.",
                    )
                })?;
                value.as_object().cloned().unwrap_or_default()
            }
            None => Map::new(),
        };
        if string(&payload_object, "dispatchId").is_some_and(|requested| requested != dispatch_id) {
            return Err(OrchestrationError::domain(
                "dispatch_inactive",
                format!(
                    "Dispatch {} is not the active remote Dispatch for this pane.",
                    string(&payload_object, "dispatchId").unwrap_or_default()
                ),
            ));
        }
        let outcome = string(&payload_object, "outcome")
            .filter(|value| matches!(value.as_str(), "succeeded" | "failed"));
        if message_type == "worker_done" && outcome.is_none() {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Remote worker_done requires outcome=succeeded|failed.",
            ));
        }
        let relay_payload = encode(json!({
            "from": from,
            "subject": require_string(input, "subject")?,
            "body": string(input, "body").unwrap_or_default(),
            "type": message_type,
            "priority": string(input, "priority").unwrap_or_else(|| "normal".to_owned()),
            "threadId": string(input, "threadId"),
            "payload": payload,
        }))?;
        let message_id = random_prefixed_id("msg")?;
        let byte_count = i64::try_from(relay_payload.len()).unwrap_or(i64::MAX);
        let dispatch_for_store = dispatch_id.clone();
        let message_for_store = message_id.clone();
        let kind_for_store = message_type.clone();
        let outcome_for_store = outcome.clone();
        let sequence = self
            .store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                let sequence = transaction.query_row(
                    "SELECT COALESCE(MAX(sequence),0)+1 FROM federation_relay_items
                     WHERE dispatch_id=?1 AND direction='to_home'",
                    [&dispatch_for_store],
                    |row| row.get::<_, i64>(0),
                )?;
                transaction.execute(
                    "INSERT INTO federation_relay_items (
                       dispatch_id,direction,sequence,message_id,kind,payload,byte_count
                     ) VALUES (?1,'to_home',?2,?3,?4,?5,?6)",
                    params![
                        dispatch_for_store,
                        sequence,
                        message_for_store,
                        kind_for_store,
                        relay_payload,
                        byte_count
                    ],
                )?;
                if let Some(outcome) = outcome_for_store {
                    transaction.execute(
                        "UPDATE remote_dispatch_attachments SET state=?1,
                           stage='worker_report_queued',updated_at=datetime('now')
                         WHERE dispatch_id=?2 AND state='ready'",
                        params![outcome, dispatch_for_store],
                    )?;
                    transaction.execute(
                        "UPDATE remote_questions SET status='closed'
                         WHERE dispatch_id=?1 AND status='pending'",
                        [&dispatch_for_store],
                    )?;
                }
                transaction.commit()?;
                Ok(Value::from(sequence))
            })
            .await?
            .as_i64()
            .ok_or_else(|| {
                OrchestrationError::domain("encoding_failed", "Relay sequence was invalid.")
            })?;
        self.notify();
        let mut result = json!({
            "relay": {
                "messageId": message_id,
                "sequence": sequence,
                "dispatchId": dispatch_id,
                "destination": "run_home",
                "accepted": true,
            }
        });
        if let Some(outcome) = outcome {
            result["lifecycle"] = json!({
                "action": if outcome == "succeeded" { "completed" } else { "failed" }
            });
        }
        Ok(Some(result))
    }

    pub(super) async fn ask_remote_worker(
        &self,
        input: &Map<String, Value>,
        from: &str,
        pane_key: &str,
        process_incarnation: &str,
        capability: Option<&str>,
    ) -> Result<Option<Value>, OrchestrationError> {
        let Some(attachment) = self.active_remote_attachment(pane_key).await? else {
            return Ok(None);
        };
        if string(input, "to").is_some() || string(input, "run").is_some() {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Federated Dispatch questions route to their Run home; omit --to and --run.",
            ));
        }
        verify_remote_authority(&attachment, pane_key, Some(process_incarnation), capability)?;
        let dispatch_id = value_string(&attachment, "dispatch_id").ok_or_else(|| {
            OrchestrationError::domain("dispatch_not_found", "Remote Dispatch ID was not recorded.")
        })?;
        let question_text = string(input, "question");
        let resume = string(input, "resume");
        if question_text.is_some() == resume.is_some() {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Choose exactly one of --question or --resume.",
            ));
        }
        let question_id = if let Some(resume) = resume {
            let dispatch_for_store = dispatch_id.clone();
            self.store
                .execute(move |connection| {
                    let exists = connection
                        .query_row(
                            "SELECT 1 FROM remote_questions WHERE message_id=?1 AND dispatch_id=?2",
                            params![resume, dispatch_for_store],
                            |row| row.get::<_, i64>(0),
                        )
                        .optional()?
                        .is_some();
                    if !exists {
                        return Err(OrchestrationError::domain(
                            "question_not_found",
                            format!("Question {resume} does not belong to this remote Dispatch."),
                        ));
                    }
                    Ok(Value::String(resume))
                })
                .await?
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| {
                    OrchestrationError::domain("encoding_failed", "Question ID was invalid.")
                })?
        } else {
            let message_id = random_prefixed_id("msg")?;
            let options = string(input, "options")
                .map(|value| {
                    value
                        .split(',')
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(str::to_owned)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let relay_payload = encode(json!({
                "from": from,
                "subject": "Question",
                "body": question_text.unwrap_or_default(),
                "type": "question",
                "priority": "normal",
                "threadId": null,
                "payload": encode(json!({
                    "taskId": value_string(&attachment, "task_id"),
                    "dispatchId": dispatch_id,
                    "question": string(input, "question"),
                    "options": options,
                }))?,
            }))?;
            let byte_count = i64::try_from(relay_payload.len()).unwrap_or(i64::MAX);
            let dispatch_for_store = dispatch_id.clone();
            let message_for_store = message_id.clone();
            self.store
                .execute(move |connection| {
                    let transaction = connection.transaction()?;
                    let sequence = transaction.query_row(
                        "SELECT COALESCE(MAX(sequence),0)+1 FROM federation_relay_items
                         WHERE dispatch_id=?1 AND direction='to_home'",
                        [&dispatch_for_store],
                        |row| row.get::<_, i64>(0),
                    )?;
                    transaction.execute(
                        "INSERT INTO federation_relay_items (
                           dispatch_id,direction,sequence,message_id,kind,payload,byte_count
                         ) VALUES (?1,'to_home',?2,?3,'question',?4,?5)",
                        params![
                            dispatch_for_store,
                            sequence,
                            message_for_store,
                            relay_payload,
                            byte_count
                        ],
                    )?;
                    transaction.execute(
                        "INSERT INTO remote_questions (message_id,dispatch_id)
                         VALUES (?1,?2)",
                        params![message_for_store, dispatch_for_store],
                    )?;
                    transaction.commit()?;
                    Ok(Value::Null)
                })
                .await?;
            self.notify();
            message_id
        };
        let timeout_ms = finite_millis(input, "timeoutMs", super::ASK_DEFAULT_TIMEOUT_MS)
            .min(super::ASK_MAX_TIMEOUT_MS);
        let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms);
        let mut revision = self.revision.subscribe();
        loop {
            let question_for_store = question_id.clone();
            let dispatch_for_store = dispatch_id.clone();
            let question = self
                .store
                .execute(move |connection| {
                    let question = connection
                        .query_row(
                            "SELECT status,answer_message_id,answer_body FROM remote_questions
                             WHERE message_id=?1 AND dispatch_id=?2",
                            params![question_for_store, dispatch_for_store],
                            |row| {
                                Ok(json!({
                                    "status": row.get::<_, String>(0)?,
                                    "answerMessageId": row.get::<_, Option<String>>(1)?,
                                    "answer": row.get::<_, Option<String>>(2)?,
                                }))
                            },
                        )
                        .optional()?;
                    question.ok_or_else(|| {
                        OrchestrationError::domain(
                            "question_not_found",
                            "Remote question was not found.",
                        )
                    })
                })
                .await?;
            match value_string(&question, "status").as_deref() {
                Some("answered") => {
                    return Ok(Some(json!({
                        "answer": question.get("answer").cloned().unwrap_or(Value::Null),
                        "answerMessageId": question.get("answerMessageId").cloned().unwrap_or(Value::Null),
                        "messageId": question_id,
                        "threadId": question_id,
                        "timedOut": false,
                        "cancelled": false,
                        "connectionLost": false,
                        "timeoutMs": timeout_ms,
                    })));
                }
                Some("closed") => {
                    return Err(OrchestrationError::domain(
                        "dispatch_inactive",
                        format!(
                            "Question {question_id} closed because its remote Dispatch is inactive."
                        ),
                    ));
                }
                _ => {}
            }
            if tokio::time::Instant::now() >= deadline
                || tokio::time::timeout_at(deadline, revision.changed())
                    .await
                    .is_err()
            {
                return Ok(Some(json!({
                    "answer": null,
                    "messageId": question_id,
                    "threadId": question_id,
                    "timedOut": true,
                    "cancelled": false,
                    "connectionLost": false,
                    "timeoutMs": timeout_ms,
                })));
            }
        }
    }

    pub(super) async fn active_remote_attachment(
        &self,
        pane_key: &str,
    ) -> Result<Option<Value>, OrchestrationError> {
        let pane_key = pane_key.to_owned();
        self.store
            .execute(move |connection| {
                let mut statement = connection.prepare(
                    "SELECT dispatch_id,task_id,home_peer_fingerprint,protocol_version,runtime_epoch,
                            capability_hash,pane_key,process_incarnation,state,stage,worktree_id,
                            terminal_handle,setup_state,effects,residual_resources,
                            to_worker_imported_sequence,last_error,created_at,updated_at
                     FROM remote_dispatch_attachments WHERE state='ready'",
                )?;
                let rows = statement
                    .query_map([], remote_attachment_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows
                    .into_iter()
                    .find(|attachment| {
                        value_string(attachment, "pane_key").is_some_and(|candidate| {
                            crate::orchestration::pane_keys_match(&candidate, &pane_key)
                        })
                    })
                    .unwrap_or(Value::Null))
            })
            .await
            .map(|value| (!value.is_null()).then_some(value))
    }

    pub(super) async fn worker_start(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?.clone();
        if let Some(server) = string(&input, "on") {
            return Err(OrchestrationError::domain(
                "capability_unsupported",
                format!(
                    "Connected environment {server} cannot be used until its authenticated runtime transport is available."
                ),
            ));
        }
        let task_id = require_string(&input, "task")?.to_owned();
        let from = require_string(&input, "from")?.to_owned();
        let requested_run = string(&input, "run");
        let (coordinator_pane, _) = self.terminal_identity(&from).await?;
        let run = self
            .store
            .execute({
                let coordinator_pane = coordinator_pane.clone();
                move |connection| {
                    let run = crate::orchestration::require_current_run_for_pane(
                        connection,
                        &coordinator_pane,
                    )?;
                    if requested_run.as_deref().is_some_and(|requested| {
                        value_string(&run, "id").as_deref() != Some(requested)
                    }) {
                        return Err(OrchestrationError::domain(
                            "consumer_fenced",
                            "worker-start requires the coordinator terminal currently bound to the Task Run.",
                        ));
                    }
                    Ok(run)
                }
            })
            .await?;
        let run_id = value_string(&run, "id").ok_or_else(|| {
            OrchestrationError::domain("run_required", "The bound Run has no identifier.")
        })?;
        let task = self
            .store
            .execute({
                let task_id = task_id.clone();
                let run_id = run_id.clone();
                move |connection| {
                    find_task(connection, &task_id)?
                        .filter(|task| value_string(task, "run_id").as_deref() == Some(&run_id))
                        .ok_or_else(|| {
                            OrchestrationError::domain(
                                "task_not_found",
                                format!("Task {task_id} was not found in Run {run_id}."),
                            )
                        })
                }
            })
            .await?;
        let terminal = string(&input, "terminal");
        let agent = string(&input, "agent");
        if terminal.is_some() && agent.is_some() {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "--terminal reuses an existing agent and cannot combine with --agent.",
            ));
        }
        let requested_worktree = string(&input, "worktree").unwrap_or_else(|| "current".to_owned());
        let creates_worktree = matches!(requested_worktree.as_str(), "new-child" | "new-top-level");
        if creates_worktree {
            if terminal.is_some() {
                return Err(OrchestrationError::domain(
                    "invalid_argument",
                    "--terminal cannot combine with new-worktree creation.",
                ));
            }
            if string(&input, "name").is_none() {
                return Err(OrchestrationError::domain(
                    "invalid_argument",
                    "New worktrees require --name.",
                ));
            }
            return Err(OrchestrationError::domain(
                "capability_unsupported",
                "Worker worktree creation is unavailable until worktree.create is connected to the orchestration authority.",
            ));
        }
        if ["name", "repo", "baseBranch", "setup"]
            .into_iter()
            .any(|key| input.get(key).is_some_and(|value| !value.is_null()))
        {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Creation and setup options apply only to new-child or new-top-level worktrees.",
            ));
        }
        let agent = match (terminal.as_ref(), agent) {
            (Some(_), agent) => agent,
            (None, Some(agent)) if TUI_AGENTS.contains(&agent.as_str()) => Some(agent),
            _ => {
                return Err(OrchestrationError::domain(
                    "agent_unconfigured",
                    "A configured --agent is required when worker-start creates a terminal.",
                ));
            }
        };
        let coordinator = self
            .terminals
            .show(&from)
            .map_err(|error| OrchestrationError::domain("terminal_not_found", error.to_string()))?;
        let worktree_selector = if requested_worktree == "current" {
            format!("id:{}", coordinator.summary.worktree_id)
        } else {
            requested_worktree.clone()
        };
        let worktree = self
            .worktrees
            .resolve_managed(&worktree_selector)
            .await
            .map_err(|_| {
                OrchestrationError::domain(
                    "worktree_not_found",
                    format!("Worktree {worktree_selector} was not found."),
                )
            })?;
        if let Some(handle) = terminal.as_deref() {
            self.validate_reused_terminal(handle, &worktree.id)?;
        }
        if value_string(&task, "status").as_deref() != Some("ready")
            && string(&input, "retryOf").is_none()
        {
            return Err(OrchestrationError::domain(
                "task_not_startable",
                format!(
                    "Task {task_id} is {}; only ready Tasks can start a worker.",
                    value_string(&task, "status").unwrap_or_default()
                ),
            ));
        }
        let timeout_ms = finite_millis(&input, "timeoutMs", DEFAULT_TIMEOUT_MS);
        let dispatch_id = self
            .create_starting_worker(
                &task_id,
                &run_id,
                string(&input, "retryOf"),
                json!({
                    "worktree": requested_worktree,
                    "resolvedWorktreeId": worktree.id,
                    "terminal": terminal,
                    "agent": agent,
                    "timeoutMs": timeout_ms,
                    "setup": "not_applicable",
                    "setupSource": "existing_worktree",
                }),
            )
            .await?;
        let mut effects = vec![
            json!({ "kind": "worktree", "action": "reused", "id": worktree.id }),
            json!({ "kind": "setup", "action": "not_applicable", "state": "not_applicable" }),
        ];
        let setup = setup_not_applicable();
        let result = self
            .finish_local_worker_start(
                LocalWorkerLaunch {
                    input: &input,
                    task: &task,
                    coordinator: &from,
                    worktree_id: &worktree.id,
                    terminal,
                    agent,
                    timeout_ms,
                    dispatch_id: &dispatch_id,
                },
                &mut effects,
            )
            .await;
        match result {
            Ok(warning) => Ok(json!({
                "runId": run_id,
                "taskId": task_id,
                "dispatchId": dispatch_id,
                "state": "ready",
                "stage": "ready",
                "setup": setup,
                "timeoutMs": timeout_ms,
                "effects": effects,
                "residualResources": [],
                "warning": warning,
            })),
            Err(error) => {
                let reason = error.to_string();
                let failed_stage = worker_failure_stage(&error);
                let worker = self
                    .fail_worker_start(&dispatch_id, failed_stage, &reason, &effects)
                    .await?;
                Ok(json!({
                    "runId": run_id,
                    "taskId": task_id,
                    "dispatchId": dispatch_id,
                    "state": value_string(&worker, "state").unwrap_or_else(|| "failed".to_owned()),
                    "stage": value_string(&worker, "stage").unwrap_or_else(|| failed_stage.to_owned()),
                    "failedStage": failed_stage,
                    "lastError": reason,
                    "setup": setup,
                    "effects": effects,
                    "residualResources": worker.get("residualResources").cloned().unwrap_or_else(|| json!([])),
                }))
            }
        }
    }

    async fn finish_local_worker_start(
        &self,
        launch: LocalWorkerLaunch<'_>,
        effects: &mut Vec<Value>,
    ) -> Result<Option<String>, OrchestrationError> {
        let LocalWorkerLaunch {
            input,
            task,
            coordinator,
            worktree_id,
            terminal,
            agent,
            timeout_ms,
            dispatch_id,
        } = launch;
        let (handle, warning) = match terminal {
            Some(handle) => {
                effects.push(json!({
                    "kind": "terminal",
                    "role": "agent",
                    "action": "reused",
                    "id": handle,
                }));
                (handle, None)
            }
            None => {
                self.record_worker_stage(
                    dispatch_id,
                    "terminal_creating",
                    Some(worktree_id),
                    None,
                    effects,
                    effects,
                )
                .await?;
                let agent = agent.ok_or_else(|| {
                    OrchestrationError::domain("agent_unconfigured", "Missing configured agent.")
                })?;
                let startup = self
                    .terminals
                    .agent_startup(&format!("id:{worktree_id}"), &agent, None)
                    .await
                    .map_err(|error| {
                        OrchestrationError::domain("terminal_create_failed", error.to_string())
                    })?;
                let created = self
                    .terminals
                    .create(TerminalCreateRequest {
                        activate: false,
                        cols: 80,
                        command: Some(startup.command),
                        cwd: None,
                        cwd_fallback: false,
                        env: startup.environment,
                        env_to_delete: Vec::new(),
                        focus: false,
                        launch_agent: Some(agent),
                        launch_config: Some(startup.launch_config),
                        launch_token: None,
                        leaf_id: None,
                        presentation: Some(TerminalPresentation::Background),
                        rows: 24,
                        startup_command_delivery: startup.startup_command_delivery,
                        renderer_backed: false,
                        tab_id: None,
                        title: Some(format!(
                            "worker-{}",
                            value_string(task, "id").unwrap_or_default()
                        )),
                        split_direction: None,
                        split_from_leaf_id: None,
                        split_telemetry_source: None,
                        worktree: Some(format!("id:{worktree_id}")),
                    })
                    .await
                    .map_err(|error| {
                        OrchestrationError::domain("terminal_create_failed", error.to_string())
                    })?;
                effects.push(json!({
                    "kind": "terminal",
                    "role": "agent",
                    "action": "created",
                    "id": created.handle,
                    "surface": created.surface,
                    "warning": created.warning,
                }));
                (created.handle, created.warning)
            }
        };
        self.record_worker_stage(
            dispatch_id,
            "terminal_readying",
            Some(worktree_id),
            Some(&handle),
            effects,
            effects,
        )
        .await?;
        let wait = self
            .terminals
            .wait(
                &handle,
                WaitCondition::TuiIdle,
                Some(Duration::from_millis(timeout_ms)),
            )
            .await
            .map_err(|error| {
                OrchestrationError::domain("agent_readiness_failed", error.to_string())
            })?;
        if !wait.satisfied {
            return Err(OrchestrationError::domain(
                "agent_readiness_failed",
                wait.blocked_reason.map_or_else(
                    || format!("Agent did not become ready ({}).", wait.status),
                    |reason| format!("Agent startup blocked: {reason}"),
                ),
            ));
        }
        let (pane_key, process_incarnation) = self.terminal_identity(&handle).await?;
        let capability = random_capability()?;
        let effects_json = encode(&*effects)?;
        let dispatch_id_for_store = dispatch_id.to_owned();
        let handle_for_store = handle.clone();
        let worktree_for_store = worktree_id.to_owned();
        let pane_for_store = pane_key.clone();
        let incarnation_for_store = process_incarnation.clone();
        let capability_hash_value = capability_hash(&capability);
        self.store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                transaction.execute(
                    "UPDATE dispatch_contexts SET assignee_handle=?1,assignee_pane_key=?2,
                       process_incarnation=?3,capability_hash=?4,status='dispatched',
                       dispatched_at=datetime('now') WHERE id=?5",
                    params![
                        handle_for_store,
                        pane_for_store,
                        incarnation_for_store,
                        capability_hash_value,
                        dispatch_id_for_store
                    ],
                )?;
                transaction.execute(
                    "UPDATE worker_dispatches SET state='starting',stage='dispatch_input',
                       worktree_id=?1,agent_terminal_handle=?2,effects=?3,
                       residual_resources=?3,updated_at=datetime('now') WHERE dispatch_id=?4",
                    params![
                        worktree_for_store,
                        handle_for_store,
                        effects_json,
                        dispatch_id_for_store
                    ],
                )?;
                transaction.commit()?;
                Ok(Value::Null)
            })
            .await?;
        let preamble = super::dispatch_preamble(
            &value_string(task, "id").unwrap_or_default(),
            dispatch_id,
            &value_string(task, "spec").unwrap_or_default(),
            coordinator,
            &handle,
            Some(&capability),
            input.get("devMode").and_then(Value::as_bool) == Some(true),
        );
        let sent = self
            .terminals
            .send_guarded(
                TerminalSendRequest {
                    claim_viewport: false,
                    client: Some(TerminalClient {
                        id: "orchestration".to_owned(),
                        kind: TerminalClientType::Daemon,
                    }),
                    enter: true,
                    input_kind: None,
                    interrupt: false,
                    require_agent_sendable: false,
                    terminal: handle.clone(),
                    text: Some(preamble),
                    viewport: None,
                },
                "orchestration",
            )
            .await
            .map_err(|error| {
                OrchestrationError::domain("dispatch_input_failed", error.to_string())
            })?;
        if !sent.accepted {
            return Err(OrchestrationError::domain(
                "dispatch_input_refused",
                "Terminal refused the dispatch input.",
            ));
        }
        effects.push(json!({
            "kind": "dispatch_input",
            "role": "agent",
            "id": handle,
            "state": "accepted",
        }));
        let effects_json = encode(&*effects)?;
        let dispatch_id_for_store = dispatch_id.to_owned();
        self.store
            .execute(move |connection| {
                connection.execute(
                    "UPDATE worker_dispatches SET state='ready',stage='ready',effects=?1,
                       residual_resources='[]',updated_at=datetime('now') WHERE dispatch_id=?2",
                    params![effects_json, dispatch_id_for_store],
                )?;
                Ok(Value::Null)
            })
            .await?;
        self.notify();
        Ok(warning)
    }

    async fn create_starting_worker(
        &self,
        task_id: &str,
        run_id: &str,
        retry_of: Option<String>,
        start_options: Value,
    ) -> Result<String, OrchestrationError> {
        let task_id = task_id.to_owned();
        let run_id = run_id.to_owned();
        let runtime_epoch = self.runtime_epoch.clone();
        let options = encode(&start_options)?;
        self.store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                if let Some(active) =
                    crate::orchestration::latest_dispatch_for_task(&transaction, &task_id)?
                    && matches!(
                        value_string(&active, "status").as_deref(),
                        Some("pending" | "dispatched")
                    )
                {
                    return Err(OrchestrationError::domain(
                        "task_not_startable",
                        format!("Task {task_id} already has an active Dispatch."),
                    ));
                }
                if let Some(retry_of) = retry_of {
                    let prior = find_dispatch(&transaction, &retry_of)?.ok_or_else(|| {
                        OrchestrationError::domain(
                            "dispatch_not_found",
                            format!("Retry Dispatch {retry_of} was not found."),
                        )
                    })?;
                    if value_string(&prior, "task_id").as_deref() != Some(&task_id) {
                        return Err(OrchestrationError::domain(
                            "invalid_argument",
                            "--retry-of belongs to a different Task.",
                        ));
                    }
                }
                let dispatch_id = random_prefixed_id("ctx")?;
                let failure_count = transaction.query_row(
                    "SELECT COALESCE(MAX(failure_count),0) FROM dispatch_contexts WHERE task_id=?1",
                    [&task_id],
                    |row| row.get::<_, i64>(0),
                )?;
                if failure_count >= 3 {
                    return Err(OrchestrationError::domain(
                        "circuit_broken",
                        format!("Task {task_id} reached the worker-start failure limit."),
                    ));
                }
                transaction.execute(
                    "INSERT INTO dispatch_contexts (id,run_id,task_id,status,failure_count)
                     VALUES (?1,?2,?3,'pending',?4)",
                    params![dispatch_id, run_id, task_id, failure_count],
                )?;
                transaction.execute(
                    "INSERT INTO worker_dispatches (
                       dispatch_id,runtime_epoch,state,stage,start_options
                     ) VALUES (?1,?2,'starting','accepted',?3)",
                    params![dispatch_id, runtime_epoch, options],
                )?;
                transaction.execute(
                    "UPDATE tasks SET status='dispatched' WHERE id=?1",
                    [&task_id],
                )?;
                transaction.commit()?;
                Ok(Value::String(dispatch_id))
            })
            .await?
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| {
                OrchestrationError::domain("encoding_failed", "Created Dispatch ID was invalid.")
            })
    }

    async fn record_worker_stage(
        &self,
        dispatch_id: &str,
        stage: &str,
        worktree_id: Option<&str>,
        terminal_handle: Option<&str>,
        effects: &[Value],
        residual_resources: &[Value],
    ) -> Result<(), OrchestrationError> {
        let dispatch_id = dispatch_id.to_owned();
        let stage = stage.to_owned();
        let worktree_id = worktree_id.map(str::to_owned);
        let terminal_handle = terminal_handle.map(str::to_owned);
        let effects = encode(effects)?;
        let residual = encode(residual_resources)?;
        self.store
            .execute(move |connection| {
                connection.execute(
                    "UPDATE worker_dispatches SET stage=?1,worktree_id=COALESCE(?2,worktree_id),
                       agent_terminal_handle=COALESCE(?3,agent_terminal_handle),effects=?4,
                       residual_resources=?5,updated_at=datetime('now') WHERE dispatch_id=?6",
                    params![
                        stage,
                        worktree_id,
                        terminal_handle,
                        effects,
                        residual,
                        dispatch_id
                    ],
                )?;
                Ok(Value::Null)
            })
            .await?;
        Ok(())
    }

    async fn fail_worker_start(
        &self,
        dispatch_id: &str,
        stage: &str,
        reason: &str,
        effects: &[Value],
    ) -> Result<Value, OrchestrationError> {
        let dispatch_id = dispatch_id.to_owned();
        let stage = stage.to_owned();
        let reason = reason.to_owned();
        let effects = encode(effects)?;
        self.store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                let dispatch = find_dispatch(&transaction, &dispatch_id)?.ok_or_else(|| {
                    OrchestrationError::domain(
                        "dispatch_not_found",
                        format!("Dispatch {dispatch_id} was not found."),
                    )
                })?;
                let failures = dispatch
                    .get("failure_count")
                    .and_then(Value::as_i64)
                    .unwrap_or_default()
                    + 1;
                let dispatch_state = if failures >= 3 {
                    "circuit_broken"
                } else {
                    "failed"
                };
                let task_state = if failures >= 3 { "failed" } else { "ready" };
                transaction.execute(
                    "UPDATE dispatch_contexts SET status=?1,failure_count=?2,last_failure=?3,
                       capability_revoked_at=COALESCE(capability_revoked_at,datetime('now'))
                     WHERE id=?4",
                    params![dispatch_state, failures, reason, dispatch_id],
                )?;
                transaction.execute(
                    "UPDATE worker_dispatches SET state='failed',stage=?1,last_error=?2,effects=?3,
                       residual_resources=?3,updated_at=datetime('now') WHERE dispatch_id=?4",
                    params![stage, reason, effects, dispatch_id],
                )?;
                transaction.execute(
                    "UPDATE tasks SET status=?1 WHERE id=?2",
                    params![task_state, value_string(&dispatch, "task_id")],
                )?;
                let worker = find_worker(&transaction, &dispatch_id)?.ok_or_else(|| {
                    OrchestrationError::domain("dispatch_not_found", "Worker receipt was lost.")
                })?;
                transaction.commit()?;
                Ok(worker)
            })
            .await
            .inspect(|_| self.notify())
    }

    fn validate_reused_terminal(
        &self,
        handle: &str,
        worktree_id: &str,
    ) -> Result<(), OrchestrationError> {
        let terminal = self.terminals.show(handle).map_err(|_| {
            OrchestrationError::domain(
                "terminal_not_found",
                format!("Terminal {handle} was not found."),
            )
        })?;
        if terminal.summary.worktree_id != worktree_id {
            return Err(OrchestrationError::domain(
                "terminal_worktree_mismatch",
                format!("Terminal {handle} does not belong to worktree {worktree_id}."),
            ));
        }
        let status = self
            .terminals
            .agent_status(handle)
            .map_err(|error| OrchestrationError::domain("terminal_not_found", error.to_string()))?;
        if !status.is_running_agent {
            return Err(OrchestrationError::domain(
                "agent_unconfigured",
                format!("Terminal {handle} is not running a recognized agent."),
            ));
        }
        Ok(())
    }

    pub(super) async fn worker_show(&self, body: Value) -> Result<Value, OrchestrationError> {
        let dispatch_id = require_string(object(&body)?, "dispatch")?.to_owned();
        let (dispatch, mut worker) = self.worker_records(&dispatch_id).await?;
        if value_string(&worker, "runtime_epoch").as_deref() != Some(&self.runtime_epoch) {
            let state = value_string(&worker, "state").unwrap_or_default();
            if state == "starting" {
                worker = self
                    .set_worker_unknown(
                        &dispatch_id,
                        "start_unknown",
                        "The runtime restarted before worker-start reached a terminal receipt.",
                    )
                    .await?;
            } else if state == "stopping" {
                worker = self
                    .set_worker_unknown(
                        &dispatch_id,
                        "stop_unknown",
                        "The runtime restarted before worker-stop reached a terminal receipt.",
                    )
                    .await?;
            }
        }
        let observation = self.observe_worker(&dispatch, &worker).await;
        Ok(json!({
            "dispatch": dispatch,
            "worker": worker,
            "terminal": if observation.1 { observation.0 } else { None },
            "observation": { "status": observation.2, "exactWorker": observation.1 },
        }))
    }

    pub(super) async fn worker_read(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let dispatch_id = require_string(input, "dispatch")?.to_owned();
        let source = string(input, "source").unwrap_or_else(|| "auto".to_owned());
        if !matches!(source.as_str(), "auto" | "terminal" | "transcript") {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Worker output source must be auto, terminal, or transcript.",
            ));
        }
        let (dispatch, worker) = self.worker_records(&dispatch_id).await?;
        let observation = self.observe_worker(&dispatch, &worker).await;
        if !observation.1 {
            return Err(OrchestrationError::domain(
                "worker_identity_changed",
                format!("Worker Dispatch {dispatch_id} no longer resolves to its exact process."),
            ));
        }
        let handle = value_string(&worker, "agent_terminal_handle").ok_or_else(|| {
            OrchestrationError::domain(
                "dispatch_not_found",
                format!("Worker Dispatch {dispatch_id} has no agent terminal."),
            )
        })?;
        self.read_worker_terminal(input, &dispatch_id, &handle, &worker, &source)
            .await
    }

    pub(super) async fn worker_stop(&self, body: Value) -> Result<Value, OrchestrationError> {
        let dispatch_id = require_string(object(&body)?, "dispatch")?.to_owned();
        let (dispatch, worker) = self.worker_records(&dispatch_id).await?;
        let state = value_string(&worker, "state").unwrap_or_default();
        if matches!(
            state.as_str(),
            "succeeded" | "failed" | "stopped" | "abandoned"
        ) {
            return Ok(settled_stop(&dispatch_id, &state));
        }
        self.update_worker_state(&dispatch_id, "stopping", "stopping", None)
            .await?;
        let observation = self.observe_worker(&dispatch, &worker).await;
        if !observation.1 || observation.2 != "running" {
            let reason = format!(
                "The recorded worker process is {}; no terminal was closed.",
                observation.2
            );
            let updated = self
                .set_worker_unknown(&dispatch_id, "stop_unknown", &reason)
                .await?;
            return Ok(json!({
                "dispatchId": dispatch_id,
                "state": value_string(&updated, "state"),
                "alreadySettled": false,
                "processAction": "none",
                "lastError": reason,
            }));
        }
        let handle = value_string(&worker, "agent_terminal_handle").ok_or_else(|| {
            OrchestrationError::domain("dispatch_not_found", "Worker terminal was not recorded.")
        })?;
        match self.terminals.close(&handle).await {
            Ok(was_running) => {
                self.update_worker_state(&dispatch_id, "stopped", "stopped", None)
                    .await?;
                self.notify();
                Ok(json!({
                    "dispatchId": dispatch_id,
                    "state": "stopped",
                    "alreadySettled": false,
                    "processAction": "closed_agent_terminal",
                    "close": { "handle": handle, "wasRunning": was_running },
                }))
            }
            Err(error) => {
                let reason = error.to_string();
                let updated = self
                    .set_worker_unknown(&dispatch_id, "stop_unknown", &reason)
                    .await?;
                Ok(json!({
                    "dispatchId": dispatch_id,
                    "state": value_string(&updated, "state"),
                    "alreadySettled": false,
                    "processAction": "unknown",
                    "lastError": reason,
                }))
            }
        }
    }

    pub(super) async fn worker_abandon(&self, body: Value) -> Result<Value, OrchestrationError> {
        let dispatch_id = require_string(object(&body)?, "dispatch")?.to_owned();
        let dispatch_id_for_store = dispatch_id.clone();
        let output = self
            .store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                let dispatch = find_dispatch(&transaction, &dispatch_id_for_store)?.ok_or_else(|| {
                    OrchestrationError::domain(
                        "dispatch_not_found",
                        format!("Worker Dispatch {dispatch_id_for_store} was not found."),
                    )
                })?;
                let worker = find_worker(&transaction, &dispatch_id_for_store)?.ok_or_else(|| {
                    OrchestrationError::domain(
                        "dispatch_not_found",
                        format!("Worker Dispatch {dispatch_id_for_store} was not found."),
                    )
                })?;
                let current = crate::orchestration::latest_dispatch_for_task(
                    &transaction,
                    &value_string(&dispatch, "task_id").unwrap_or_default(),
                )?;
                let stale = current
                    .as_ref()
                    .and_then(|value| value_string(value, "id"))
                    .as_deref()
                    != Some(&dispatch_id_for_store);
                let state = value_string(&worker, "state").unwrap_or_default();
                let settled = matches!(
                    state.as_str(),
                    "failed" | "succeeded" | "stopped" | "abandoned"
                );
                if !stale && !settled {
                    transaction.execute(
                        "UPDATE worker_dispatches SET state='abandoned',stage='abandoned',
                           updated_at=datetime('now') WHERE dispatch_id=?1",
                        [&dispatch_id_for_store],
                    )?;
                    transaction.execute(
                        "UPDATE dispatch_contexts SET status='failed',
                           capability_revoked_at=COALESCE(capability_revoked_at,datetime('now'))
                         WHERE id=?1",
                        [&dispatch_id_for_store],
                    )?;
                    transaction.execute(
                        "UPDATE tasks SET status='blocked' WHERE id=?1",
                        [value_string(&dispatch, "task_id").unwrap_or_default()],
                    )?;
                }
                let final_worker = find_worker(&transaction, &dispatch_id_for_store)?
                    .unwrap_or(worker);
                transaction.commit()?;
                Ok(json!({
                    "dispatchId": dispatch_id_for_store,
                    "state": value_string(&final_worker, "state"),
                    "alreadySettled": settled || stale,
                    "stale": stale,
                    "processAction": "none",
                    "warning": if stale {
                        "The Dispatch is no longer current; no state or process changed."
                    } else {
                        "Possibly-live resources were retained; no process was stopped or deleted."
                    },
                    "residualResources": final_worker.get("residualResources").cloned().unwrap_or_else(|| json!([])),
                }))
            })
            .await?;
        self.notify();
        Ok(output)
    }

    async fn worker_records(
        &self,
        dispatch_id: &str,
    ) -> Result<(Value, Value), OrchestrationError> {
        let dispatch_id = dispatch_id.to_owned();
        self.store
            .execute(move |connection| {
                let dispatch = find_dispatch(connection, &dispatch_id)?.ok_or_else(|| {
                    OrchestrationError::domain(
                        "dispatch_not_found",
                        format!("Worker Dispatch {dispatch_id} was not found."),
                    )
                })?;
                let worker = find_worker(connection, &dispatch_id)?.ok_or_else(|| {
                    OrchestrationError::domain(
                        "dispatch_not_found",
                        format!("Worker Dispatch {dispatch_id} was not found."),
                    )
                })?;
                Ok(json!({ "dispatch": dispatch, "worker": worker }))
            })
            .await
            .and_then(|value| {
                let dispatch = value.get("dispatch").cloned();
                let worker = value.get("worker").cloned();
                dispatch.zip(worker).ok_or_else(|| {
                    OrchestrationError::domain("encoding_failed", "Worker records were invalid.")
                })
            })
    }

    async fn observe_worker(&self, dispatch: &Value, worker: &Value) -> TerminalObservation {
        let Some(handle) = value_string(worker, "agent_terminal_handle") else {
            return (None, false, "unattached");
        };
        let Ok(terminal) = self.terminals.show(&handle) else {
            return (None, false, "missing");
        };
        let pane_key = format!("{}:{}", terminal.summary.tab_id, terminal.summary.leaf_id);
        let exact = value_string(dispatch, "assignee_pane_key")
            .is_some_and(|saved| crate::orchestration::pane_keys_match(&saved, &pane_key))
            && value_string(dispatch, "process_incarnation").as_deref()
                == Some(&terminal.transport_generation);
        let status = if exact {
            if terminal.summary.connected {
                "running"
            } else {
                "exited"
            }
        } else {
            "identity_changed"
        };
        (serde_json::to_value(terminal).ok(), exact, status)
    }

    async fn set_worker_unknown(
        &self,
        dispatch_id: &str,
        state: &str,
        reason: &str,
    ) -> Result<Value, OrchestrationError> {
        self.update_worker_state(dispatch_id, state, state, Some(reason))
            .await?;
        let dispatch_id = dispatch_id.to_owned();
        self.store
            .execute(move |connection| {
                find_worker(connection, &dispatch_id)?.ok_or_else(|| {
                    OrchestrationError::domain("dispatch_not_found", "Worker receipt was lost.")
                })
            })
            .await
    }

    async fn update_worker_state(
        &self,
        dispatch_id: &str,
        state: &str,
        stage: &str,
        error: Option<&str>,
    ) -> Result<(), OrchestrationError> {
        let dispatch_id = dispatch_id.to_owned();
        let state = state.to_owned();
        let stage = stage.to_owned();
        let error = error.map(str::to_owned);
        self.store
            .execute(move |connection| {
                connection.execute(
                    "UPDATE worker_dispatches SET state=?1,stage=?2,last_error=?3,
                       updated_at=datetime('now') WHERE dispatch_id=?4",
                    params![state, stage, error, dispatch_id],
                )?;
                Ok(Value::Null)
            })
            .await?;
        Ok(())
    }

    async fn read_worker_terminal(
        &self,
        input: &Map<String, Value>,
        dispatch_id: &str,
        handle: &str,
        worker: &Value,
        requested_source: &str,
    ) -> Result<Value, OrchestrationError> {
        let source_identity = terminal_source_identity(self, handle)?;
        let cursor = decode_cursor(input.get("cursor"), dispatch_id)?;
        if let Some(cursor) = cursor.as_ref()
            && requested_source != "auto"
            && cursor.source.as_str() != requested_source
        {
            return Err(OrchestrationError::domain(
                "cursor_invalid",
                format!(
                    "The worker-read cursor is pinned to {} output.",
                    cursor.source.as_str()
                ),
            ));
        }
        if requested_source == "transcript" {
            return Err(transcript_required(dispatch_id));
        }
        if cursor
            .as_ref()
            .is_some_and(|cursor| cursor.source == WorkerOutputSource::Transcript)
        {
            return Err(source_changed());
        }
        if cursor
            .as_ref()
            .and_then(|cursor| cursor.source_identity.as_deref())
            .is_some_and(|identity| identity != source_identity)
        {
            return Err(source_changed());
        }
        let limit = finite_usize(input, "limit");
        let mut terminal = self
            .terminals
            .read(handle, cursor.as_ref().map(|cursor| cursor.position), limit)
            .await
            .map_err(|error| {
                OrchestrationError::domain("terminal_read_failed", error.to_string())
            })?;
        let redacted = redact_dispatch_capabilities(&mut terminal.tail);
        let next_cursor = terminal
            .next_cursor
            .parse::<u64>()
            .ok()
            .map(|position| encode_cursor(dispatch_id, &source_identity, position))
            .transpose()?;
        let status = terminal.status;
        Ok(json!({
            "dispatchId": dispatch_id,
            "source": "terminal",
            "sourceIdentity": source_identity,
            "terminal": terminal,
            "cursor": next_cursor,
            "status": {
                "worker": value_string(worker, "state").unwrap_or_default(),
                "terminal": status,
            },
            "fallbackReason": if requested_source == "auto" { Value::String("session_not_reported".to_owned()) } else { Value::Null },
            "warnings": if redacted {
                vec!["Dispatch capability tokens were redacted from terminal output."]
            } else {
                Vec::<&str>::new()
            },
        }))
    }

    pub(super) async fn federation_attach_start(
        &self,
        body: Value,
        caller_fingerprint: Option<&str>,
    ) -> Result<Value, OrchestrationError> {
        let input = object(&body)?.clone();
        let dispatch_id = require_string(&input, "dispatchId")?.to_owned();
        let task_id = require_string(&input, "taskId")?.to_owned();
        let task_spec = require_string(&input, "taskSpec")?.to_owned();
        let worktree_selector = require_string(&input, "worktree")?.to_owned();
        let protocol_version = input
            .get("protocolVersion")
            .and_then(Value::as_i64)
            .filter(|version| matches!(version, 1 | 2))
            .ok_or_else(|| {
                OrchestrationError::domain(
                    "invalid_argument",
                    "Invalid federation protocol version.",
                )
            })?;
        let home_fingerprint = caller_fingerprint.ok_or_else(|| {
            OrchestrationError::domain(
                "authentication_required",
                "Federated worker attachment requires an authenticated Run home.",
            )
        })?;
        if matches!(worktree_selector.as_str(), "current" | "new-child") {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "A remote worker requires an exact existing worktree or new-top-level.",
            ));
        }
        if worktree_selector == "new-top-level" {
            return Err(OrchestrationError::domain(
                "capability_unsupported",
                "Remote worktree creation is unavailable until worktree.create is connected to orchestration.",
            ));
        }
        if ["name", "repo", "baseBranch", "setup", "setupSource"]
            .into_iter()
            .any(|key| input.get(key).is_some_and(|value| !value.is_null()))
        {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Creation and setup options apply only to remote new-top-level worktrees.",
            ));
        }
        let terminal = string(&input, "terminal");
        let agent = string(&input, "agent");
        if terminal.is_some() && agent.is_some() {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "--terminal reuses an existing agent and cannot combine with --agent.",
            ));
        }
        let agent = match (terminal.as_ref(), agent) {
            (Some(_), agent) => agent,
            (None, Some(agent)) if TUI_AGENTS.contains(&agent.as_str()) => Some(agent),
            _ => {
                return Err(OrchestrationError::domain(
                    "agent_unconfigured",
                    "A configured --agent is required when federated worker-start creates a terminal.",
                ));
            }
        };
        let worktree = self
            .worktrees
            .resolve_managed(&worktree_selector)
            .await
            .map_err(|_| {
                OrchestrationError::domain(
                    "worktree_not_found_on_server",
                    format!(
                        "Worktree {worktree_selector} was not found on the selected worker host."
                    ),
                )
            })?;
        if let Some(handle) = terminal.as_deref() {
            self.validate_reused_terminal(handle, &worktree.id)?;
        }
        self.create_remote_attachment(&dispatch_id, &task_id, home_fingerprint, protocol_version)
            .await?;
        let mut effects = vec![
            json!({ "kind": "worktree", "action": "reused", "id": worktree.id }),
            json!({ "kind": "setup", "action": "not_applicable", "state": "not_applicable" }),
        ];
        let timeout_ms = finite_millis(&input, "timeoutMs", DEFAULT_TIMEOUT_MS);
        let start = self
            .finish_remote_attachment(
                RemoteWorkerLaunch {
                    input: &input,
                    dispatch_id: &dispatch_id,
                    task_id: &task_id,
                    task_spec: &task_spec,
                    worktree_id: &worktree.id,
                    terminal,
                    agent,
                    timeout_ms,
                },
                &mut effects,
            )
            .await;
        match start {
            Ok(handle) => Ok(json!({
                "dispatchId": dispatch_id,
                "state": "ready",
                "stage": "ready",
                "runtimeEpoch": self.runtime_epoch,
                "worktreeId": worktree.id,
                "terminalHandle": handle,
                "setup": setup_not_applicable(),
                "effects": effects,
                "residualResources": [],
            })),
            Err(error) => {
                let reason = error.to_string();
                self.fail_remote_attachment(
                    &dispatch_id,
                    worker_failure_stage(&error),
                    &reason,
                    &effects,
                )
                .await?;
                Ok(json!({
                    "dispatchId": dispatch_id,
                    "state": "failed",
                    "stage": worker_failure_stage(&error),
                    "runtimeEpoch": self.runtime_epoch,
                    "failedStage": worker_failure_stage(&error),
                    "lastError": reason,
                    "setup": setup_not_applicable(),
                    "effects": effects,
                    "residualResources": effects,
                }))
            }
        }
    }

    async fn finish_remote_attachment(
        &self,
        launch: RemoteWorkerLaunch<'_>,
        effects: &mut Vec<Value>,
    ) -> Result<String, OrchestrationError> {
        let RemoteWorkerLaunch {
            input,
            dispatch_id,
            task_id,
            task_spec,
            worktree_id,
            terminal,
            agent,
            timeout_ms,
        } = launch;
        let handle = match terminal {
            Some(handle) => {
                effects.push(json!({
                    "kind": "terminal", "role": "agent", "action": "reused", "id": handle,
                }));
                handle
            }
            None => {
                let agent = agent.ok_or_else(|| {
                    OrchestrationError::domain("agent_unconfigured", "Missing configured agent.")
                })?;
                let startup = self
                    .terminals
                    .agent_startup(&format!("id:{worktree_id}"), &agent, None)
                    .await
                    .map_err(|error| {
                        OrchestrationError::domain("terminal_create_failed", error.to_string())
                    })?;
                let created = self
                    .terminals
                    .create(TerminalCreateRequest {
                        activate: false,
                        cols: 80,
                        command: Some(startup.command),
                        cwd: None,
                        cwd_fallback: false,
                        env: startup.environment,
                        env_to_delete: Vec::new(),
                        focus: false,
                        launch_agent: Some(agent),
                        launch_config: Some(startup.launch_config),
                        launch_token: None,
                        leaf_id: None,
                        presentation: Some(TerminalPresentation::Background),
                        rows: 24,
                        startup_command_delivery: startup.startup_command_delivery,
                        renderer_backed: false,
                        tab_id: None,
                        title: Some(format!("worker-{task_id}")),
                        split_direction: None,
                        split_from_leaf_id: None,
                        split_telemetry_source: None,
                        worktree: Some(format!("id:{worktree_id}")),
                    })
                    .await
                    .map_err(|error| {
                        OrchestrationError::domain("terminal_create_failed", error.to_string())
                    })?;
                effects.push(json!({
                    "kind": "terminal", "role": "agent", "action": "created", "id": created.handle,
                }));
                created.handle
            }
        };
        let wait = self
            .terminals
            .wait(
                &handle,
                WaitCondition::TuiIdle,
                Some(Duration::from_millis(timeout_ms)),
            )
            .await
            .map_err(|error| {
                OrchestrationError::domain("agent_readiness_failed", error.to_string())
            })?;
        if !wait.satisfied {
            return Err(OrchestrationError::domain(
                "agent_readiness_failed",
                wait.blocked_reason.map_or_else(
                    || format!("Agent did not become ready ({}).", wait.status),
                    |reason| format!("Agent startup blocked: {reason}"),
                ),
            ));
        }
        let (pane_key, incarnation) = self.terminal_identity(&handle).await?;
        let capability = random_capability()?;
        self.authorize_remote_attachment(RemoteAttachmentAuthorization {
            dispatch_id,
            worktree_id,
            handle: &handle,
            pane_key: &pane_key,
            incarnation: &incarnation,
            capability: &capability,
            effects,
        })
        .await?;
        let preamble = super::dispatch_preamble(
            task_id,
            dispatch_id,
            task_spec,
            "Run home (relayed by AgentStart)",
            &handle,
            Some(&capability),
            input.get("devMode").and_then(Value::as_bool) == Some(true),
        );
        let sent = self
            .terminals
            .send_guarded(
                TerminalSendRequest {
                    claim_viewport: false,
                    client: Some(TerminalClient {
                        id: "orchestration".to_owned(),
                        kind: TerminalClientType::Daemon,
                    }),
                    enter: true,
                    input_kind: None,
                    interrupt: false,
                    require_agent_sendable: false,
                    terminal: handle.clone(),
                    text: Some(preamble),
                    viewport: None,
                },
                "orchestration",
            )
            .await
            .map_err(|error| {
                OrchestrationError::domain("dispatch_input_failed", error.to_string())
            })?;
        if !sent.accepted {
            return Err(OrchestrationError::domain(
                "dispatch_input_refused",
                "Terminal refused the dispatch input.",
            ));
        }
        effects.push(json!({
            "kind": "dispatch_input", "role": "agent", "id": handle, "state": "accepted",
        }));
        let effects_json = encode(&*effects)?;
        let dispatch_id_for_store = dispatch_id.to_owned();
        self.store
            .execute(move |connection| {
                connection.execute(
                    "UPDATE remote_dispatch_attachments SET state='ready',stage='ready',
                       effects=?1,residual_resources='[]',updated_at=datetime('now')
                     WHERE dispatch_id=?2",
                    params![effects_json, dispatch_id_for_store],
                )?;
                Ok(Value::Null)
            })
            .await?;
        self.notify();
        Ok(handle)
    }

    async fn create_remote_attachment(
        &self,
        dispatch_id: &str,
        task_id: &str,
        fingerprint: &str,
        protocol_version: i64,
    ) -> Result<(), OrchestrationError> {
        let dispatch_id = dispatch_id.to_owned();
        let task_id = task_id.to_owned();
        let fingerprint = fingerprint.to_owned();
        let runtime_epoch = self.runtime_epoch.clone();
        self.store
            .execute(move |connection| {
                let existing = connection
                    .query_row(
                        "SELECT task_id,home_peer_fingerprint,protocol_version
                         FROM remote_dispatch_attachments WHERE dispatch_id=?1",
                        [&dispatch_id],
                        |row| {
                            Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, String>(1)?,
                                row.get::<_, i64>(2)?,
                            ))
                        },
                    )
                    .optional()?;
                if let Some((saved_task, saved_fingerprint, saved_protocol)) = existing {
                    if saved_task != task_id
                        || saved_fingerprint != fingerprint
                        || saved_protocol != protocol_version
                    {
                        return Err(OrchestrationError::domain(
                            "request_mismatch",
                            format!(
                                "Remote Dispatch {dispatch_id} already has a different attachment."
                            ),
                        ));
                    }
                    return Ok(Value::Null);
                }
                connection.execute(
                    "INSERT INTO remote_dispatch_attachments (
                       dispatch_id,task_id,home_peer_fingerprint,protocol_version,runtime_epoch
                     ) VALUES (?1,?2,?3,?4,?5)",
                    params![
                        dispatch_id,
                        task_id,
                        fingerprint,
                        protocol_version,
                        runtime_epoch
                    ],
                )?;
                Ok(Value::Null)
            })
            .await?;
        Ok(())
    }

    async fn authorize_remote_attachment(
        &self,
        authorization: RemoteAttachmentAuthorization<'_>,
    ) -> Result<(), OrchestrationError> {
        let RemoteAttachmentAuthorization {
            dispatch_id,
            worktree_id,
            handle,
            pane_key,
            incarnation,
            capability,
            effects,
        } = authorization;
        let dispatch_id = dispatch_id.to_owned();
        let worktree_id = worktree_id.to_owned();
        let handle = handle.to_owned();
        let pane_key = pane_key.to_owned();
        let incarnation = incarnation.to_owned();
        let hash = capability_hash(capability);
        let effects = encode(effects)?;
        self.store
            .execute(move |connection| {
                connection.execute(
                    "UPDATE remote_dispatch_attachments SET capability_hash=?1,pane_key=?2,
                       process_incarnation=?3,worktree_id=?4,terminal_handle=?5,
                       stage='dispatch_input',effects=?6,residual_resources=?6,
                       updated_at=datetime('now') WHERE dispatch_id=?7",
                    params![
                        hash,
                        pane_key,
                        incarnation,
                        worktree_id,
                        handle,
                        effects,
                        dispatch_id
                    ],
                )?;
                Ok(Value::Null)
            })
            .await?;
        Ok(())
    }

    async fn fail_remote_attachment(
        &self,
        dispatch_id: &str,
        stage: &str,
        reason: &str,
        effects: &[Value],
    ) -> Result<(), OrchestrationError> {
        let dispatch_id = dispatch_id.to_owned();
        let stage = stage.to_owned();
        let reason = reason.to_owned();
        let effects = encode(effects)?;
        self.store
            .execute(move |connection| {
                connection.execute(
                    "UPDATE remote_dispatch_attachments SET state='failed',stage=?1,last_error=?2,
                       effects=?3,residual_resources=?3,updated_at=datetime('now')
                     WHERE dispatch_id=?4",
                    params![stage, reason, effects, dispatch_id],
                )?;
                Ok(Value::Null)
            })
            .await?;
        self.notify();
        Ok(())
    }

    pub(super) async fn federation_pull(
        &self,
        body: Value,
        caller_fingerprint: Option<&str>,
    ) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let dispatch_id = require_string(input, "dispatchId")?.to_owned();
        self.require_remote_attachment(&dispatch_id, caller_fingerprint)
            .await?;
        let after = input
            .get("afterSequence")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        let limit = finite_i64(input, "limit", 100).clamp(1, 500);
        let dispatch_for_store = dispatch_id.clone();
        let items = self
            .store
            .execute(move |connection| {
                let mut statement = connection.prepare(
                    "SELECT dispatch_id,direction,sequence,message_id,kind,payload,byte_count,
                            acked_at,created_at FROM federation_relay_items
                     WHERE dispatch_id=?1 AND direction='to_home' AND sequence>?2
                     ORDER BY sequence LIMIT ?3",
                )?;
                let rows =
                    statement.query_map(params![dispatch_for_store, after, limit], relay_row)?;
                Ok(Value::Array(rows.collect::<Result<Vec<_>, _>>()?))
            })
            .await?;
        Ok(json!({
            "dispatchId": dispatch_id,
            "runtimeEpoch": self.runtime_epoch,
            "items": items,
        }))
    }

    pub(super) async fn federation_ack(
        &self,
        body: Value,
        caller_fingerprint: Option<&str>,
    ) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let dispatch_id = require_string(input, "dispatchId")?.to_owned();
        let through = input
            .get("throughSequence")
            .and_then(Value::as_i64)
            .filter(|value| *value >= 0)
            .ok_or_else(|| {
                OrchestrationError::domain("invalid_argument", "Invalid relay acknowledgement.")
            })?;
        self.require_remote_attachment(&dispatch_id, caller_fingerprint)
            .await?;
        let dispatch_for_store = dispatch_id.clone();
        self.store
            .execute(move |connection| {
                connection.execute(
                    "UPDATE federation_relay_items SET acked_at=COALESCE(acked_at,datetime('now'))
                     WHERE dispatch_id=?1 AND direction='to_home' AND sequence<=?2",
                    params![dispatch_for_store, through],
                )?;
                Ok(Value::Null)
            })
            .await?;
        Ok(json!({ "dispatchId": dispatch_id, "acknowledgedThrough": through }))
    }

    pub(super) async fn federation_import(
        &self,
        body: Value,
        caller_fingerprint: Option<&str>,
    ) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let dispatch_id = require_string(input, "dispatchId")?.to_owned();
        let initial_attachment = self
            .require_remote_attachment(&dispatch_id, caller_fingerprint)
            .await?;
        let items = input
            .get("items")
            .and_then(Value::as_array)
            .ok_or_else(|| {
                OrchestrationError::domain("invalid_argument", "Missing federation relay items.")
            })?;
        let mut cursor = initial_attachment
            .get("to_worker_imported_sequence")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        let mut imported = 0_u64;
        for item in items {
            let item = object(item)?;
            let item_dispatch = require_string(item, "dispatch_id")?;
            if require_string(item, "direction")? != "to_worker" {
                return Err(OrchestrationError::domain(
                    "invalid_argument",
                    "Federated import items must have direction=to_worker.",
                ));
            }
            let sequence = item
                .get("sequence")
                .and_then(Value::as_i64)
                .filter(|value| *value > 0)
                .ok_or_else(|| {
                    OrchestrationError::domain(
                        "invalid_argument",
                        "Relay item sequence is invalid.",
                    )
                })?;
            if item_dispatch != dispatch_id || sequence > cursor + 1 {
                return Err(OrchestrationError::domain(
                    "operation_unknown",
                    format!(
                        "Home relay for {dispatch_id} is not contiguous after sequence {cursor}."
                    ),
                ));
            }
            if sequence <= cursor {
                continue;
            }
            let current_attachment = self
                .require_remote_attachment(&dispatch_id, caller_fingerprint)
                .await?;
            if value_string(&current_attachment, "state").as_deref() != Some("ready") {
                return Err(OrchestrationError::domain(
                    "dispatch_inactive",
                    format!("Remote Dispatch {dispatch_id} is not active."),
                ));
            }
            let kind = require_string(item, "kind")?;
            let message_id = require_string(item, "message_id")?;
            let payload = require_string(item, "payload")?;
            match kind {
                "reply" => {
                    self.import_remote_reply(&dispatch_id, message_id, payload)
                        .await?
                }
                "control_message" => {
                    let protocol = current_attachment
                        .get("protocol_version")
                        .and_then(Value::as_i64)
                        .unwrap_or_default();
                    if protocol < FEDERATION_CONTROL_MAIL_PROTOCOL_VERSION {
                        return Err(OrchestrationError::domain(
                            "capability_unsupported",
                            format!(
                                "Remote Dispatch {dispatch_id} does not support coordinator control mail."
                            ),
                        ));
                    }
                    if self
                        .import_control_message(&dispatch_id, message_id, payload)
                        .await?
                    {
                        imported = imported.saturating_add(1);
                    }
                }
                other => {
                    return Err(OrchestrationError::domain(
                        "invalid_argument",
                        format!("Federated worker relay kind {other} is not supported."),
                    ));
                }
            }
            cursor = sequence;
            self.set_remote_import_sequence(&dispatch_id, cursor)
                .await?;
        }
        self.notify();
        Ok(json!({
            "dispatchId": dispatch_id,
            "acknowledgedThrough": cursor,
            "imported": imported,
        }))
    }

    pub(super) async fn federation_show(
        &self,
        body: Value,
        caller_fingerprint: Option<&str>,
    ) -> Result<Value, OrchestrationError> {
        let dispatch_id = require_string(object(&body)?, "dispatchId")?.to_owned();
        let attachment = self
            .require_remote_attachment(&dispatch_id, caller_fingerprint)
            .await?;
        let observation = self.observe_remote_attachment(&attachment).await;
        Ok(json!({
            "dispatchId": dispatch_id,
            "runtimeEpoch": self.runtime_epoch,
            "attachment": expose_remote_attachment(attachment),
            "terminal": if observation.1 { observation.0 } else { None },
            "observation": { "status": observation.2, "exactWorker": observation.1 },
        }))
    }

    pub(super) async fn federation_read(
        &self,
        body: Value,
        caller_fingerprint: Option<&str>,
    ) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let dispatch_id = require_string(input, "dispatchId")?.to_owned();
        let attachment = self
            .require_remote_attachment(&dispatch_id, caller_fingerprint)
            .await?;
        let observation = self.observe_remote_attachment(&attachment).await;
        if !observation.1 || observation.2 != "running" {
            return Err(OrchestrationError::domain(
                "worker_identity_changed",
                format!("Remote Dispatch {dispatch_id} no longer resolves to its exact process."),
            ));
        }
        let handle = value_string(&attachment, "terminal_handle").ok_or_else(|| {
            OrchestrationError::domain(
                "dispatch_not_found",
                "Remote worker terminal was not recorded.",
            )
        })?;
        let cursor = input.get("cursor").and_then(Value::as_u64);
        let terminal = self
            .terminals
            .read(&handle, cursor, finite_usize(input, "limit"))
            .await
            .map_err(|error| {
                OrchestrationError::domain("terminal_read_failed", error.to_string())
            })?;
        Ok(json!({
            "dispatchId": dispatch_id,
            "runtimeEpoch": self.runtime_epoch,
            "terminal": terminal,
        }))
    }

    pub(super) async fn federation_read_output(
        &self,
        body: Value,
        caller_fingerprint: Option<&str>,
    ) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let dispatch_id = require_string(input, "dispatchId")?.to_owned();
        let attachment = self
            .require_remote_attachment(&dispatch_id, caller_fingerprint)
            .await?;
        let observation = self.observe_remote_attachment(&attachment).await;
        if !observation.1 {
            return Err(OrchestrationError::domain(
                "worker_identity_changed",
                format!("Remote Dispatch {dispatch_id} no longer resolves to its exact process."),
            ));
        }
        let source = string(input, "source").unwrap_or_else(|| "auto".to_owned());
        if !matches!(source.as_str(), "auto" | "terminal" | "transcript") {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Worker output source must be auto, terminal, or transcript.",
            ));
        }
        let handle = value_string(&attachment, "terminal_handle").ok_or_else(|| {
            OrchestrationError::domain(
                "dispatch_not_found",
                "Remote worker terminal was not recorded.",
            )
        })?;
        let output = self
            .read_worker_terminal(
                input,
                &dispatch_id,
                &handle,
                &json!({ "state": value_string(&attachment, "state") }),
                &source,
            )
            .await?;
        Ok(json!({
            "dispatchId": dispatch_id,
            "runtimeEpoch": self.runtime_epoch,
            "output": output,
        }))
    }

    pub(super) async fn federation_stop(
        &self,
        body: Value,
        caller_fingerprint: Option<&str>,
    ) -> Result<Value, OrchestrationError> {
        let dispatch_id = require_string(object(&body)?, "dispatchId")?.to_owned();
        let attachment = self
            .require_remote_attachment(&dispatch_id, caller_fingerprint)
            .await?;
        let state = value_string(&attachment, "state").unwrap_or_default();
        if matches!(
            state.as_str(),
            "succeeded" | "failed" | "stopped" | "abandoned"
        ) {
            return Ok(settled_stop(&dispatch_id, &state));
        }
        let observation = self.observe_remote_attachment(&attachment).await;
        if !observation.1 || observation.2 != "running" {
            let reason = format!(
                "The recorded worker process is {}; no terminal was closed.",
                observation.2
            );
            self.set_remote_attachment_state(
                &dispatch_id,
                "stop_unknown",
                "stop_unknown",
                Some(&reason),
            )
            .await?;
            return Ok(json!({
                "dispatchId": dispatch_id,
                "state": "stop_unknown",
                "alreadySettled": false,
                "processAction": "none",
                "lastError": reason,
            }));
        }
        let handle = value_string(&attachment, "terminal_handle").ok_or_else(|| {
            OrchestrationError::domain(
                "dispatch_not_found",
                "Remote worker terminal was not recorded.",
            )
        })?;
        match self.terminals.close(&handle).await {
            Ok(was_running) => {
                self.set_remote_attachment_state(&dispatch_id, "stopped", "stopped", None)
                    .await?;
                Ok(json!({
                    "dispatchId": dispatch_id,
                    "state": "stopped",
                    "alreadySettled": false,
                    "processAction": "closed_agent_terminal",
                    "close": { "handle": handle, "wasRunning": was_running },
                }))
            }
            Err(error) => {
                let reason = error.to_string();
                self.set_remote_attachment_state(
                    &dispatch_id,
                    "stop_unknown",
                    "stop_unknown",
                    Some(&reason),
                )
                .await?;
                Ok(json!({
                    "dispatchId": dispatch_id,
                    "state": "stop_unknown",
                    "alreadySettled": false,
                    "processAction": "unknown",
                    "lastError": reason,
                }))
            }
        }
    }

    async fn require_remote_attachment(
        &self,
        dispatch_id: &str,
        caller_fingerprint: Option<&str>,
    ) -> Result<Value, OrchestrationError> {
        let dispatch_id = dispatch_id.to_owned();
        let caller = caller_fingerprint.map(str::to_owned);
        self.store
            .execute(move |connection| {
                let attachment = remote_attachment(connection, &dispatch_id)?;
                attachment
                    .filter(|attachment| {
                        value_string(attachment, "home_peer_fingerprint") == caller
                    })
                    .ok_or_else(|| {
                        OrchestrationError::domain(
                            "dispatch_not_found",
                            format!(
                                "Remote Dispatch {dispatch_id} was not found for this Run home."
                            ),
                        )
                    })
            })
            .await
    }

    async fn observe_remote_attachment(&self, attachment: &Value) -> TerminalObservation {
        let Some(handle) = value_string(attachment, "terminal_handle") else {
            return (None, false, "unattached");
        };
        let Ok(terminal) = self.terminals.show(&handle) else {
            return (None, false, "missing");
        };
        let pane = format!("{}:{}", terminal.summary.tab_id, terminal.summary.leaf_id);
        let exact = value_string(attachment, "pane_key")
            .is_some_and(|saved| crate::orchestration::pane_keys_match(&saved, &pane))
            && value_string(attachment, "process_incarnation").as_deref()
                == Some(&terminal.transport_generation);
        let status = if exact {
            if terminal.summary.connected {
                "running"
            } else {
                "exited"
            }
        } else {
            "identity_changed"
        };
        (serde_json::to_value(terminal).ok(), exact, status)
    }

    async fn set_remote_attachment_state(
        &self,
        dispatch_id: &str,
        state: &str,
        stage: &str,
        reason: Option<&str>,
    ) -> Result<(), OrchestrationError> {
        let dispatch_id = dispatch_id.to_owned();
        let state = state.to_owned();
        let stage = stage.to_owned();
        let reason = reason.map(str::to_owned);
        self.store
            .execute(move |connection| {
                connection.execute(
                    "UPDATE remote_dispatch_attachments SET state=?1,stage=?2,last_error=?3,
                       updated_at=datetime('now') WHERE dispatch_id=?4",
                    params![state, stage, reason, dispatch_id],
                )?;
                Ok(Value::Null)
            })
            .await?;
        self.notify();
        Ok(())
    }

    async fn import_remote_reply(
        &self,
        dispatch_id: &str,
        answer_message_id: &str,
        payload: &str,
    ) -> Result<(), OrchestrationError> {
        let payload: Value = serde_json::from_str(payload).map_err(|_| {
            OrchestrationError::domain(
                "invalid_argument",
                "Federated reply payload is invalid JSON.",
            )
        })?;
        let payload = object(&payload)?;
        let question_id = require_string(payload, "questionId")?.to_owned();
        let body = require_string(payload, "body")?.to_owned();
        let dispatch_id = dispatch_id.to_owned();
        let answer_message_id = answer_message_id.to_owned();
        self.store
            .execute(move |connection| {
                let changed = connection.execute(
                    "UPDATE remote_questions SET status='answered',answer_message_id=?1,
                       answer_body=?2,answered_at=datetime('now')
                     WHERE message_id=?3 AND dispatch_id=?4 AND status='pending'",
                    params![answer_message_id, body, question_id, dispatch_id],
                )?;
                if changed == 0 {
                    let current = connection
                        .query_row(
                            "SELECT answer_message_id,answer_body FROM remote_questions
                             WHERE message_id=?1 AND dispatch_id=?2",
                            params![question_id, dispatch_id],
                            |row| {
                                Ok((
                                    row.get::<_, Option<String>>(0)?,
                                    row.get::<_, Option<String>>(1)?,
                                ))
                            },
                        )
                        .optional()?;
                    if current != Some((Some(answer_message_id), Some(body))) {
                        return Err(OrchestrationError::domain(
                            "answer_conflict",
                            format!("Question {question_id} already has a different answer."),
                        ));
                    }
                }
                Ok(Value::Null)
            })
            .await?;
        Ok(())
    }

    async fn import_control_message(
        &self,
        dispatch_id: &str,
        message_id: &str,
        payload: &str,
    ) -> Result<bool, OrchestrationError> {
        let decoded: Value = serde_json::from_str(payload).map_err(|_| {
            OrchestrationError::domain(
                "invalid_argument",
                "Federated control message is invalid JSON.",
            )
        })?;
        let decoded = object(&decoded)?;
        let from = require_string(decoded, "from")?.to_owned();
        let subject = require_string(decoded, "subject")?.to_owned();
        let body = decoded
            .get("body")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                OrchestrationError::domain(
                    "invalid_argument",
                    "Federated control message is incomplete.",
                )
            })?
            .to_owned();
        let message_type = require_string(decoded, "type")?.to_owned();
        if !super::MESSAGE_TYPES.contains(&message_type.as_str()) {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Federated control message is incomplete.",
            ));
        }
        let priority = string(decoded, "priority")
            .filter(|value| matches!(value.as_str(), "high" | "urgent"))
            .unwrap_or_else(|| "normal".to_owned());
        let thread_id = string(decoded, "threadId");
        let inner_payload = string(decoded, "payload");
        let dispatch_id = dispatch_id.to_owned();
        let message_id = message_id.to_owned();
        self.store
            .execute(move |connection| {
                let existing = connection
                    .query_row(
                        "SELECT id,run_id,from_handle,to_handle,subject,body,type,priority,thread_id,
                                payload,read,sequence,created_at,delivered_at,sender_pane_key
                         FROM messages WHERE id=?1",
                        [&message_id],
                        message_row,
                    )
                    .optional()?;
                let recipient = format!("dispatch:{dispatch_id}");
                if let Some(existing) = existing {
                    let matches = value_string(&existing, "to_handle").as_deref() == Some(&recipient)
                        && value_string(&existing, "from_handle").as_deref() == Some(&from)
                        && value_string(&existing, "subject").as_deref() == Some(&subject)
                        && value_string(&existing, "body").as_deref() == Some(&body)
                        && value_string(&existing, "type").as_deref() == Some(&message_type)
                        && value_string(&existing, "priority").as_deref() == Some(&priority)
                        && value_string(&existing, "thread_id") == thread_id
                        && value_string(&existing, "payload") == inner_payload;
                    if !matches {
                        return Err(OrchestrationError::domain(
                            "request_mismatch",
                            format!("Federated control message {message_id} conflicts with an existing message."),
                        ));
                    }
                    return Ok(Value::Bool(false));
                }
                let mut message = Map::new();
                message.insert("id".to_owned(), Value::String(message_id));
                message.insert("from".to_owned(), Value::String(from));
                message.insert("to".to_owned(), Value::String(recipient));
                message.insert("subject".to_owned(), Value::String(subject));
                message.insert("body".to_owned(), Value::String(body));
                message.insert("type".to_owned(), Value::String(message_type));
                message.insert("priority".to_owned(), Value::String(priority));
                if let Some(thread_id) = thread_id {
                    message.insert("threadId".to_owned(), Value::String(thread_id));
                }
                if let Some(payload) = inner_payload {
                    message.insert("payload".to_owned(), Value::String(payload));
                }
                insert_message(connection, &message)?;
                Ok(Value::Bool(true))
            })
            .await?
            .as_bool()
            .ok_or_else(|| {
                OrchestrationError::domain("encoding_failed", "Relay import receipt was invalid.")
            })
    }

    async fn set_remote_import_sequence(
        &self,
        dispatch_id: &str,
        sequence: i64,
    ) -> Result<(), OrchestrationError> {
        let dispatch_id = dispatch_id.to_owned();
        self.store
            .execute(move |connection| {
                connection.execute(
                    "UPDATE remote_dispatch_attachments SET to_worker_imported_sequence=?1,
                       updated_at=datetime('now') WHERE dispatch_id=?2",
                    params![sequence, dispatch_id],
                )?;
                Ok(Value::Null)
            })
            .await?;
        Ok(())
    }
}

fn remote_attachment(
    connection: &rusqlite::Connection,
    dispatch_id: &str,
) -> Result<Option<Value>, OrchestrationError> {
    connection
        .query_row(
            "SELECT dispatch_id,task_id,home_peer_fingerprint,protocol_version,runtime_epoch,
                    capability_hash,pane_key,process_incarnation,state,stage,worktree_id,
                    terminal_handle,setup_state,effects,residual_resources,
                    to_worker_imported_sequence,last_error,created_at,updated_at
             FROM remote_dispatch_attachments WHERE dispatch_id=?1",
            [dispatch_id],
            remote_attachment_row,
        )
        .optional()
        .map_err(Into::into)
}

fn remote_attachment_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let effects = row.get::<_, String>(13)?;
    let residual = row.get::<_, String>(14)?;
    Ok(json!({
        "dispatch_id": row.get::<_, String>(0)?,
        "task_id": row.get::<_, String>(1)?,
        "home_peer_fingerprint": row.get::<_, String>(2)?,
        "protocol_version": row.get::<_, i64>(3)?,
        "runtime_epoch": row.get::<_, String>(4)?,
        "capability_hash": row.get::<_, Option<String>>(5)?,
        "pane_key": row.get::<_, Option<String>>(6)?,
        "process_incarnation": row.get::<_, Option<String>>(7)?,
        "state": row.get::<_, String>(8)?,
        "stage": row.get::<_, String>(9)?,
        "worktree_id": row.get::<_, Option<String>>(10)?,
        "terminal_handle": row.get::<_, Option<String>>(11)?,
        "setup_state": row.get::<_, String>(12)?,
        "effects": effects,
        "residual_resources": residual,
        "to_worker_imported_sequence": row.get::<_, i64>(15)?,
        "last_error": row.get::<_, Option<String>>(16)?,
        "created_at": row.get::<_, String>(17)?,
        "updated_at": row.get::<_, String>(18)?,
        "residualResources": parse_json(&row.get::<_, String>(14)?),
    }))
}

fn verify_remote_authority(
    attachment: &Value,
    pane_key: &str,
    process_incarnation: Option<&str>,
    capability: Option<&str>,
) -> Result<(), OrchestrationError> {
    let valid_pane = value_string(attachment, "pane_key")
        .is_some_and(|saved| crate::orchestration::pane_keys_match(&saved, pane_key));
    let valid_incarnation = value_string(attachment, "process_incarnation")
        .is_some_and(|saved| process_incarnation == Some(saved.as_str()));
    let valid_capability = value_string(attachment, "capability_hash").is_some_and(|expected| {
        capability.is_some_and(|capability| {
            let actual = capability_hash(capability);
            expected.as_bytes().ct_eq(actual.as_bytes()).unwrap_u8() == 1
        })
    });
    if valid_pane && valid_incarnation && valid_capability {
        return Ok(());
    }
    Err(OrchestrationError::domain(
        "dispatch_capability_invalid",
        "The remote Dispatch capability or exact worker process is invalid.",
    ))
}

fn expose_remote_attachment(mut attachment: Value) -> Value {
    if let Some(object) = attachment.as_object_mut() {
        let effects = object
            .get("effects")
            .and_then(Value::as_str)
            .map(parse_json)
            .unwrap_or_else(|| json!([]));
        object.insert("effects".to_owned(), effects);
    }
    attachment
}

fn relay_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "dispatch_id": row.get::<_, String>(0)?,
        "direction": row.get::<_, String>(1)?,
        "sequence": row.get::<_, i64>(2)?,
        "message_id": row.get::<_, String>(3)?,
        "kind": row.get::<_, String>(4)?,
        "payload": row.get::<_, String>(5)?,
        "byte_count": row.get::<_, i64>(6)?,
        "acked_at": row.get::<_, Option<String>>(7)?,
        "created_at": row.get::<_, String>(8)?,
    }))
}

fn setup_not_applicable() -> Value {
    json!({
        "requested": "not_applicable",
        "effective": "not_applicable",
        "source": "existing_worktree",
        "hookFound": false,
        "startupPolicy": "start-immediately",
        "state": "not_applicable",
    })
}

fn settled_stop(dispatch_id: &str, state: &str) -> Value {
    json!({
        "dispatchId": dispatch_id,
        "state": state,
        "alreadySettled": true,
        "processAction": "none",
    })
}

fn worker_failure_stage(error: &OrchestrationError) -> &'static str {
    match error.rpc_parts().map(|parts| parts.0) {
        Some("terminal_create_failed") => "terminal_create",
        Some("agent_readiness_failed") => "agent_readiness",
        Some("dispatch_input_failed" | "dispatch_input_refused") => "dispatch_input",
        _ => "worker_start",
    }
}

fn random_capability() -> Result<String, OrchestrationError> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|error| OrchestrationError::domain("entropy_unavailable", error.to_string()))?;
    Ok(format!(
        "dcap_{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
    ))
}

fn encode(value: impl serde::Serialize) -> Result<String, OrchestrationError> {
    serde_json::to_string(&value)
        .map_err(|error| OrchestrationError::domain("encoding_failed", error.to_string()))
}

fn finite_millis(input: &Map<String, Value>, key: &str, default: u64) -> u64 {
    input
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map(|value| value as u64)
        .unwrap_or(default)
}

fn finite_usize(input: &Map<String, Value>, key: &str) -> Option<usize> {
    input
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map(|value| value as usize)
}

fn finite_i64(input: &Map<String, Value>, key: &str, default: i64) -> i64 {
    input
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map(|value| value as i64)
        .unwrap_or(default)
}

fn terminal_source_identity(
    authority: &OrchestrationAuthority,
    handle: &str,
) -> Result<String, OrchestrationError> {
    let terminal = authority
        .terminals
        .show(handle)
        .map_err(|error| OrchestrationError::domain("terminal_not_found", error.to_string()))?;
    let identity = json!([
        "terminal",
        terminal.transport_generation,
        format!("{}:{}", terminal.summary.tab_id, terminal.summary.leaf_id),
    ]);
    let digest = Sha256::digest(encode(identity)?.as_bytes());
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)[..32].to_owned())
}

fn decode_cursor(
    value: Option<&Value>,
    dispatch_id: &str,
) -> Result<Option<WorkerOutputCursor>, OrchestrationError> {
    const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
    let Some(value) = value else {
        return Ok(None);
    };
    if let Some(position) = value
        .as_u64()
        .filter(|position| *position <= MAX_SAFE_INTEGER)
    {
        return Ok(Some(WorkerOutputCursor {
            source: WorkerOutputSource::Terminal,
            source_identity: None,
            position,
        }));
    }
    let Some(cursor) = value.as_str() else {
        return Err(invalid_cursor());
    };
    if cursor.bytes().all(|byte| byte.is_ascii_digit())
        && let Ok(position) = cursor.parse::<u64>()
        && position <= MAX_SAFE_INTEGER
    {
        return Ok(Some(WorkerOutputCursor {
            source: WorkerOutputSource::Terminal,
            source_identity: None,
            position,
        }));
    }
    if cursor.len() > 2_048 {
        return Err(invalid_cursor());
    }
    let encoded = cursor.strip_prefix("owr1_").ok_or_else(invalid_cursor)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| invalid_cursor())?;
    let decoded: Value = serde_json::from_slice(&bytes).map_err(|_| invalid_cursor())?;
    let object = decoded.as_object().ok_or_else(invalid_cursor)?;
    let cursor_dispatch = object.get("d").and_then(Value::as_str);
    let source = match object.get("s").and_then(Value::as_str) {
        Some("terminal") => WorkerOutputSource::Terminal,
        Some("transcript") => WorkerOutputSource::Transcript,
        _ => return Err(invalid_cursor()),
    };
    let identity = object.get("i").and_then(Value::as_str);
    let position = object.get("p").and_then(Value::as_u64);
    if object.get("v").and_then(Value::as_i64) != Some(1)
        || cursor_dispatch.is_none_or(|value| value.is_empty() || value.len() > 512)
        || identity.is_none_or(|value| value.is_empty() || value.len() > 128)
        || position.is_none_or(|value| value > MAX_SAFE_INTEGER)
    {
        return Err(invalid_cursor());
    }
    if cursor_dispatch != Some(dispatch_id) {
        return Err(OrchestrationError::domain(
            "cursor_dispatch_mismatch",
            "The worker-read cursor belongs to a different Dispatch.",
        ));
    }
    Ok(Some(WorkerOutputCursor {
        source,
        source_identity: identity.map(str::to_owned),
        position: position.unwrap_or_default(),
    }))
}

fn encode_cursor(
    dispatch_id: &str,
    source_identity: &str,
    position: u64,
) -> Result<String, OrchestrationError> {
    let payload = encode(json!({
        "v": 1,
        "d": dispatch_id,
        "s": "terminal",
        "i": source_identity,
        "p": position,
    }))?;
    Ok(format!(
        "owr1_{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload)
    ))
}

fn invalid_cursor() -> OrchestrationError {
    OrchestrationError::domain("cursor_invalid", "The worker-read cursor is invalid.")
}

fn source_changed() -> OrchestrationError {
    OrchestrationError::domain(
        "source_changed",
        "The worker output source changed. Start a fresh worker-read without the old cursor.",
    )
}

fn transcript_required(dispatch_id: &str) -> OrchestrationError {
    OrchestrationError::domain_with_data(
        "transcript_required",
        format!(
            "Structured output is unavailable for Dispatch {dispatch_id}: provider_unsupported."
        ),
        json!({ "reason": "provider_unsupported" }),
    )
}

fn redact_dispatch_capabilities(lines: &mut [String]) -> bool {
    let mut redacted = false;
    for line in lines {
        let mut scan_from = 0;
        let mut output = String::with_capacity(line.len());
        while let Some(relative_start) = line[scan_from..].find("dcap_") {
            let start = scan_from + relative_start;
            let has_boundary = start == 0
                || (!line.as_bytes()[start - 1].is_ascii_alphanumeric()
                    && line.as_bytes()[start - 1] != b'_');
            let token_start = start + "dcap_".len();
            let token_length = line.as_bytes()[token_start..]
                .iter()
                .take_while(|byte| byte.is_ascii_alphanumeric() || matches!(**byte, b'_' | b'-'))
                .count();
            if has_boundary && token_length >= 20 {
                output.push_str(&line[scan_from..start]);
                output.push_str("[dispatch capability redacted]");
                scan_from = token_start + token_length;
                redacted = true;
            } else {
                output.push_str(&line[scan_from..token_start]);
                scan_from = token_start;
            }
        }
        output.push_str(&line[scan_from..]);
        *line = output;
    }
    redacted
}

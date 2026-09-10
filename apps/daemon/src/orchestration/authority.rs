#[path = "authority/agent-context.rs"]
mod agent_context;
mod workers;

use std::sync::Arc;
use std::time::Duration;

use base64::Engine;
use rusqlite::{OptionalExtension, params};
use serde_json::{Map, Value, json};
use subtle::ConstantTimeEq;
use tokio::sync::watch;

use crate::terminal_session::{
    TerminalClient, TerminalClientType, TerminalSendRequest, TerminalSessionAuthority,
};
use crate::worktrees::WorktreeCatalog;

use super::schema::LEGACY_RUN_ID;
use super::{
    OrchestrationError, OrchestrationStore, active_dispatch_for_identity, capability_hash,
    find_dispatch, find_run, find_task, gate_row, insert_message, latest_dispatch_for_task,
    list_messages, mark_read, message_row, object, pane_keys_match, promote_ready_tasks,
    question_row, random_prefixed_id, require_current_run_for_pane, require_string, run_row,
    string, task_row, value_i64, value_string,
};

const ASK_DEFAULT_TIMEOUT_MS: u64 = 600_000;
const ASK_MAX_TIMEOUT_MS: u64 = 1_800_000;
const CHECK_DEFAULT_TIMEOUT_MS: u64 = 30_000;
const MAX_MESSAGE_LIMIT: usize = 100;
const MESSAGE_TYPES: &[&str] = &[
    "status",
    "dispatch",
    "worker_done",
    "merge_ready",
    "escalation",
    "handoff",
    "decision_gate",
    "question",
    "heartbeat",
];
const TASK_STATUSES: &[&str] = &[
    "pending",
    "ready",
    "dispatched",
    "completed",
    "failed",
    "blocked",
];

struct RunMailboxCheck {
    input: Map<String, Value>,
    mailbox: Value,
    types: Vec<String>,
    show_all: bool,
    peek: bool,
    should_wait: bool,
    format: bool,
}

#[derive(Clone)]
pub(crate) struct OrchestrationAuthority {
    pub(super) runtime_epoch: String,
    pub(super) store: OrchestrationStore,
    pub(super) terminals: TerminalSessionAuthority,
    pub(super) worktrees: WorktreeCatalog,
    revision: Arc<watch::Sender<u64>>,
}

impl OrchestrationAuthority {
    pub(crate) fn new(
        store: OrchestrationStore,
        terminals: TerminalSessionAuthority,
        worktrees: WorktreeCatalog,
        runtime_epoch: String,
    ) -> Self {
        let (revision, _) = watch::channel(0);
        Self {
            runtime_epoch,
            store,
            terminals,
            worktrees,
            revision: Arc::new(revision),
        }
    }

    pub(crate) async fn invoke(
        &self,
        method: &str,
        body: Value,
        capability: Option<&str>,
        caller_fingerprint: Option<&str>,
    ) -> Result<Value, OrchestrationError> {
        match method {
            "orchestration.runCreate" => self.run_create(body).await,
            "orchestration.runUse" => self.run_use(body).await,
            "orchestration.runCurrent" => self.run_current(body).await,
            "orchestration.runList" => self.run_list(body).await,
            "orchestration.runShow" => self.run_show(body).await,
            "orchestration.taskCreate" => self.task_create(body).await,
            "orchestration.taskList" => self.task_list(body).await,
            "orchestration.taskUpdate" => self.task_update(body).await,
            "orchestration.dispatch" => self.dispatch_task(body).await,
            "orchestration.dispatchShow" => self.dispatch_show(body).await,
            "orchestration.send" => self.send_message(body, capability).await,
            "orchestration.check" => self.check_messages(body).await,
            "orchestration.reply" => self.reply(body).await,
            "orchestration.inbox" => self.inbox(body).await,
            "orchestration.ask" => self.ask(body, capability).await,
            "orchestration.gateCreate" => self.gate_create(body).await,
            "orchestration.gateResolve" => self.gate_resolve(body).await,
            "orchestration.gateList" => self.gate_list(body).await,
            "orchestration.reset" => self.reset(body).await,
            "orchestration.workerStart" => self.worker_start(body).await,
            "orchestration.workerShow" => self.worker_show(body).await,
            "orchestration.workerRead" => self.worker_read(body).await,
            "orchestration.workerStop" => self.worker_stop(body).await,
            "orchestration.workerAbandon" => self.worker_abandon(body).await,
            "orchestration.federationAttachStart" => {
                self.federation_attach_start(body, caller_fingerprint).await
            }
            "orchestration.federationPull" => self.federation_pull(body, caller_fingerprint).await,
            "orchestration.federationAck" => self.federation_ack(body, caller_fingerprint).await,
            "orchestration.federationImport" => {
                self.federation_import(body, caller_fingerprint).await
            }
            "orchestration.federationShow" => self.federation_show(body, caller_fingerprint).await,
            "orchestration.federationRead" => self.federation_read(body, caller_fingerprint).await,
            "orchestration.federationReadOutput" => {
                self.federation_read_output(body, caller_fingerprint).await
            }
            "orchestration.federationStop" => self.federation_stop(body, caller_fingerprint).await,
            "orchestration.run" | "orchestration.runStop" => Err(OrchestrationError::domain(
                "orchestration_migration_required",
                "This orchestration command is retired. Use run-create/run-use and explicit worker operations.",
            )),
            _ => Err(OrchestrationError::domain(
                "method_not_found",
                format!("Unknown orchestration method {method}"),
            )),
        }
    }

    pub(crate) async fn begin_mutation(
        &self,
        fingerprint: String,
        request_id: String,
        method: String,
        payload_hash: String,
    ) -> Result<Value, OrchestrationError> {
        self.store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                let existing = transaction
                    .query_row(
                        "SELECT method,payload_hash,state,receipt FROM mutation_receipts
                         WHERE caller_fingerprint=?1 AND request_id=?2",
                        params![fingerprint, request_id],
                        |row| {
                            Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, String>(1)?,
                                row.get::<_, String>(2)?,
                                row.get::<_, Option<String>>(3)?,
                            ))
                        },
                    )
                    .optional()?;
                if let Some((stored_method, stored_hash, state, receipt)) = existing {
                    if stored_method != method || stored_hash != payload_hash {
                        return Err(OrchestrationError::domain(
                            "request_mismatch",
                            format!(
                                "Mutation request {request_id} was already used with different input."
                            ),
                        ));
                    }
                    transaction.commit()?;
                    return Ok(json!({ "disposition": state, "receipt": receipt }));
                }
                transaction.execute(
                    "INSERT INTO mutation_receipts (
                       caller_fingerprint,request_id,method,payload_hash,state
                     ) VALUES (?1,?2,?3,?4,'pending')",
                    params![fingerprint, request_id, method, payload_hash],
                )?;
                transaction.commit()?;
                Ok(json!({ "disposition": "started", "receipt": null }))
            })
            .await
    }

    pub(crate) async fn complete_mutation(
        &self,
        fingerprint: String,
        request_id: String,
        method: String,
        payload_hash: String,
        receipt: Value,
    ) -> Result<(), OrchestrationError> {
        let encoded = serde_json::to_string(&receipt)
            .map_err(|error| OrchestrationError::domain("encoding_failed", error.to_string()))?;
        self.store
            .execute(move |connection| {
                let changed = connection.execute(
                    "UPDATE mutation_receipts SET state='completed',receipt=?1,
                       updated_at=datetime('now')
                     WHERE caller_fingerprint=?2 AND request_id=?3 AND method=?4 AND payload_hash=?5",
                    params![encoded, fingerprint, request_id, method, payload_hash],
                )?;
                if changed != 1 {
                    return Err(OrchestrationError::domain(
                        "request_mismatch",
                        "Mutation receipt no longer matches the pending operation.",
                    ));
                }
                Ok(Value::Null)
            })
            .await?;
        Ok(())
    }

    pub(crate) async fn discard_mutation(&self, fingerprint: String, request_id: String) {
        let _ = self
            .store
            .execute(move |connection| {
                connection.execute(
                    "DELETE FROM mutation_receipts
                     WHERE caller_fingerprint=?1 AND request_id=?2 AND state='pending'",
                    params![fingerprint, request_id],
                )?;
                Ok(Value::Null)
            })
            .await;
    }

    fn notify(&self) {
        self.revision
            .send_modify(|revision| *revision = revision.saturating_add(1));
    }

    async fn terminal_identity(
        &self,
        handle: &str,
    ) -> Result<(String, String), OrchestrationError> {
        let terminal = self.terminals.show(handle).map_err(|_| {
            OrchestrationError::domain(
                "stable_pane_required",
                "The terminal has no stable pane identity. Run this command inside a live AgentStart terminal.",
            )
        })?;
        Ok((
            format!("{}:{}", terminal.summary.tab_id, terminal.summary.leaf_id),
            terminal.transport_generation,
        ))
    }

    async fn resolve_run(
        &self,
        input: &Map<String, Value>,
        caller_key: &str,
        require_current: bool,
    ) -> Result<Value, OrchestrationError> {
        let explicit = string(input, "run");
        let caller = string(input, caller_key);
        let pane = match caller.as_deref() {
            Some(handle) => Some(self.terminal_identity(handle).await?.0),
            None => None,
        };
        self.store
            .execute(move |connection| {
                let explicit_run = match explicit.as_deref() {
                    Some(id) => find_run(connection, id)?,
                    None => None,
                };
                if explicit.is_some()
                    && explicit_run
                        .as_ref()
                        .is_none_or(|run| value_i64(run, "legacy") == Some(1))
                {
                    return Err(OrchestrationError::domain(
                        "run_not_found",
                        format!("Run {} was not found.", explicit.unwrap_or_default()),
                    ));
                }
                if !require_current && let Some(run) = explicit_run {
                    return Ok(run);
                }
                let Some(pane) = pane else {
                    return Err(run_required());
                };
                let current = require_current_run_for_pane(connection, &pane)?;
                if let Some(explicit_run) = explicit_run
                    && value_string(&current, "id") != value_string(&explicit_run, "id")
                {
                    return Err(OrchestrationError::domain(
                        "consumer_fenced",
                        format!(
                            "This coordinator terminal is bound to {}, not {}.",
                            value_string(&current, "id").unwrap_or_default(),
                            value_string(&explicit_run, "id").unwrap_or_default()
                        ),
                    ));
                }
                Ok(current)
            })
            .await
    }

    async fn run_create(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let objective = require_string(input, "objective")?.to_owned();
        let from = require_string(input, "from")?.to_owned();
        let pane = self.terminal_identity(&from).await?.0;
        let output = self
            .store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                let mut statement = transaction.prepare(
                    "SELECT id,coordinator_pane_key FROM runs
                     WHERE coordinator_pane_key IS NOT NULL AND legacy=0",
                )?;
                let bound = statement
                    .query_map([], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                drop(statement);
                for (id, current_pane) in bound {
                    if pane_keys_match(&current_pane, &pane) {
                        transaction.execute(
                            "UPDATE runs SET coordinator_handle=NULL,coordinator_pane_key=NULL,
                               consumer_generation=consumer_generation+1,updated_at=datetime('now')
                             WHERE id=?1",
                            [&id],
                        )?;
                        transaction.execute(
                            "UPDATE deliveries SET status='fenced'
                             WHERE run_id=?1 AND status='outstanding'",
                            [&id],
                        )?;
                    }
                }
                let id = random_prefixed_id("run")?;
                transaction.execute(
                    "INSERT INTO runs (
                       id,objective,coordinator_handle,coordinator_pane_key,
                       consumer_generation,legacy
                     ) VALUES (?1,?2,?3,?4,1,0)",
                    params![id, objective, from, pane],
                )?;
                let run = find_run(&transaction, &id)?.ok_or_else(|| {
                    OrchestrationError::domain("run_not_found", "Created Run was not found.")
                })?;
                transaction.commit()?;
                Ok(json!({
                    "binding": { "consumerGeneration": value_i64(&run, "consumer_generation") },
                    "run": run
                }))
            })
            .await?;
        self.notify();
        Ok(output)
    }

    async fn run_use(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let id = require_string(input, "id")?.to_owned();
        let from = require_string(input, "from")?.to_owned();
        let pane = self.terminal_identity(&from).await?.0;
        let target = self
            .store
            .execute({
                let id = id.clone();
                move |connection| Ok(find_run(connection, &id)?.unwrap_or(Value::Null))
            })
            .await?;
        if let Some(bound_handle) = value_string(&target, "coordinator_handle")
            && let Ok(bound_terminal) = self.terminals.show(&bound_handle)
        {
            let bound_pane = format!(
                "{}:{}",
                bound_terminal.summary.tab_id, bound_terminal.summary.leaf_id
            );
            if !pane_keys_match(&bound_pane, &pane) {
                return Err(OrchestrationError::domain(
                    "run_in_use",
                    format!("Run {id} is already bound to another live coordinator."),
                ));
            }
        }
        let output = self
            .store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                let current =
                    find_run(&transaction, &id)?.filter(|run| value_i64(run, "legacy") != Some(1));
                let Some(current) = current else {
                    return Err(OrchestrationError::domain(
                        "run_not_found",
                        format!("Run {id} was not found or is inspect-only."),
                    ));
                };
                let mut statement = transaction.prepare(
                    "SELECT id,coordinator_pane_key FROM runs
                     WHERE coordinator_pane_key IS NOT NULL AND legacy=0",
                )?;
                let bound = statement
                    .query_map([], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                drop(statement);
                let same_binding = value_string(&current, "coordinator_pane_key")
                    .is_some_and(|candidate| pane_keys_match(&candidate, &pane));
                for (other_id, other_pane) in bound {
                    if other_id != id && pane_keys_match(&other_pane, &pane) {
                        transaction.execute(
                            "UPDATE runs SET coordinator_handle=NULL,coordinator_pane_key=NULL,
                               consumer_generation=consumer_generation+1,updated_at=datetime('now')
                             WHERE id=?1",
                            [&other_id],
                        )?;
                        transaction.execute(
                            "UPDATE deliveries SET status='fenced'
                             WHERE run_id=?1 AND status='outstanding'",
                            [&other_id],
                        )?;
                    }
                }
                if !same_binding
                    || value_string(&current, "coordinator_handle").as_deref()
                        != Some(from.as_str())
                {
                    transaction.execute(
                        "UPDATE runs SET coordinator_handle=?1,coordinator_pane_key=?2,
                           consumer_generation=consumer_generation+1,updated_at=datetime('now')
                         WHERE id=?3",
                        params![from, pane, id],
                    )?;
                    transaction.execute(
                        "UPDATE deliveries SET status='fenced'
                         WHERE run_id=?1 AND status='outstanding'",
                        [&id],
                    )?;
                }
                let run = find_run(&transaction, &id)?.ok_or_else(|| {
                    OrchestrationError::domain("run_not_found", format!("Run {id} was not found."))
                })?;
                transaction.commit()?;
                Ok(json!({
                    "binding": { "consumerGeneration": value_i64(&run, "consumer_generation") },
                    "run": run
                }))
            })
            .await?;
        self.notify();
        Ok(output)
    }

    async fn run_current(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let from = require_string(input, "from")?;
        let pane = self.terminal_identity(from).await?.0;
        self.store
            .execute(
                move |connection| match require_current_run_for_pane(connection, &pane) {
                    Ok(run) => Ok(json!({ "run": run })),
                    Err(OrchestrationError::Domain {
                        code: "run_required",
                        ..
                    }) => Ok(json!({ "run": null })),
                    Err(error) => Err(error),
                },
            )
            .await
    }

    async fn run_list(&self, body: Value) -> Result<Value, OrchestrationError> {
        object(&body)?;
        self.store
            .execute(|connection| {
                let mut statement = connection.prepare(
                    "SELECT id,objective,home_database,coordinator_handle,coordinator_pane_key,
                            consumer_generation,legacy,created_at,updated_at
                     FROM runs ORDER BY created_at DESC",
                )?;
                let runs = statement
                    .query_map([], run_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(json!({ "runs": runs }))
            })
            .await
    }

    async fn run_show(&self, body: Value) -> Result<Value, OrchestrationError> {
        let id = require_string(object(&body)?, "id")?.to_owned();
        self.store
            .execute(move |connection| {
                let run = find_run(connection, &id)?.ok_or_else(|| {
                    OrchestrationError::domain("run_not_found", format!("Run {id} was not found."))
                })?;
                Ok(json!({ "run": run }))
            })
            .await
    }

    async fn task_create(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?.clone();
        let spec = require_string(&input, "spec")?.to_owned();
        let deps = parse_string_array_json(string(&input, "deps"), "deps")?;
        let run = self
            .resolve_run(&input, "callerTerminalHandle", true)
            .await?;
        let run_id = value_string(&run, "id").ok_or_else(run_required)?;
        let parent = string(&input, "parent");
        let task_title = string(&input, "taskTitle");
        let display_name = string(&input, "displayName");
        let creator = string(&input, "callerTerminalHandle");
        let output = self
            .store
            .execute(move |connection| {
                if let Some(parent) = &parent {
                    let parent_run = find_task(connection, parent)?
                        .and_then(|task| value_string(&task, "run_id"));
                    if parent_run.as_deref() != Some(&run_id) {
                        return Err(OrchestrationError::domain(
                            "invalid_argument",
                            format!("Parent task {parent} must belong to Run {run_id}."),
                        ));
                    }
                }
                for dependency in &deps {
                    let dependency_run = find_task(connection, dependency)?
                        .and_then(|task| value_string(&task, "run_id"));
                    if dependency_run.as_deref() != Some(&run_id) {
                        return Err(OrchestrationError::domain(
                            "invalid_argument",
                            format!("Dependency task {dependency} must belong to Run {run_id}."),
                        ));
                    }
                }
                let id = random_prefixed_id("task")?;
                let deps_json = serde_json::to_string(&deps).map_err(|error| {
                    OrchestrationError::domain("encoding_failed", error.to_string())
                })?;
                let title = normalized_title(task_title.as_deref(), &spec, 80);
                let display = normalized_title(display_name.as_deref(), &title, 160);
                let status = if deps.is_empty() { "ready" } else { "pending" };
                connection.execute(
                    "INSERT INTO tasks (
                       id,run_id,parent_id,created_by_terminal_handle,task_title,display_name,
                       spec,status,deps
                     ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                    params![
                        id, run_id, parent, creator, title, display, spec, status, deps_json
                    ],
                )?;
                let task = find_task(connection, &id)?.ok_or_else(|| {
                    OrchestrationError::domain("task_not_found", "Created Task was not found.")
                })?;
                Ok(json!({ "task": task }))
            })
            .await?;
        self.notify();
        Ok(output)
    }

    async fn task_list(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?.clone();
        let run = self
            .resolve_run(&input, "callerTerminalHandle", input.get("run").is_none())
            .await?;
        let run_id = value_string(&run, "id").ok_or_else(run_required)?;
        let legacy = value_i64(&run, "legacy") == Some(1);
        let status =
            string(&input, "status").filter(|value| TASK_STATUSES.contains(&value.as_str()));
        let ready = input.get("ready").and_then(Value::as_bool) == Some(true);
        let brief = input.get("brief").and_then(Value::as_bool) == Some(true);
        self.store
            .execute(move |connection| {
                let mut statement = connection.prepare(
                    "SELECT t.id,t.run_id,t.parent_id,t.created_by_terminal_handle,t.task_title,
                            t.display_name,t.spec,t.status,t.deps,t.result,t.created_at,t.completed_at,
                            d.assignee_handle,d.id
                     FROM tasks t
                     LEFT JOIN dispatch_contexts d ON d.rowid=(
                       SELECT latest.rowid FROM dispatch_contexts latest
                       WHERE latest.task_id=t.id AND latest.status IN ('pending','dispatched')
                       ORDER BY latest.rowid DESC LIMIT 1
                     )
                     WHERE t.run_id=?1 ORDER BY t.created_at",
                )?;
                let rows = statement.query_map([&run_id], |row| {
                    let mut task = task_row(row)?;
                    let task_status = task.get("status").and_then(Value::as_str).unwrap_or_default();
                    if task_status == "dispatched" && let Some(object) = task.as_object_mut() {
                        object.insert("assignee_handle".to_owned(), row.get::<_, Option<String>>(12)?.map(Value::String).unwrap_or(Value::Null));
                        object.insert("dispatch_id".to_owned(), row.get::<_, Option<String>>(13)?.map(Value::String).unwrap_or(Value::Null));
                    }
                    Ok(task)
                })?;
                let mut tasks = rows.collect::<Result<Vec<_>, _>>()?;
                tasks.retain(|task| {
                    let task_status = task.get("status").and_then(Value::as_str);
                    (!ready || task_status == Some("ready"))
                        && status.as_deref().is_none_or(|value| task_status == Some(value))
                });
                if brief {
                    for task in &mut tasks {
                        abbreviate_task(task);
                    }
                }
                Ok(json!({
                    "count": tasks.len(),
                    "legacyReadOnly": legacy,
                    "runId": run_id,
                    "tasks": tasks,
                }))
            })
            .await
    }

    async fn task_update(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?.clone();
        let id = require_string(&input, "id")?.to_owned();
        let status = require_string(&input, "status")?.to_owned();
        if !TASK_STATUSES.contains(&status.as_str()) {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Missing --status",
            ));
        }
        let result = string(&input, "result");
        let run = self
            .resolve_run(&input, "callerTerminalHandle", true)
            .await?;
        let run_id = value_string(&run, "id").ok_or_else(run_required)?;
        let output = self
            .store
            .execute(move |connection| {
                let task = find_task(connection, &id)?;
                if task.as_ref().and_then(|task| value_string(task, "run_id")).as_deref()
                    != Some(&run_id)
                {
                    return Err(OrchestrationError::domain(
                        "task_not_found",
                        format!("Task {id} was not found in Run {run_id}."),
                    ));
                }
                let transaction = connection.transaction()?;
                transaction.execute(
                    "UPDATE tasks SET status=?1,result=COALESCE(?2,result),
                       completed_at=CASE WHEN ?1 IN ('completed','failed') THEN datetime('now')
                                         ELSE completed_at END WHERE id=?3",
                    params![status, result, id],
                )?;
                if status == "completed" {
                    transaction.execute(
                        "UPDATE dispatch_contexts SET status='completed',completed_at=datetime('now'),
                           capability_revoked_at=COALESCE(capability_revoked_at,datetime('now'))
                         WHERE id=(SELECT id FROM dispatch_contexts WHERE task_id=?1
                           AND status IN ('pending','dispatched') ORDER BY rowid DESC LIMIT 1)",
                        [&id],
                    )?;
                    promote_ready_tasks(&transaction, &id)?;
                }
                let task = find_task(&transaction, &id)?.ok_or_else(|| {
                    OrchestrationError::domain("task_not_found", format!("Task {id} was not found."))
                })?;
                transaction.commit()?;
                Ok(json!({ "task": task }))
            })
            .await?;
        self.notify();
        Ok(output)
    }

    async fn dispatch_task(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?.clone();
        let task_id = require_string(&input, "task")?.to_owned();
        let run = self.resolve_run(&input, "from", true).await?;
        let run_id = value_string(&run, "id").ok_or_else(run_required)?;
        let to = string(&input, "to");
        let from = string(&input, "from").unwrap_or_else(|| "coordinator".to_owned());
        let dry_run = input.get("dryRun").and_then(Value::as_bool) == Some(true);
        let inject = input.get("inject").and_then(Value::as_bool) == Some(true);
        let return_preamble = input.get("returnPreamble").and_then(Value::as_bool) == Some(true);
        let dev_mode = input.get("devMode").and_then(Value::as_bool) == Some(true);
        let task = self
            .store
            .execute({
                let task_id = task_id.clone();
                move |connection| {
                    find_task(connection, &task_id)?.ok_or_else(|| {
                        OrchestrationError::domain(
                            "task_not_found",
                            format!("Task {task_id} was not found."),
                        )
                    })
                }
            })
            .await?;
        if value_string(&task, "run_id").as_deref() != Some(&run_id) {
            return Err(OrchestrationError::domain(
                "task_not_found",
                format!("Task {task_id} was not found in Run {run_id}."),
            ));
        }
        let task_spec = value_string(&task, "spec").unwrap_or_default();
        if dry_run {
            return Ok(json!({
                "dispatch": null,
                "dryRun": true,
                "injected": false,
                "preamble": dispatch_preamble(&task_id, "ctx_dryrun", &task_spec, &from, to.as_deref().unwrap_or("worker"), None, dev_mode),
            }));
        }
        let to =
            to.ok_or_else(|| OrchestrationError::domain("invalid_argument", "Missing --to"))?;
        if value_string(&task, "status").as_deref() != Some("ready") {
            return Err(OrchestrationError::domain(
                "task_not_startable",
                format!(
                    "Task {task_id} is {}; only ready Tasks can be dispatched.",
                    value_string(&task, "status").unwrap_or_default()
                ),
            ));
        }
        let terminal = self.terminals.show(&to).ok();
        if inject {
            if terminal.is_none() {
                return Err(OrchestrationError::domain(
                    "terminal_not_found",
                    format!("Terminal {to} was not found."),
                ));
            }
            let status = self.terminals.agent_status(&to).map_err(|error| {
                OrchestrationError::domain("terminal_not_found", error.to_string())
            })?;
            if !status.is_running_agent {
                return Err(OrchestrationError::domain(
                    "agent_unconfigured",
                    format!(
                        "Cannot dispatch --inject to terminal {to}: no recognized agent detected."
                    ),
                ));
            }
        }
        let pane = terminal
            .as_ref()
            .map(|terminal| format!("{}:{}", terminal.summary.tab_id, terminal.summary.leaf_id));
        let incarnation = terminal.map(|terminal| terminal.transport_generation);
        let capability = inject.then(random_capability).transpose()?;
        let capability_hash_value = capability.as_deref().map(capability_hash);
        let to_for_store = to.clone();
        let task_id_for_store = task_id.clone();
        let output = self
            .store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                if active_dispatch_for_identity(&transaction, &to_for_store, pane.as_deref())?
                    .is_some()
                {
                    return Err(OrchestrationError::domain(
                        "dispatch_inactive",
                        format!("Terminal {to_for_store} already has an active Dispatch."),
                    ));
                }
                let id = random_prefixed_id("ctx")?;
                let failures = transaction.query_row(
                    "SELECT COALESCE(MAX(failure_count),0) FROM dispatch_contexts WHERE task_id=?1",
                    [&task_id_for_store],
                    |row| row.get::<_, i64>(0),
                )?;
                transaction.execute(
                    "INSERT INTO dispatch_contexts (
                       id,run_id,task_id,assignee_handle,assignee_pane_key,capability_hash,
                       process_incarnation,status,failure_count,dispatched_at
                     ) VALUES (?1,?2,?3,?4,?5,?6,?7,'dispatched',?8,datetime('now'))",
                    params![
                        id,
                        run_id,
                        task_id_for_store,
                        to_for_store,
                        pane,
                        capability_hash_value,
                        incarnation,
                        failures
                    ],
                )?;
                transaction.execute(
                    "UPDATE tasks SET status='dispatched' WHERE id=?1",
                    [&task_id_for_store],
                )?;
                let dispatch = find_dispatch(&transaction, &id)?.ok_or_else(|| {
                    OrchestrationError::domain(
                        "dispatch_not_found",
                        "Created Dispatch was not found.",
                    )
                })?;
                transaction.commit()?;
                Ok(dispatch)
            })
            .await?;
        let dispatch_id = value_string(&output, "id").unwrap_or_default();
        let preamble = dispatch_preamble(
            &task_id,
            &dispatch_id,
            &task_spec,
            &from,
            &to,
            capability.as_deref(),
            dev_mode,
        );
        let mut injected = false;
        if inject {
            let result = self
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
                        terminal: to,
                        text: Some(preamble.clone()),
                        viewport: None,
                    },
                    "orchestration",
                )
                .await;
            match result {
                Ok(result) if result.accepted => injected = true,
                Ok(_) => {
                    self.fail_dispatch(&dispatch_id, "Terminal refused the dispatch input.")
                        .await?;
                    return Err(OrchestrationError::domain(
                        "dispatch_input_refused",
                        "Terminal refused the dispatch input.",
                    ));
                }
                Err(error) => {
                    self.fail_dispatch(&dispatch_id, &error.to_string()).await?;
                    return Err(OrchestrationError::domain(
                        "dispatch_input_failed",
                        error.to_string(),
                    ));
                }
            }
        }
        self.notify();
        let mut result = json!({ "dispatch": output, "injected": injected });
        if return_preamble {
            result["preamble"] = Value::String(preamble);
        }
        Ok(result)
    }

    async fn dispatch_show(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?.clone();
        let task_id = require_string(&input, "task")?.to_owned();
        let show_preamble = input.get("preamble").and_then(Value::as_bool) == Some(true);
        let from = string(&input, "from").unwrap_or_else(|| "coordinator".to_owned());
        let dev_mode = input.get("devMode").and_then(Value::as_bool) == Some(true);
        self.store
            .execute(move |connection| {
                let dispatch = latest_dispatch_for_task(connection, &task_id)?;
                if !show_preamble {
                    return Ok(json!({ "dispatch": dispatch }));
                }
                let task = find_task(connection, &task_id)?.ok_or_else(|| {
                    OrchestrationError::domain("task_not_found", format!("Task {task_id} was not found."))
                })?;
                let worker = dispatch
                    .as_ref()
                    .and_then(|value| value_string(value, "assignee_handle"))
                    .unwrap_or_else(|| "worker".to_owned());
                let dispatch_id = dispatch
                    .as_ref()
                    .and_then(|value| value_string(value, "id"))
                    .unwrap_or_else(|| "ctx_preview".to_owned());
                Ok(json!({
                    "dispatch": dispatch,
                    "preamble": dispatch_preamble(&task_id, &dispatch_id, &value_string(&task, "spec").unwrap_or_default(), &from, &worker, None, dev_mode),
                }))
            })
            .await
    }

    async fn send_message(
        &self,
        body: Value,
        capability: Option<&str>,
    ) -> Result<Value, OrchestrationError> {
        let input = object(&body)?.clone();
        let subject = require_string(&input, "subject")?.to_owned();
        let from = string(&input, "from").unwrap_or_else(|| "unknown".to_owned());
        let message_type = string(&input, "type").unwrap_or_else(|| "status".to_owned());
        if !MESSAGE_TYPES.contains(&message_type.as_str()) {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Message type is invalid.",
            ));
        }
        let priority = string(&input, "priority").unwrap_or_else(|| "normal".to_owned());
        if !matches!(priority.as_str(), "normal" | "high" | "urgent") {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Message priority is invalid.",
            ));
        }
        let mut to = string(&input, "to");
        if matches!(message_type.as_str(), "worker_done" | "heartbeat")
            && to.as_deref().is_some_and(|target| target.starts_with('@'))
        {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                format!("{message_type} messages cannot target a group address."),
            ));
        }
        if to
            .as_deref()
            .is_some_and(|target| target.starts_with("task:"))
        {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Task recipients are unsupported; use run:<id> or dispatch:<id>.",
            ));
        }
        let pane_identity = self.terminal_identity(&from).await.ok();
        let pane = pane_identity.as_ref().map(|identity| identity.0.clone());
        let incarnation = pane_identity.as_ref().map(|identity| identity.1.clone());
        if let Some(remote) = self
            .relay_remote_worker_message(
                &input,
                &from,
                pane.as_deref(),
                incarnation.as_deref(),
                capability,
            )
            .await?
        {
            return Ok(remote);
        }
        let payload = string(&input, "payload");
        let requested_run = string(&input, "run");
        let capability = capability.map(str::to_owned);
        let routing = self
            .store
            .execute({
                let from = from.clone();
                let pane = pane.clone();
                let payload = payload.clone();
                let to = to.clone();
                move |connection| {
                    let payload_dispatch = payload.as_deref().and_then(|payload| {
                        serde_json::from_str::<Value>(payload)
                            .ok()
                            .and_then(|value| value_string(&value, "dispatchId"))
                    });
                    let target_dispatch = to
                        .as_deref()
                        .and_then(|target| target.strip_prefix("dispatch:"))
                        .map(str::to_owned);
                    let dispatch_id = payload_dispatch.or(target_dispatch);
                    let dispatch = match dispatch_id.as_deref() {
                        Some(id) => find_dispatch(connection, id)?,
                        None => active_dispatch_for_identity(connection, &from, pane.as_deref())?,
                    };
                    if to
                        .as_deref()
                        .is_some_and(|target| target.starts_with("dispatch:"))
                        && dispatch.is_none()
                    {
                        return Err(OrchestrationError::domain(
                            "dispatch_not_found",
                            format!(
                                "Dispatch {} was not found.",
                                dispatch_id.unwrap_or_default()
                            ),
                        ));
                    }
                    let target_run = to
                        .as_deref()
                        .and_then(|target| target.strip_prefix("run:"))
                        .map(str::to_owned);
                    let resolved_run = requested_run.clone().or(target_run.clone()).or_else(|| {
                        dispatch
                            .as_ref()
                            .and_then(|value| value_string(value, "run_id"))
                    });
                    let run = match resolved_run.as_deref() {
                        Some(id) => find_run(connection, id)?
                            .filter(|run| value_i64(run, "legacy") != Some(1)),
                        None => pane
                            .as_deref()
                            .and_then(|pane| require_current_run_for_pane(connection, pane).ok()),
                    };
                    if resolved_run.is_some() && run.is_none() {
                        return Err(OrchestrationError::domain(
                            "run_not_found",
                            format!("Run {} was not found.", resolved_run.unwrap_or_default()),
                        ));
                    }
                    if let (Some(run), Some(dispatch)) = (&run, &dispatch)
                        && value_string(run, "id") != value_string(dispatch, "run_id")
                    {
                        return Err(OrchestrationError::domain(
                            "dispatch_run_mismatch",
                            "The Dispatch does not belong to the selected Run.",
                        ));
                    }
                    Ok(json!({ "dispatch": dispatch, "run": run }))
                }
            })
            .await?;
        let dispatch = routing
            .get("dispatch")
            .filter(|value| !value.is_null())
            .cloned();
        let run = routing.get("run").filter(|value| !value.is_null()).cloned();
        let dispatch_id = dispatch
            .as_ref()
            .and_then(|value| value_string(value, "id"));
        let run_id = run.as_ref().and_then(|value| value_string(value, "id"));
        if run_id.is_some()
            && (to.is_none()
                || (matches!(message_type.as_str(), "worker_done" | "heartbeat")
                    && dispatch_id.is_some()))
        {
            to = run_id.as_ref().map(|id| format!("run:{id}"));
        }
        let to = to.ok_or_else(run_required)?;
        if to.starts_with('@') {
            let recipients = self.resolve_group(&to, &from).await?;
            if recipients.is_empty() {
                return Err(OrchestrationError::domain(
                    "no_recipients",
                    format!("No recipients resolved for group address: {to}"),
                ));
            }
            let thread = string(&input, "threadId").unwrap_or_else(|| {
                epoch_thread_id().unwrap_or_else(|_| "thread_unknown".to_owned())
            });
            let mut messages = Vec::with_capacity(recipients.len());
            for recipient in recipients {
                let mut message = input.clone();
                message.insert("from".to_owned(), Value::String(from.clone()));
                message.insert("to".to_owned(), Value::String(recipient));
                message.insert("threadId".to_owned(), Value::String(thread.clone()));
                if let Some(run_id) = &run_id {
                    message.insert("runId".to_owned(), Value::String(run_id.clone()));
                }
                let stored = self
                    .store
                    .execute(move |connection| insert_message(connection, &message))
                    .await?;
                messages.push(stored);
            }
            self.notify();
            return Ok(json!({ "messages": messages, "recipients": messages.len() }));
        }
        let lifecycle_rejection = if let Some(dispatch) = &dispatch
            && value_string(dispatch, "capability_hash").is_some()
            && matches!(message_type.as_str(), "worker_done" | "heartbeat")
        {
            verify_dispatch_authority(
                dispatch,
                &from,
                pane.as_deref(),
                incarnation.as_deref(),
                capability.as_deref(),
            )
            .err()
            .map(|error| error.to_string())
        } else {
            None
        };
        let mut message = input;
        message.insert("from".to_owned(), Value::String(from));
        message.insert("to".to_owned(), Value::String(to));
        message.insert("subject".to_owned(), Value::String(subject));
        message.insert("type".to_owned(), Value::String(message_type.clone()));
        message.insert("priority".to_owned(), Value::String(priority));
        if let Some(pane) = pane {
            message.insert("senderPaneKey".to_owned(), Value::String(pane));
        }
        if let Some(run_id) = run_id {
            message.insert("runId".to_owned(), Value::String(run_id));
        }
        let output = self
            .store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                let stored = insert_message(&transaction, &message)?;
                let lifecycle = match lifecycle_rejection {
                    Some(reason) => reject_lifecycle(
                        &transaction,
                        &stored,
                        "dispatch_capability_invalid",
                        &reason,
                    )?,
                    None => reconcile_lifecycle(&transaction, &stored)?,
                };
                let stored = connection_message(
                    &transaction,
                    value_string(&stored, "id").as_deref().unwrap_or_default(),
                )?
                .unwrap_or(stored);
                transaction.commit()?;
                Ok(match lifecycle {
                    Some(lifecycle) => json!({ "lifecycle": lifecycle, "message": stored }),
                    None => json!({ "message": stored }),
                })
            })
            .await?;
        self.notify();
        Ok(output)
    }

    async fn check_messages(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?.clone();
        let handle = string(&input, "terminal").unwrap_or_else(|| "unknown".to_owned());
        let types = parse_message_types(string(&input, "types"))?;
        let show_all = input.get("all").and_then(Value::as_bool) == Some(true)
            || (input.get("unread").and_then(Value::as_bool) == Some(false)
                && input.get("peek").and_then(Value::as_bool) != Some(true));
        let peek = input.get("peek").and_then(Value::as_bool) == Some(true);
        let should_wait = input.get("wait").and_then(Value::as_bool) == Some(true);
        let format = input.get("format").and_then(Value::as_bool) == Some(true)
            || input.get("inject").and_then(Value::as_bool) == Some(true);
        let explicit_run = string(&input, "run");
        let explicit_pane = string(&input, "terminalPaneKey");
        let pane = self
            .terminal_identity(&handle)
            .await
            .ok()
            .map(|identity| identity.0)
            .or(explicit_pane);
        let mut mailbox = self
            .store
            .execute({
                let handle = handle.clone();
                let pane = pane.clone();
                move |connection| {
                    let bound = pane
                        .as_deref()
                        .and_then(|pane| require_current_run_for_pane(connection, pane).ok());
                    if let Some(run_id) = explicit_run {
                        let run = find_run(connection, &run_id)?
                            .filter(|run| value_i64(run, "legacy") != Some(1));
                        let Some(run) = run else {
                            return Err(OrchestrationError::domain(
                                "run_not_found",
                                format!("Run {run_id} was not found."),
                            ));
                        };
                        if bound
                            .as_ref()
                            .and_then(|value| value_string(value, "id"))
                            .as_deref()
                            != Some(&run_id)
                        {
                            return Err(OrchestrationError::domain(
                                "consumer_fenced",
                                format!("This terminal is not bound to Run {run_id}."),
                            ));
                        }
                        return Ok(json!({ "kind": "run", "run": run }));
                    }
                    if let Some(run) = bound {
                        return Ok(json!({ "kind": "run", "run": run }));
                    }
                    if let Some(dispatch) =
                        active_dispatch_for_identity(connection, &handle, pane.as_deref())?
                    {
                        return Ok(json!({ "dispatch": dispatch, "kind": "dispatch" }));
                    }
                    Ok(json!({ "address": handle, "kind": "legacy" }))
                }
            })
            .await?;
        if mailbox.get("kind").and_then(Value::as_str) == Some("legacy")
            && let Some(pane) = pane.as_deref()
            && let Some(attachment) = self.active_remote_attachment(pane).await?
        {
            let current_incarnation = self
                .terminal_identity(&handle)
                .await
                .ok()
                .map(|identity| identity.1);
            if value_string(&attachment, "process_incarnation") != current_incarnation {
                return Err(OrchestrationError::domain(
                    "dispatch_inactive",
                    format!(
                        "Dispatch {} is no longer attached to this worker process.",
                        value_string(&attachment, "dispatch_id").unwrap_or_default()
                    ),
                ));
            }
            mailbox = json!({
                "kind": "dispatch",
                "dispatch": {
                    "id": value_string(&attachment, "dispatch_id"),
                    "run_id": null,
                },
            });
        }
        if mailbox.get("kind").and_then(Value::as_str) == Some("run") {
            return self
                .check_run_mailbox(RunMailboxCheck {
                    input,
                    mailbox,
                    types,
                    show_all,
                    peek,
                    should_wait,
                    format,
                })
                .await;
        }
        let (address, dispatch_id, run_id) =
            if mailbox.get("kind").and_then(Value::as_str) == Some("dispatch") {
                let dispatch = mailbox.get("dispatch").cloned().unwrap_or(Value::Null);
                let id = value_string(&dispatch, "id").unwrap_or_default();
                (
                    format!("dispatch:{id}"),
                    Some(id),
                    value_string(&dispatch, "run_id"),
                )
            } else {
                (handle, None, None)
            };
        let consume = !show_all && !peek;
        let mut revision = self.revision.subscribe();
        loop {
            let address_for_query = address.clone();
            let types_for_query = types.clone();
            let messages = self
                .store
                .execute(move |connection| {
                    let messages = list_messages(
                        connection,
                        Some(&address_for_query),
                        !show_all,
                        &types_for_query,
                        MAX_MESSAGE_LIMIT,
                        !show_all,
                    )?;
                    if consume
                        && messages.iter().any(|message| {
                            value_string(message, "run_id").as_deref() == Some(LEGACY_RUN_ID)
                        })
                    {
                        return Err(OrchestrationError::domain_with_data(
                            "legacy_read_only",
                            "Legacy orchestration messages are inspect-only; use --peek or --all.",
                            json!({ "effectsApplied": false }),
                        ));
                    }
                    if consume {
                        let ids = messages
                            .iter()
                            .filter_map(|message| value_string(message, "id"))
                            .collect::<Vec<_>>();
                        mark_read(connection, &ids)?;
                    }
                    Ok(Value::Array(messages))
                })
                .await?;
            let messages = messages.as_array().cloned().unwrap_or_default();
            if !messages.is_empty() || !should_wait {
                return Ok(check_result(
                    messages,
                    run_id,
                    dispatch_id,
                    format,
                    false,
                    false,
                ));
            }
            let timeout = finite_millis(&input, "timeoutMs", CHECK_DEFAULT_TIMEOUT_MS);
            if tokio::time::timeout(Duration::from_millis(timeout), revision.changed())
                .await
                .is_err()
            {
                return Ok(check_result(
                    Vec::new(),
                    run_id,
                    dispatch_id,
                    format,
                    true,
                    false,
                ));
            }
        }
    }

    async fn check_run_mailbox(&self, check: RunMailboxCheck) -> Result<Value, OrchestrationError> {
        let RunMailboxCheck {
            input,
            mailbox,
            types,
            show_all,
            peek,
            should_wait,
            format,
        } = check;
        let run = mailbox.get("run").cloned().unwrap_or(Value::Null);
        let run_id = value_string(&run, "id").ok_or_else(run_required)?;
        let generation = value_i64(&run, "consumer_generation").unwrap_or_default();
        let acknowledged = string(&input, "ack");
        let mut revision = self.revision.subscribe();
        loop {
            let run_id_query = run_id.clone();
            let types_query = types.clone();
            let ack_query = acknowledged.clone();
            let output = self
                .store
                .execute(move |connection| {
                    let transaction = connection.transaction()?;
                    let current = find_run(&transaction, &run_id_query)?;
                    if current.as_ref().and_then(|run| value_i64(run, "consumer_generation"))
                        != Some(generation)
                    {
                        return Err(OrchestrationError::domain(
                            "consumer_fenced",
                            "This mailbox consumer was replaced.",
                        ));
                    }
                    let mut acknowledged_id = None;
                    if let Some(ack) = ack_query {
                        let delivery = transaction
                            .query_row(
                                "SELECT run_id,consumer_generation,status,message_ids
                                 FROM deliveries WHERE id=?1",
                                [&ack],
                                |row| {
                                    Ok((
                                        row.get::<_, String>(0)?,
                                        row.get::<_, i64>(1)?,
                                        row.get::<_, String>(2)?,
                                        row.get::<_, String>(3)?,
                                    ))
                                },
                            )
                            .optional()?;
                        let Some((delivery_run, delivery_generation, status, ids)) = delivery else {
                            return Err(OrchestrationError::domain(
                                "stale_delivery",
                                format!("Delivery {ack} does not belong to this Run."),
                            ));
                        };
                        if delivery_run != run_id_query || delivery_generation != generation || status == "fenced" {
                            return Err(OrchestrationError::domain(
                                "consumer_fenced",
                                "This mailbox Delivery belongs to a fenced consumer generation.",
                            ));
                        }
                        if status != "acknowledged" {
                            let ids = serde_json::from_str::<Vec<String>>(&ids).unwrap_or_default();
                            mark_read(&transaction, &ids)?;
                            transaction.execute(
                                "UPDATE deliveries SET status='acknowledged',acknowledged_at=datetime('now') WHERE id=?1",
                                [&ack],
                            )?;
                        }
                        acknowledged_id = Some(ack);
                    }
                    let address = format!("run:{run_id_query}");
                    if show_all || peek {
                        let mut messages = list_messages(
                            &transaction,
                            Some(&address),
                            peek,
                            &types_query,
                            MAX_MESSAGE_LIMIT,
                            false,
                        )?;
                        messages.retain(|message| value_string(message, "run_id").as_deref() == Some(&run_id_query));
                        transaction.commit()?;
                        return Ok(json!({
                            "acknowledged": acknowledged_id,
                            "deliveryId": null,
                            "messages": messages,
                            "replayed": false,
                        }));
                    }
                    let existing = transaction
                        .query_row(
                            "SELECT id,message_ids FROM deliveries
                             WHERE run_id=?1 AND status='outstanding'",
                            [&run_id_query],
                            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                        )
                        .optional()?;
                    if let Some((delivery_id, ids)) = existing {
                        let ids = serde_json::from_str::<Vec<String>>(&ids).unwrap_or_default();
                        let messages = messages_by_ids(&transaction, &ids)?;
                        transaction.commit()?;
                        return Ok(json!({
                            "acknowledged": acknowledged_id,
                            "deliveryId": delivery_id,
                            "messages": messages,
                            "replayed": true,
                        }));
                    }
                    let mut messages = list_messages(
                        &transaction,
                        Some(&address),
                        true,
                        &types_query,
                        50,
                        true,
                    )?;
                    messages.retain(|message| value_string(message, "run_id").as_deref() == Some(&run_id_query));
                    if messages.is_empty() {
                        transaction.commit()?;
                        return Ok(json!({
                            "acknowledged": acknowledged_id,
                            "deliveryId": null,
                            "messages": [],
                            "replayed": false,
                        }));
                    }
                    let delivery_id = random_prefixed_id("delivery")?;
                    let ids = messages.iter().filter_map(|message| value_string(message, "id")).collect::<Vec<_>>();
                    let ids_json = serde_json::to_string(&ids).map_err(|error| OrchestrationError::domain("encoding_failed", error.to_string()))?;
                    transaction.execute(
                        "INSERT INTO deliveries (id,run_id,consumer_generation,message_ids)
                         VALUES (?1,?2,?3,?4)",
                        params![delivery_id, run_id_query, generation, ids_json],
                    )?;
                    transaction.commit()?;
                    Ok(json!({
                        "acknowledged": acknowledged_id,
                        "deliveryId": delivery_id,
                        "messages": messages,
                        "replayed": false,
                    }))
                })
                .await?;
            let messages = output
                .get("messages")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if !messages.is_empty() || !should_wait {
                let mut result = check_result(messages, Some(run_id), None, format, false, false);
                result["deliveryId"] = output.get("deliveryId").cloned().unwrap_or(Value::Null);
                result["replayed"] = output
                    .get("replayed")
                    .cloned()
                    .unwrap_or(Value::Bool(false));
                result["acknowledged"] = output.get("acknowledged").cloned().unwrap_or(Value::Null);
                return Ok(result);
            }
            let timeout = finite_millis(&input, "timeoutMs", CHECK_DEFAULT_TIMEOUT_MS);
            if tokio::time::timeout(Duration::from_millis(timeout), revision.changed())
                .await
                .is_err()
            {
                let mut result = check_result(Vec::new(), Some(run_id), None, format, true, false);
                result["deliveryId"] = Value::Null;
                result["acknowledged"] = output.get("acknowledged").cloned().unwrap_or(Value::Null);
                return Ok(result);
            }
        }
    }

    async fn inbox(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let terminal = string(input, "terminal");
        let limit = finite_usize(input, "limit", 20).min(MAX_MESSAGE_LIMIT);
        self.store
            .execute(move |connection| {
                let messages =
                    list_messages(connection, terminal.as_deref(), false, &[], limit, false)?;
                Ok(json!({ "count": messages.len(), "messages": messages }))
            })
            .await
    }

    async fn reply(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?.clone();
        let id = require_string(&input, "id")?.to_owned();
        let reply_body = require_string(&input, "body")?.to_owned();
        let original = self
            .store
            .execute({
                let id = id.clone();
                move |connection| {
                    connection_message(connection, &id)?.ok_or_else(|| {
                        OrchestrationError::domain(
                            "message_not_found",
                            format!("Message {id} was not found."),
                        )
                    })
                }
            })
            .await?;
        if value_string(&original, "run_id").as_deref() == Some(LEGACY_RUN_ID) {
            return Err(OrchestrationError::domain_with_data(
                "legacy_read_only",
                "Legacy orchestration messages are inspect-only; no reply was applied.",
                json!({ "effectsApplied": false }),
            ));
        }
        let question = self
            .store
            .execute({
                let id = id.clone();
                move |connection| {
                    let question = connection
                        .query_row(
                            "SELECT message_id,run_id,dispatch_id,asker_handle,status,
                                    answer_message_id,answer_body,answered_by_generation,
                                    created_at,answered_at,closed_at
                             FROM question_threads WHERE message_id=?1",
                            [&id],
                            question_row,
                        )
                        .optional()?;
                    Ok(question.unwrap_or(Value::Null))
                }
            })
            .await?;
        if !question.is_null() {
            let run_id = value_string(&question, "run_id").ok_or_else(run_required)?;
            let mut scoped = input.clone();
            scoped
                .entry("run".to_owned())
                .or_insert(Value::String(run_id.clone()));
            let run = self.resolve_run(&scoped, "from", true).await?;
            let generation = value_i64(&run, "consumer_generation").unwrap_or_default();
            let output = self
                .store
                .execute(move |connection| {
                    let transaction = connection.transaction()?;
                    let current = transaction.query_row(
                        "SELECT message_id,run_id,dispatch_id,asker_handle,status,
                                answer_message_id,answer_body,answered_by_generation,
                                created_at,answered_at,closed_at
                         FROM question_threads WHERE message_id=?1",
                        [&id],
                        question_row,
                    )?;
                    match value_string(&current, "status").as_deref() {
                        Some("closed") => return Err(OrchestrationError::domain("dispatch_inactive", format!("Question {id} is closed."))),
                        Some("answered") => {
                            if value_string(&current, "answer_body").as_deref() != Some(&reply_body) {
                                return Err(OrchestrationError::domain("answer_conflict", format!("Question {id} already has a different answer.")));
                            }
                            let answer_id = value_string(&current, "answer_message_id").unwrap_or_default();
                            let message = connection_message(&transaction, &answer_id)?.ok_or_else(|| OrchestrationError::domain("message_not_found", "Recorded answer message is missing."))?;
                            transaction.commit()?;
                            return Ok(json!({ "duplicate": true, "message": message, "question": current }));
                        }
                        _ => {}
                    }
                    let mut message_input = Map::new();
                    message_input.insert("from".to_owned(), Value::String(format!("run:{run_id}")));
                    message_input.insert("to".to_owned(), Value::String(format!("dispatch:{}", value_string(&current, "dispatch_id").unwrap_or_default())));
                    message_input.insert("subject".to_owned(), Value::String("Re: Question".to_owned()));
                    message_input.insert("body".to_owned(), Value::String(reply_body.clone()));
                    message_input.insert("threadId".to_owned(), Value::String(id.clone()));
                    message_input.insert("runId".to_owned(), Value::String(run_id));
                    let message = insert_message(&transaction, &message_input)?;
                    let message_id = value_string(&message, "id").unwrap_or_default();
                    mark_read(&transaction, std::slice::from_ref(&message_id))?;
                    transaction.execute(
                        "UPDATE question_threads SET status='answered',answer_message_id=?1,
                           answer_body=?2,answered_by_generation=?3,answered_at=datetime('now')
                         WHERE message_id=?4 AND status='pending'",
                        params![message_id, reply_body, generation, id],
                    )?;
                    let answered = transaction.query_row(
                        "SELECT message_id,run_id,dispatch_id,asker_handle,status,
                                answer_message_id,answer_body,answered_by_generation,
                                created_at,answered_at,closed_at
                         FROM question_threads WHERE message_id=?1",
                        [&id],
                        question_row,
                    )?;
                    transaction.commit()?;
                    Ok(json!({ "duplicate": false, "message": message, "question": answered }))
                })
                .await?;
            self.notify();
            return Ok(output);
        }
        let output = self
            .store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                mark_read(&transaction, std::slice::from_ref(&id))?;
                let mut message = Map::new();
                message.insert(
                    "from".to_owned(),
                    Value::String(string(&input, "from").unwrap_or_else(|| {
                        value_string(&original, "to_handle").unwrap_or_default()
                    })),
                );
                message.insert(
                    "to".to_owned(),
                    Value::String(value_string(&original, "from_handle").unwrap_or_default()),
                );
                message.insert(
                    "subject".to_owned(),
                    Value::String(format!(
                        "Re: {}",
                        value_string(&original, "subject").unwrap_or_default()
                    )),
                );
                message.insert("body".to_owned(), Value::String(reply_body));
                message.insert(
                    "threadId".to_owned(),
                    Value::String(value_string(&original, "thread_id").unwrap_or(id)),
                );
                message.insert(
                    "runId".to_owned(),
                    Value::String(
                        value_string(&original, "run_id")
                            .unwrap_or_else(|| LEGACY_RUN_ID.to_owned()),
                    ),
                );
                let reply = insert_message(&transaction, &message)?;
                transaction.commit()?;
                Ok(json!({ "message": reply }))
            })
            .await?;
        self.notify();
        Ok(output)
    }

    async fn ask(
        &self,
        body: Value,
        capability: Option<&str>,
    ) -> Result<Value, OrchestrationError> {
        let input = object(&body)?.clone();
        let question_text = string(&input, "question");
        let resume = string(&input, "resume");
        if question_text.is_some() == resume.is_some() {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Choose exactly one of --question or --resume.",
            ));
        }
        if string(&input, "to").is_some_and(|target| target.starts_with('@')) {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "ask does not support group addresses.",
            ));
        }
        let from = string(&input, "from").unwrap_or_else(|| "unknown".to_owned());
        let (pane, incarnation) = self.terminal_identity(&from).await?;
        if let Some(remote) = self
            .ask_remote_worker(&input, &from, &pane, &incarnation, capability)
            .await?
        {
            return Ok(remote);
        }
        let active = self
            .store
            .execute({
                let from = from.clone();
                let pane = pane.clone();
                move |connection| {
                    active_dispatch_for_identity(connection, &from, Some(&pane))?.ok_or_else(|| {
                        OrchestrationError::domain(
                            "dispatch_inactive",
                            "ask requires an active supervised Dispatch.",
                        )
                    })
                }
            })
            .await?;
        if value_string(&active, "capability_hash").is_some() {
            verify_dispatch_authority(&active, &from, Some(&pane), Some(&incarnation), capability)?;
        }
        let dispatch_id = value_string(&active, "id").unwrap_or_default();
        let run_id = value_string(&active, "run_id").unwrap_or_default();
        if let Some(requested_run) = string(&input, "run")
            && requested_run != run_id
        {
            return Err(OrchestrationError::domain(
                "dispatch_run_mismatch",
                format!("Dispatch {dispatch_id} belongs to Run {run_id}, not {requested_run}."),
            ));
        }
        let options = string(&input, "options")
            .map(|value| {
                value
                    .split(',')
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let question = if let Some(resume) = resume {
            self.store
                .execute({
                    let dispatch_id = dispatch_id.clone();
                    move |connection| {
                        let current = connection
                            .query_row(
                                "SELECT message_id,run_id,dispatch_id,asker_handle,status,
                                        answer_message_id,answer_body,answered_by_generation,
                                        created_at,answered_at,closed_at
                                 FROM question_threads WHERE message_id=?1",
                                [&resume],
                                question_row,
                            )
                            .optional()?;
                        current
                            .filter(|value| {
                                value_string(value, "dispatch_id").as_deref() == Some(&dispatch_id)
                            })
                            .ok_or_else(|| {
                                OrchestrationError::domain(
                                    "question_not_found",
                                    format!(
                                        "Question {resume} does not belong to this active Dispatch."
                                    ),
                                )
                            })
                    }
                })
                .await?
        } else {
            let text = question_text.unwrap_or_default();
            let output = self
                .store
                .execute({
                    let dispatch_id = dispatch_id.clone();
                    let run_id = run_id.clone();
                    let from = from.clone();
                    move |connection| {
                        let transaction = connection.transaction()?;
                        let message_id = random_prefixed_id("msg")?;
                        let payload = serde_json::to_string(&json!({
                            "dispatchId": dispatch_id,
                            "options": options,
                            "question": text,
                            "taskId": value_string(&active, "task_id"),
                        })).map_err(|error| OrchestrationError::domain("encoding_failed", error.to_string()))?;
                        let mut message_input = Map::new();
                        message_input.insert("id".to_owned(), Value::String(message_id.clone()));
                        message_input.insert("from".to_owned(), Value::String(format!("dispatch:{dispatch_id}")));
                        message_input.insert("to".to_owned(), Value::String(format!("run:{run_id}")));
                        message_input.insert("subject".to_owned(), Value::String("Question".to_owned()));
                        message_input.insert("body".to_owned(), Value::String(text));
                        message_input.insert("type".to_owned(), Value::String("question".to_owned()));
                        message_input.insert("payload".to_owned(), Value::String(payload));
                        message_input.insert("runId".to_owned(), Value::String(run_id.clone()));
                        insert_message(&transaction, &message_input)?;
                        transaction.execute("UPDATE messages SET thread_id=?1 WHERE id=?1", [&message_id])?;
                        transaction.execute(
                            "INSERT INTO question_threads (message_id,run_id,dispatch_id,asker_handle)
                             VALUES (?1,?2,?3,?4)",
                            params![message_id, run_id, dispatch_id, from],
                        )?;
                        let question = transaction.query_row(
                            "SELECT message_id,run_id,dispatch_id,asker_handle,status,
                                    answer_message_id,answer_body,answered_by_generation,
                                    created_at,answered_at,closed_at
                             FROM question_threads WHERE message_id=?1",
                            [&message_id],
                            question_row,
                        )?;
                        transaction.commit()?;
                        Ok(question)
                    }
                })
                .await?;
            self.notify();
            output
        };
        let message_id = value_string(&question, "message_id").unwrap_or_default();
        let timeout_ms =
            finite_millis(&input, "timeoutMs", ASK_DEFAULT_TIMEOUT_MS).min(ASK_MAX_TIMEOUT_MS);
        let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms);
        let mut revision = self.revision.subscribe();
        loop {
            let current = self
                .store
                .execute({
                    let message_id = message_id.clone();
                    move |connection| {
                        connection
                            .query_row(
                                "SELECT message_id,run_id,dispatch_id,asker_handle,status,
                                        answer_message_id,answer_body,answered_by_generation,
                                        created_at,answered_at,closed_at
                                 FROM question_threads WHERE message_id=?1",
                                [&message_id],
                                question_row,
                            )
                            .optional()?
                            .ok_or_else(|| {
                                OrchestrationError::domain(
                                    "dispatch_inactive",
                                    format!("Question {message_id} is no longer active."),
                                )
                            })
                    }
                })
                .await?;
            match value_string(&current, "status").as_deref() {
                Some("answered") => {
                    return Ok(json!({
                        "answer": current.get("answer_body").cloned().unwrap_or(Value::Null),
                        "answerMessageId": current.get("answer_message_id").cloned().unwrap_or(Value::Null),
                        "cancelled": false,
                        "connectionLost": false,
                        "messageId": message_id,
                        "threadId": message_id,
                        "timedOut": false,
                        "timeoutMs": timeout_ms,
                    }));
                }
                Some("closed") => {
                    return Err(OrchestrationError::domain(
                        "dispatch_inactive",
                        format!("Question {message_id} closed because its Dispatch is inactive."),
                    ));
                }
                _ => {}
            }
            let now = tokio::time::Instant::now();
            if now >= deadline {
                return Ok(ask_empty_result(&message_id, timeout_ms, true));
            }
            if tokio::time::timeout_at(deadline, revision.changed())
                .await
                .is_err()
            {
                return Ok(ask_empty_result(&message_id, timeout_ms, true));
            }
        }
    }

    async fn gate_create(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let task_id = require_string(input, "task")?.to_owned();
        let question = require_string(input, "question")?.to_owned();
        let options = parse_string_array_json(string(input, "options"), "options")?;
        let output = self
            .store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                let run_id = find_task(&transaction, &task_id)?
                    .and_then(|task| value_string(&task, "run_id"))
                    .unwrap_or_else(|| LEGACY_RUN_ID.to_owned());
                let id = random_prefixed_id("gate")?;
                let options = serde_json::to_string(&options).map_err(|error| OrchestrationError::domain("encoding_failed", error.to_string()))?;
                transaction.execute(
                    "INSERT INTO decision_gates (id,run_id,task_id,question,options)
                     VALUES (?1,?2,?3,?4,?5)",
                    params![id, run_id, task_id, question, options],
                )?;
                settle_active_dispatch(&transaction, &task_id, "completed", None)?;
                transaction.execute("UPDATE tasks SET status='blocked' WHERE id=?1", [&task_id])?;
                let gate = transaction.query_row(
                    "SELECT id,run_id,task_id,question,options,status,resolution,created_at,resolved_at
                     FROM decision_gates WHERE id=?1",
                    [&id],
                    gate_row,
                )?;
                transaction.commit()?;
                Ok(json!({ "gate": gate }))
            })
            .await?;
        self.notify();
        Ok(output)
    }

    async fn gate_resolve(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let id = require_string(input, "id")?.to_owned();
        let resolution = require_string(input, "resolution")?.to_owned();
        let output = self
            .store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                let task_id = transaction
                    .query_row("SELECT task_id FROM decision_gates WHERE id=?1", [&id], |row| row.get::<_, String>(0))
                    .optional()?
                    .ok_or_else(|| OrchestrationError::domain("gate_not_found", format!("Gate {id} was not found.")))?;
                transaction.execute(
                    "UPDATE decision_gates SET status='resolved',resolution=?1,resolved_at=datetime('now') WHERE id=?2",
                    params![resolution, id],
                )?;
                transaction.execute("UPDATE tasks SET status='ready' WHERE id=?1", [task_id])?;
                let gate = transaction.query_row(
                    "SELECT id,run_id,task_id,question,options,status,resolution,created_at,resolved_at
                     FROM decision_gates WHERE id=?1",
                    [&id],
                    gate_row,
                )?;
                transaction.commit()?;
                Ok(json!({ "gate": gate }))
            })
            .await?;
        self.notify();
        Ok(output)
    }

    async fn gate_list(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let task = string(input, "task");
        let status = string(input, "status");
        if status
            .as_deref()
            .is_some_and(|status| !matches!(status, "pending" | "resolved" | "timeout"))
        {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Gate status is invalid.",
            ));
        }
        self.store
            .execute(move |connection| {
                let mut statement = connection.prepare(
                    "SELECT id,run_id,task_id,question,options,status,resolution,created_at,resolved_at
                     FROM decision_gates
                     WHERE (?1 IS NULL OR task_id=?1) AND (?2 IS NULL OR status=?2)
                     ORDER BY created_at",
                )?;
                let gates = statement
                    .query_map(params![task, status], gate_row)?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(json!({ "count": gates.len(), "gates": gates }))
            })
            .await
    }

    async fn reset(&self, body: Value) -> Result<Value, OrchestrationError> {
        let input = object(&body)?;
        let scopes = ["all", "tasks", "messages"]
            .into_iter()
            .filter(|key| input.get(*key).and_then(Value::as_bool) == Some(true))
            .collect::<Vec<_>>();
        if scopes.len() != 1 {
            return Err(OrchestrationError::domain(
                "invalid_argument",
                "Choose exactly one reset scope: --all, --tasks, or --messages.",
            ));
        }
        let scope = scopes[0];
        self.store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                if matches!(scope, "all" | "tasks") {
                    for table in [
                        "coordinator_runs",
                        "decision_gates",
                        "remote_questions",
                        "question_threads",
                        "federation_relay_items",
                        "remote_dispatch_attachments",
                        "federated_dispatches",
                        "worker_dispatches",
                        "dispatch_contexts",
                        "tasks",
                    ] {
                        transaction.execute(&format!("DELETE FROM {table}"), [])?;
                    }
                }
                if matches!(scope, "all" | "messages") {
                    transaction.execute("DELETE FROM question_threads", [])?;
                    transaction.execute("DELETE FROM deliveries", [])?;
                    transaction.execute("DELETE FROM messages", [])?;
                }
                if scope == "all" {
                    transaction.execute("DELETE FROM runs", [])?;
                    transaction.execute(
                        "INSERT INTO runs (id,objective,home_database,consumer_generation,legacy)
                         VALUES (?1,'Legacy orchestration state (inspect only)','this_database',0,1)",
                        [LEGACY_RUN_ID],
                    )?;
                }
                transaction.commit()?;
                Ok(json!({ "reset": scope }))
            })
            .await
            .inspect(|_| self.notify())
    }

    async fn resolve_group(
        &self,
        target: &str,
        sender: &str,
    ) -> Result<Vec<String>, OrchestrationError> {
        let terminals = self
            .terminals
            .list(None, usize::MAX, false)
            .await
            .map_err(|error| OrchestrationError::domain("terminal_list_failed", error.to_string()))?
            .terminals;
        let group = target.to_ascii_lowercase();
        let mut result = Vec::new();
        for terminal in terminals {
            if terminal.handle == sender {
                continue;
            }
            let included = if group == "@all" {
                true
            } else if group == "@idle" {
                self.terminals
                    .agent_status(&terminal.handle)
                    .is_ok_and(|status| status.status == Some("idle"))
            } else if let Some(worktree) = target.strip_prefix("@worktree:") {
                terminal.worktree_id == worktree
            } else {
                let agent = group.trim_start_matches('@');
                matches!(
                    agent,
                    "claude"
                        | "openclaude"
                        | "codex"
                        | "opencode"
                        | "mimo"
                        | "gemini"
                        | "droid"
                        | "grok"
                        | "cursor"
                ) && title_has_token(terminal.title.as_deref().unwrap_or_default(), agent)
            };
            if included {
                result.push(terminal.handle);
            }
        }
        Ok(result)
    }

    async fn fail_dispatch(&self, id: &str, reason: &str) -> Result<(), OrchestrationError> {
        let id = id.to_owned();
        let reason = reason.to_owned();
        self.store
            .execute(move |connection| {
                let transaction = connection.transaction()?;
                let dispatch = find_dispatch(&transaction, &id)?.ok_or_else(|| {
                    OrchestrationError::domain(
                        "dispatch_not_found",
                        format!("Dispatch {id} was not found."),
                    )
                })?;
                let failures = value_i64(&dispatch, "failure_count").unwrap_or_default() + 1;
                let status = if failures >= 3 {
                    "circuit_broken"
                } else {
                    "failed"
                };
                transaction.execute(
                    "UPDATE dispatch_contexts SET status=?1,failure_count=?2,last_failure=?3,
                       capability_revoked_at=COALESCE(capability_revoked_at,datetime('now'))
                     WHERE id=?4",
                    params![status, failures, reason, id],
                )?;
                let task_status = if status == "circuit_broken" {
                    "failed"
                } else {
                    "ready"
                };
                transaction.execute(
                    "UPDATE tasks SET status=?1 WHERE id=?2",
                    params![task_status, value_string(&dispatch, "task_id")],
                )?;
                transaction.commit()?;
                Ok(Value::Null)
            })
            .await?;
        self.notify();
        Ok(())
    }
}

fn run_required() -> OrchestrationError {
    OrchestrationError::domain_with_data(
        "run_required",
        "No Run is bound. Use orchestration run-create or run-use first. No effects were applied.",
        json!({
            "effectsApplied": false,
            "guide": { "full": true, "topic": "orchestration" },
            "nextCommandArgs": ["skills", "get", "orchestration", "--full"],
            "nextSteps": [
                "Using this same AgentStart CLI executable, run: skills get orchestration --full",
                "Read the returned guide completely and do not retry the previous command unchanged."
            ]
        }),
    )
}

fn parse_string_array_json(
    value: Option<String>,
    field: &str,
) -> Result<Vec<String>, OrchestrationError> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    serde_json::from_str::<Vec<String>>(&value).map_err(|_| {
        OrchestrationError::domain(
            "invalid_argument",
            format!("Invalid --{field}: must be a JSON array of strings"),
        )
    })
}

fn parse_message_types(value: Option<String>) -> Result<Vec<String>, OrchestrationError> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    let types = value
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if types
        .iter()
        .any(|value| !MESSAGE_TYPES.contains(&value.as_str()))
    {
        return Err(OrchestrationError::domain(
            "invalid_argument",
            "Message type filter is invalid.",
        ));
    }
    Ok(types)
}

fn normalized_title(preferred: Option<&str>, fallback: &str, max: usize) -> String {
    preferred
        .unwrap_or(
            fallback
                .lines()
                .find(|line| !line.trim().is_empty())
                .unwrap_or(fallback),
        )
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max)
        .collect()
}

fn abbreviate_task(task: &mut Value) {
    let Some(object) = task.as_object_mut() else {
        return;
    };
    let Some(spec) = object.get("spec").and_then(Value::as_str) else {
        return;
    };
    if spec.chars().count() > 240 {
        let mut abbreviated = spec.chars().take(237).collect::<String>();
        abbreviated.push_str("...");
        object.insert("spec".to_owned(), Value::String(abbreviated));
        object.insert("spec_truncated".to_owned(), Value::Bool(true));
    }
}

fn dispatch_preamble(
    task_id: &str,
    dispatch_id: &str,
    spec: &str,
    coordinator: &str,
    worker: &str,
    capability: Option<&str>,
    dev_mode: bool,
) -> String {
    let cli = if dev_mode {
        "pnpm agentstart"
    } else {
        "agentstart"
    };
    let capability = capability
        .map(|value| format!(" --dispatch-capability {value}"))
        .unwrap_or_default();
    format!(
        "You are working inside AgentStart, a multi-agent IDE. You are a dispatched worker.\n\
Your coordinator's terminal handle is: {coordinator}\n\
Your task ID is: {task_id}\n\n\
You talk to the coordinator only through the AgentStart CLI. Never use AskUserQuestion.\n\
Report the outcome exactly once with:\n  {cli} orchestration send --from {worker}{capability} \\\n    --type worker_done --subject \"<short status>\" \\\n    --body \"<3-sentence summary: what you did, what you found, what's left>\" \\\n    --task-id {task_id} --dispatch-id {dispatch_id} --outcome succeeded\n\n\
Send a heartbeat every 5 minutes while working:\n  {cli} orchestration send --from {worker}{capability} \\\n    --type heartbeat --subject alive --task-id {task_id} --dispatch-id {dispatch_id}\n\n\
Ask the coordinator through:\n  {cli} orchestration ask --from {worker}{capability} --question \"<question>\" --timeout-ms 600000\n\n\
After worker_done, stop work and return to an idle prompt.\n\n=== TASK ===\n{spec}"
    )
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

fn verify_dispatch_authority(
    dispatch: &Value,
    from: &str,
    pane: Option<&str>,
    incarnation: Option<&str>,
    capability: Option<&str>,
) -> Result<(), OrchestrationError> {
    let dispatch_id = value_string(dispatch, "id").unwrap_or_default();
    if !matches!(
        value_string(dispatch, "status").as_deref(),
        Some("pending" | "dispatched")
    ) {
        return Err(OrchestrationError::domain(
            "dispatch_inactive",
            format!("Dispatch {dispatch_id} is not active."),
        ));
    }
    if dispatch
        .get("capability_revoked_at")
        .is_some_and(|value| !value.is_null())
    {
        return Err(OrchestrationError::domain(
            "dispatch_capability_invalid",
            format!("Dispatch {dispatch_id} capability is revoked."),
        ));
    }
    let expected = value_string(dispatch, "capability_hash");
    if let Some(expected) = expected {
        let Some(capability) = capability else {
            return Err(OrchestrationError::domain(
                "dispatch_capability_invalid",
                "The Dispatch capability is missing.",
            ));
        };
        let observed = capability_hash(capability);
        if expected.as_bytes().ct_eq(observed.as_bytes()).unwrap_u8() != 1 {
            return Err(OrchestrationError::domain(
                "dispatch_capability_invalid",
                "The Dispatch capability is invalid.",
            ));
        }
    }
    let pane_matches = value_string(dispatch, "assignee_pane_key")
        .zip(pane)
        .is_some_and(|(expected, actual)| pane_keys_match(&expected, actual));
    let handle_matches = value_string(dispatch, "assignee_handle").as_deref() == Some(from);
    if !pane_matches && !handle_matches {
        return Err(OrchestrationError::domain(
            "dispatch_capability_invalid",
            "The caller is not the Dispatch pane.",
        ));
    }
    if let Some(expected) = value_string(dispatch, "process_incarnation")
        && incarnation != Some(expected.as_str())
    {
        return Err(OrchestrationError::domain(
            "dispatch_capability_invalid",
            "The Dispatch process incarnation changed.",
        ));
    }
    Ok(())
}

fn reconcile_lifecycle(
    connection: &rusqlite::Connection,
    message: &Value,
) -> Result<Option<Value>, OrchestrationError> {
    let message_type = value_string(message, "type").unwrap_or_default();
    if !matches!(message_type.as_str(), "worker_done" | "heartbeat") {
        return Ok(None);
    }
    let payload = value_string(message, "payload")
        .and_then(|payload| serde_json::from_str::<Value>(&payload).ok())
        .and_then(|payload| payload.as_object().cloned());
    let Some(payload) = payload else {
        return reject_lifecycle(
            connection,
            message,
            "invalid_payload",
            "worker_done requires a JSON object payload.",
        );
    };
    let dispatch_id = string(&payload, "dispatchId");
    let Some(dispatch_id) = dispatch_id else {
        if message_type == "heartbeat" {
            return Ok(None);
        }
        return reject_lifecycle(
            connection,
            message,
            "missing_dispatch_id",
            "worker_done requires dispatchId.",
        );
    };
    let Some(dispatch) = find_dispatch(connection, &dispatch_id)? else {
        if message_type == "heartbeat" {
            mark_read(
                connection,
                &[value_string(message, "id").unwrap_or_default()],
            )?;
            return Ok(Some(json!({ "action": "suppressed" })));
        }
        return reject_lifecycle(
            connection,
            message,
            "unknown_dispatch",
            &format!("worker_done references unknown Dispatch {dispatch_id}."),
        );
    };
    let sender_authority = value_string(&dispatch, "assignee_pane_key")
        .zip(value_string(message, "sender_pane_key"))
        .is_some_and(|(expected, actual)| pane_keys_match(&expected, &actual))
        || value_string(&dispatch, "assignee_handle") == value_string(message, "from_handle");
    if !sender_authority {
        return reject_lifecycle(
            connection,
            message,
            "sender_not_assignee",
            &format!("Message sender is not the assignee for Dispatch {dispatch_id}."),
        );
    }
    if message_type == "heartbeat" {
        if value_string(&dispatch, "status").as_deref() != Some("dispatched") {
            mark_read(
                connection,
                &[value_string(message, "id").unwrap_or_default()],
            )?;
            return Ok(Some(json!({ "action": "suppressed" })));
        }
        connection.execute(
            "UPDATE dispatch_contexts SET last_heartbeat_at=?1 WHERE id=?2 AND status='dispatched'",
            params![value_string(message, "created_at"), dispatch_id],
        )?;
        return Ok(Some(
            json!({ "action": "heartbeat_recorded", "dispatchId": dispatch_id }),
        ));
    }
    let Some(task_id) = string(&payload, "taskId") else {
        return reject_lifecycle(
            connection,
            message,
            "missing_task_id",
            "worker_done requires taskId.",
        );
    };
    let outcome = string(&payload, "outcome");
    if !matches!(outcome.as_deref(), Some("succeeded" | "failed")) {
        return reject_lifecycle(
            connection,
            message,
            "invalid_outcome",
            "worker_done requires outcome=succeeded or outcome=failed.",
        );
    }
    let Some(task) = find_task(connection, &task_id)? else {
        return reject_lifecycle(
            connection,
            message,
            "unknown_task",
            &format!("worker_done references unknown Task {task_id}."),
        );
    };
    if value_string(&dispatch, "task_id").as_deref() != Some(&task_id) {
        return reject_lifecycle(
            connection,
            message,
            "task_dispatch_mismatch",
            &format!("Dispatch {dispatch_id} does not belong to Task {task_id}."),
        );
    }
    let expected_task = if outcome.as_deref() == Some("succeeded") {
        "completed"
    } else {
        "failed"
    };
    let expected_dispatch = expected_task;
    if value_string(&dispatch, "status").as_deref() == Some(expected_dispatch)
        && value_string(&task, "status").as_deref() == Some(expected_task)
    {
        return Ok(Some(
            json!({ "action": expected_task, "dispatchId": dispatch_id, "taskId": task_id }),
        ));
    }
    let latest = latest_dispatch_for_task(connection, &task_id)?;
    if value_string(&dispatch, "status").as_deref() != Some("dispatched")
        || value_string(&task, "status").as_deref() != Some("dispatched")
        || latest
            .as_ref()
            .and_then(|value| value_string(value, "id"))
            .as_deref()
            != Some(&dispatch_id)
    {
        return reject_lifecycle(
            connection,
            message,
            "inactive_dispatch",
            &format!("Dispatch {dispatch_id} is no longer active."),
        );
    }
    connection.execute(
        "UPDATE dispatch_contexts SET status=?1,completed_at=datetime('now'),
           last_failure=CASE WHEN ?1='failed' THEN ?2 ELSE last_failure END,
           capability_revoked_at=COALESCE(capability_revoked_at,datetime('now')) WHERE id=?3",
        params![
            expected_dispatch,
            value_string(message, "body"),
            dispatch_id
        ],
    )?;
    connection.execute(
        "UPDATE tasks SET status=?1,result=?2,completed_at=datetime('now') WHERE id=?3",
        params![expected_task, value_string(message, "body"), task_id],
    )?;
    connection.execute(
        "UPDATE worker_dispatches SET state=?1,stage='settled',updated_at=datetime('now')
         WHERE dispatch_id=?2 AND state='ready'",
        params![outcome.as_deref().unwrap_or("failed"), dispatch_id],
    )?;
    connection.execute(
        "UPDATE question_threads SET status='closed',closed_at=datetime('now')
         WHERE dispatch_id=?1 AND status='pending'",
        [&dispatch_id],
    )?;
    if outcome.as_deref() == Some("succeeded") {
        promote_ready_tasks(connection, &task_id)?;
    }
    Ok(Some(json!({
        "action": expected_task,
        "dispatchId": dispatch_id,
        "taskId": task_id,
    })))
}

fn reject_lifecycle(
    connection: &rusqlite::Connection,
    message: &Value,
    code: &'static str,
    reason: &str,
) -> Result<Option<Value>, OrchestrationError> {
    let id = value_string(message, "id").unwrap_or_default();
    let mut payload = value_string(message, "payload")
        .and_then(|payload| serde_json::from_str::<Value>(&payload).ok())
        .and_then(|payload| payload.as_object().cloned())
        .unwrap_or_default();
    payload.insert(
        "_agentstartLifecycleRejection".to_owned(),
        json!({ "code": code, "reason": reason }),
    );
    let payload = serde_json::to_string(&payload)
        .map_err(|error| OrchestrationError::domain("encoding_failed", error.to_string()))?;
    connection.execute(
        "UPDATE messages SET priority='high',subject=?1,body=?2,payload=?3 WHERE id=?4",
        params![
            format!(
                "Rejected {}: {}",
                value_string(message, "type").unwrap_or_default(),
                value_string(message, "subject").unwrap_or_default()
            ),
            format!("AgentStart rejected this lifecycle message: {reason}"),
            payload,
            id,
        ],
    )?;
    Ok(Some(
        json!({ "action": "rejected", "code": code, "reason": reason }),
    ))
}

fn settle_active_dispatch(
    connection: &rusqlite::Connection,
    task_id: &str,
    status: &str,
    reason: Option<&str>,
) -> Result<(), OrchestrationError> {
    connection.execute(
        "UPDATE dispatch_contexts SET status=?1,last_failure=COALESCE(?2,last_failure),
           completed_at=datetime('now'),capability_revoked_at=COALESCE(capability_revoked_at,datetime('now'))
         WHERE id=(SELECT id FROM dispatch_contexts WHERE task_id=?3
           AND status IN ('pending','dispatched') ORDER BY rowid DESC LIMIT 1)",
        params![status, reason, task_id],
    )?;
    Ok(())
}

fn connection_message(
    connection: &rusqlite::Connection,
    id: &str,
) -> Result<Option<Value>, OrchestrationError> {
    connection
        .query_row(
            "SELECT id,run_id,from_handle,to_handle,subject,body,type,priority,thread_id,
                    payload,read,sequence,created_at,delivered_at,sender_pane_key
             FROM messages WHERE id=?1",
            [id],
            message_row,
        )
        .optional()
        .map_err(Into::into)
}

fn messages_by_ids(
    connection: &rusqlite::Connection,
    ids: &[String],
) -> Result<Vec<Value>, OrchestrationError> {
    let mut messages = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(message) = connection_message(connection, id)? {
            messages.push(message);
        }
    }
    Ok(messages)
}

fn check_result(
    messages: Vec<Value>,
    run_id: Option<String>,
    dispatch_id: Option<String>,
    format: bool,
    timed_out: bool,
    cancelled: bool,
) -> Value {
    let formatted = format.then(|| format_messages(&messages));
    let mut result = json!({
        "cancelled": cancelled,
        "connectionLost": false,
        "count": messages.len(),
        "messages": messages,
        "timedOut": timed_out,
    });
    if let Some(run_id) = run_id {
        result["runId"] = Value::String(run_id);
    }
    if let Some(dispatch_id) = dispatch_id {
        result["dispatchId"] = Value::String(dispatch_id);
    }
    if let Some(formatted) = formatted {
        result["formatted"] = Value::String(formatted);
    }
    result
}

fn format_messages(messages: &[Value]) -> String {
    messages
        .iter()
        .map(|message| {
            let priority = match value_string(message, "priority").as_deref() {
                Some("urgent") => " [URGENT]",
                Some("high") => " [HIGH]",
                _ => "",
            };
            let legacy = value_string(message, "run_id").as_deref() == Some(LEGACY_RUN_ID);
            let legacy_marker = if legacy { " [LEGACY READ-ONLY]" } else { "" };
            let from = value_string(message, "from_handle").unwrap_or_default();
            let mut lines = vec![format!(
                "──── From: {} ({from}){priority}{legacy_marker} ({}) ────",
                from.to_ascii_uppercase(),
                value_string(message, "type").unwrap_or_default()
            )];
            lines.push(format!(
                "Subject: {}",
                value_string(message, "subject").unwrap_or_default()
            ));
            if let Some(body) = value_string(message, "body").filter(|body| !body.is_empty()) {
                lines.push(body);
            }
            if let Some(payload) = value_string(message, "payload") {
                lines.push(format!("[Payload: {payload}]"));
            }
            if !legacy {
                lines.push(format!(
                    "[Reply: agentstart orchestration reply --id {} --from {} --body \"...\"]",
                    value_string(message, "id").unwrap_or_default(),
                    value_string(message, "to_handle").unwrap_or_default()
                ));
            }
            lines.push("────────────────────────────────────────────────────────────".to_owned());
            lines.join("\n")
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn finite_usize(input: &Map<String, Value>, key: &str, default: usize) -> usize {
    input
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map(|value| value as usize)
        .unwrap_or(default)
}

fn finite_millis(input: &Map<String, Value>, key: &str, default: u64) -> u64 {
    input
        .get(key)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map(|value| value as u64)
        .unwrap_or(default)
}

fn epoch_thread_id() -> Result<String, std::time::SystemTimeError> {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis();
    Ok(format!("thread_{millis}"))
}

fn ask_empty_result(message_id: &str, timeout_ms: u64, timed_out: bool) -> Value {
    json!({
        "answer": null,
        "cancelled": false,
        "connectionLost": false,
        "messageId": message_id,
        "threadId": message_id,
        "timedOut": timed_out,
        "timeoutMs": timeout_ms,
    })
}

fn title_has_token(title: &str, token: &str) -> bool {
    title
        .split(|character: char| !character.is_ascii_alphanumeric() && character != '-')
        .any(|candidate| candidate.eq_ignore_ascii_case(token))
}

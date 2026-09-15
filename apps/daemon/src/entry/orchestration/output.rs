use agentstart_protocol::runtime::v1::{
    OrchestrationDispatch, OrchestrationDispatchStatus, OrchestrationEffect, OrchestrationGate,
    OrchestrationGateStatus, OrchestrationMessage, OrchestrationMessagePriority,
    OrchestrationMessageType, OrchestrationMutation, OrchestrationQuestion, OrchestrationRun,
    OrchestrationRunBinding, OrchestrationServerRef, OrchestrationServiceAskResponse,
    OrchestrationServiceCheckResponse, OrchestrationServiceDispatchResponse,
    OrchestrationServiceDispatchShowResponse, OrchestrationServiceGateCreateResponse,
    OrchestrationServiceGateListResponse, OrchestrationServiceGateResolveResponse,
    OrchestrationServiceInboxResponse, OrchestrationServiceReplyResponse,
    OrchestrationServiceRunBindingResponse, OrchestrationServiceRunCurrentResponse,
    OrchestrationServiceRunListResponse, OrchestrationServiceRunShowResponse,
    OrchestrationServiceSendResponse, OrchestrationServiceTaskCreateResponse,
    OrchestrationServiceTaskListResponse, OrchestrationServiceTaskUpdateResponse,
    OrchestrationServiceWorkerAbandonResponse, OrchestrationServiceWorkerReadResponse,
    OrchestrationServiceWorkerShowResponse, OrchestrationServiceWorkerStartResponse,
    OrchestrationServiceWorkerStopResponse, OrchestrationTask, OrchestrationTaskStatus,
    OrchestrationWorker, OrchestrationWorkerObservation, OrchestrationWorkerReadResult,
    OrchestrationWorkerSetupMode, OrchestrationWorkerSetupReceipt, OrchestrationWorkerState,
    OrchestrationWorkerStopClose, OrchestrationWorkerTerminal, TerminalState,
    orchestration_field_value, orchestration_service_dispatch_response,
    orchestration_service_send_response,
};
use serde_json::{Map, Value, json};

use super::input::Args;

const USAGE: &str = "Usage: agentstart orchestration <command> [options]

Every command that names a caller resolves it from --from <handle>, or from the
terminal itself when run inside an AgentStart terminal.

run
  run create --objective <text> [--from <handle>]
  run use --id <run> [--from <handle>]
  run current [--from <handle>]
  run list
  run show --id <run> [--from <handle>]

task
  task create --spec <text> [--title <t>] [--display-name <n>] [--dep <id>]... [--parent <id>] [--run <run>]
  task list [--status <pending|ready|dispatched|completed|failed|blocked>] [--ready] [--brief] [--run <run>]
  task update --id <task> --status <pending|ready|dispatched|completed|failed|blocked> [--result <text>] [--run <run>]

dispatch
  dispatch --task <task> [--to <handle>] [--inject] [--dry-run] [--return-preamble] [--run <run>]
  dispatch show --task <task> [--preamble]

worker
  worker start --task <task> [--worktree <selector>] [--agent <id>] [--terminal <handle>]
               [--name <n>] [--display-name <n>] [--comment <text>] [--retry-of <dispatch>]
               [--timeout-ms <n>] [--setup <run|skip|inherit>]
  worker show --dispatch <id>
  worker read --dispatch <id> [--cursor <c>] [--limit <n>] [--source <transcript|terminal>]
  worker stop --dispatch <id>
  worker abandon --dispatch <id>

messaging
  send --subject <s> [--to <handle|dispatch:<id>|run:<id>>] [--type <t>] [--body <text>]
       [--priority <normal|high|urgent>] [--thread-id <id>] [--payload <json>]
       [--task-id <task>] [--dispatch-id <dispatch>] [--outcome <succeeded|failed>]
       [--dispatch-capability <dcap_...>] [--run <run>]
  check [--terminal <handle>] [--pane <key>] [--type <t>]... [--format]
        [--ack <delivery>] [--wait] [--timeout-ms <n>] [--all | --peek]
        Takes the run's unread mail and reports the delivery id --ack expects.
        --peek / --all only look at the mailbox and consume nothing.
  reply --id <message> --body <text> [--from <handle>]
  inbox [--limit <n>] [--terminal <handle>]
  ask --question <text> [--to <handle>] [--options <a,b>] [--timeout-ms <n>]
      [--dispatch-capability <dcap_...>] [--run <run>]

gate
  gate create --task <task> --question <text> [--option <text>]...
  gate resolve --id <gate> --resolution <text>
  gate list [--task <task>] [--status <pending|resolved|timeout>]

Options
  --json       emit machine-readable output
  --daemon-data <path>   override the daemon user-data directory
  --runtime <id>         require a specific daemon runtime id
";

pub(super) fn print_usage() {
    println!("{USAGE}");
}

pub(super) fn write(args: &Args, json: Value, text: String) {
    if args.has("json") {
        println!("{json}");
    } else {
        println!("{text}");
    }
}

pub(super) fn run_binding_response(response: OrchestrationServiceRunBindingResponse) -> Value {
    let mut value = Map::new();
    insert(&mut value, "run", response.run.map(run_value));
    insert(&mut value, "binding", response.binding.map(binding_value));
    insert(
        &mut value,
        "mutation",
        response.mutation.map(mutation_value),
    );
    Value::Object(value)
}

pub(super) fn run_binding_text(response: &OrchestrationServiceRunBindingResponse) -> String {
    match (&response.run, &response.binding) {
        (Some(run), Some(binding)) => {
            format!("{}\tgeneration={}", run.id, binding.consumer_generation)
        }
        (Some(run), None) => run.id.clone(),
        _ => "No run bound".to_owned(),
    }
}

pub(super) fn run_current_response(response: OrchestrationServiceRunCurrentResponse) -> Value {
    json!({ "run": response.run.map(run_value) })
}

pub(super) fn run_current_text(response: &OrchestrationServiceRunCurrentResponse) -> String {
    match &response.run {
        Some(run) => format!("{}\t{}", run.id, run.objective),
        None => "No run bound".to_owned(),
    }
}

pub(super) fn run_list_response(response: OrchestrationServiceRunListResponse) -> Value {
    json!({
        "runs": response.runs.into_iter().map(run_value).collect::<Vec<_>>()
    })
}

pub(super) fn run_list_text(response: &OrchestrationServiceRunListResponse) -> String {
    lines_or(
        response
            .runs
            .iter()
            .map(|run| {
                format!(
                    "{}\t{}\t{}",
                    run.id,
                    run.objective,
                    run.coordinator_pane_key.as_deref().unwrap_or("-")
                )
            })
            .collect(),
        "No runs",
    )
}

pub(super) fn run_show_response(response: OrchestrationServiceRunShowResponse) -> Value {
    json!({ "run": response.run.map(run_value) })
}

pub(super) fn run_show_text(response: &OrchestrationServiceRunShowResponse) -> String {
    match &response.run {
        Some(run) => format!("{}\t{}\t{}", run.id, run.objective, run_status_text(run)),
        None => "Run not found".to_owned(),
    }
}

pub(super) fn task_response(response: OrchestrationServiceTaskCreateResponse) -> Value {
    let mut value = Map::new();
    insert(&mut value, "task", response.task.map(task_value));
    insert(
        &mut value,
        "mutation",
        response.mutation.map(mutation_value),
    );
    Value::Object(value)
}

pub(super) fn task_update_response(response: OrchestrationServiceTaskUpdateResponse) -> Value {
    let mut value = Map::new();
    insert(&mut value, "task", response.task.map(task_value));
    insert(
        &mut value,
        "mutation",
        response.mutation.map(mutation_value),
    );
    Value::Object(value)
}

pub(super) fn task_text(task: Option<&OrchestrationTask>) -> String {
    match task {
        Some(task) => format!(
            "{}\t{}\t{}",
            task.id,
            task_status_name(task.status),
            task_preview(task)
        ),
        None => "Task not found".to_owned(),
    }
}

pub(super) fn task_list_response(response: OrchestrationServiceTaskListResponse) -> Value {
    json!({
        "runId": response.run_id,
        "legacyReadOnly": response.legacy_read_only,
        "tasks": response.tasks.into_iter().map(task_value).collect::<Vec<_>>(),
        "count": response.count
    })
}

pub(super) fn task_list_text(response: &OrchestrationServiceTaskListResponse) -> String {
    lines_or(
        response
            .tasks
            .iter()
            .map(|task| {
                format!(
                    "{}\t{}\t{}\t{}",
                    task.id,
                    task_status_name(task.status),
                    task.display_name
                        .as_deref()
                        .or(task.task_title.as_deref())
                        .unwrap_or("-"),
                    task_preview(task)
                )
            })
            .collect(),
        "No tasks",
    )
}

pub(super) fn dispatch_response(response: OrchestrationServiceDispatchResponse) -> (Value, String) {
    match response.outcome {
        Some(orchestration_service_dispatch_response::Outcome::DryRun(outcome)) => (
            json!({ "dryRun": { "preamble": outcome.preamble } }),
            outcome.preamble,
        ),
        Some(orchestration_service_dispatch_response::Outcome::Dispatched(outcome)) => {
            let text = match &outcome.dispatch {
                Some(dispatch) => format!(
                    "{}\t{}\tinjected={}",
                    dispatch.id,
                    dispatch_status_name(dispatch.status),
                    outcome.injected
                ),
                None => "Dispatched".to_owned(),
            };
            let mut value = Map::new();
            value.insert(
                "dispatched".to_owned(),
                json!({
                    "dispatch": outcome.dispatch.map(dispatch_value),
                    "injected": outcome.injected,
                    "preamble": outcome.preamble
                }),
            );
            (Value::Object(value), text)
        }
        None => (json!({}), "No dispatch outcome".to_owned()),
    }
}

pub(super) fn dispatch_show_response(response: OrchestrationServiceDispatchShowResponse) -> Value {
    json!({
        "dispatch": response.dispatch.map(dispatch_value),
        "preamble": response.preamble
    })
}

pub(super) fn dispatch_show_text(response: &OrchestrationServiceDispatchShowResponse) -> String {
    if let Some(preamble) = &response.preamble {
        return preamble.clone();
    }
    match &response.dispatch {
        Some(dispatch) => format!(
            "{}\t{}\ttask={}",
            dispatch.id,
            dispatch_status_name(dispatch.status),
            dispatch.task_id
        ),
        None => "No dispatch".to_owned(),
    }
}

pub(super) fn worker_start_response(response: OrchestrationServiceWorkerStartResponse) -> Value {
    let mut value = Map::new();
    insert(&mut value, "runId", response.run_id.map(Value::String));
    value.insert("taskId".to_owned(), Value::String(response.task_id));
    value.insert("dispatchId".to_owned(), Value::String(response.dispatch_id));
    value.insert(
        "state".to_owned(),
        Value::String(worker_state_name(response.state)),
    );
    value.insert("stage".to_owned(), Value::String(response.stage));
    insert(&mut value, "server", response.server.map(server_ref_value));
    insert(&mut value, "setup", response.setup.map(setup_receipt_value));
    insert(
        &mut value,
        "timeoutMs",
        response.timeout_ms.map(Value::from),
    );
    insert(
        &mut value,
        "failedStage",
        response.failed_stage.map(Value::String),
    );
    insert(
        &mut value,
        "lastError",
        response.last_error.map(Value::String),
    );
    insert(&mut value, "warning", response.warning.map(Value::String));
    value.insert(
        "effects".to_owned(),
        Value::Array(response.effects.into_iter().map(effect_value).collect()),
    );
    value.insert(
        "residualResources".to_owned(),
        Value::Array(
            response
                .residual_resources
                .into_iter()
                .map(effect_value)
                .collect(),
        ),
    );
    value.insert(
        "nextCommands".to_owned(),
        Value::Array(
            response
                .next_commands
                .into_iter()
                .map(Value::String)
                .collect(),
        ),
    );
    Value::Object(value)
}

pub(super) fn worker_start_text(response: &OrchestrationServiceWorkerStartResponse) -> String {
    let mut text = format!(
        "{}\t{}\t{}",
        response.dispatch_id,
        worker_state_name(response.state),
        response.stage
    );
    if let Some(error) = &response.last_error {
        text.push_str(&format!("\t{error}"));
    }
    text
}

pub(super) fn worker_show_response(response: OrchestrationServiceWorkerShowResponse) -> Value {
    let mut value = Map::new();
    insert(
        &mut value,
        "dispatch",
        response.dispatch.map(dispatch_value),
    );
    insert(&mut value, "worker", response.worker.map(worker_value));
    insert(&mut value, "server", response.server.map(server_ref_value));
    insert(
        &mut value,
        "remoteRuntimeEpoch",
        response.remote_runtime_epoch.map(Value::String),
    );
    insert(
        &mut value,
        "terminal",
        response.terminal.map(worker_terminal_value),
    );
    insert(
        &mut value,
        "observation",
        response.observation.map(observation_value),
    );
    Value::Object(value)
}

pub(super) fn worker_show_text(response: &OrchestrationServiceWorkerShowResponse) -> String {
    let mut parts = Vec::new();
    if let Some(worker) = &response.worker {
        parts.push(format!(
            "{}\t{}\t{}",
            worker.dispatch_id,
            worker_state_name(worker.state),
            worker.stage
        ));
    }
    if let Some(dispatch) = &response.dispatch {
        parts.push(format!(
            "dispatch\t{}\t{}",
            dispatch.id,
            dispatch_status_name(dispatch.status)
        ));
    }
    if let Some(observation) = &response.observation {
        parts.push(format!(
            "observation\t{}\texact={}",
            observation.status, observation.exact_worker
        ));
    }
    if parts.is_empty() {
        "No worker".to_owned()
    } else {
        parts.join("\n")
    }
}

pub(super) fn worker_read_response(response: OrchestrationServiceWorkerReadResponse) -> Value {
    let mut value = Map::new();
    insert(&mut value, "output", response.output.map(worker_read_value));
    insert(&mut value, "server", response.server.map(server_ref_value));
    insert(
        &mut value,
        "remoteRuntimeEpoch",
        response.remote_runtime_epoch.map(Value::String),
    );
    Value::Object(value)
}

pub(super) fn worker_read_text(response: &OrchestrationServiceWorkerReadResponse) -> String {
    match &response.output {
        Some(output) => match &output.terminal {
            Some(read) => lines_or(read.tail.clone(), "No output"),
            None => "No output".to_owned(),
        },
        None => "No output".to_owned(),
    }
}

pub(super) fn worker_stop_response(response: OrchestrationServiceWorkerStopResponse) -> Value {
    json!({
        "dispatchId": response.dispatch_id,
        "state": worker_state_name(response.state),
        "alreadySettled": response.already_settled,
        "processAction": response.process_action,
        "close": response.close.map(close_value),
        "lastError": response.last_error
    })
}

pub(super) fn worker_stop_text(response: &OrchestrationServiceWorkerStopResponse) -> String {
    format!(
        "{}\t{}\tsettled={}",
        response.dispatch_id,
        worker_state_name(response.state),
        response.already_settled
    )
}

pub(super) fn worker_abandon_response(
    response: OrchestrationServiceWorkerAbandonResponse,
) -> Value {
    json!({
        "dispatchId": response.dispatch_id,
        "state": worker_state_name(response.state),
        "alreadySettled": response.already_settled,
        "stale": response.stale,
        "processAction": response.process_action,
        "warning": response.warning,
        "residualResources": response.residual_resources.into_iter().map(effect_value).collect::<Vec<_>>()
    })
}

pub(super) fn worker_abandon_text(response: &OrchestrationServiceWorkerAbandonResponse) -> String {
    format!(
        "{}\t{}\tsettled={}\tstale={}",
        response.dispatch_id,
        worker_state_name(response.state),
        response.already_settled,
        response.stale
    )
}

pub(super) fn send_response(response: OrchestrationServiceSendResponse) -> (Value, String) {
    match response.outcome {
        Some(orchestration_service_send_response::Outcome::Message(outcome)) => {
            let text = match &outcome.message {
                Some(message) => format!("{}\t{}", message.id, message_type_name(message.r#type)),
                None => "Message sent".to_owned(),
            };
            (
                json!({
                    "message": outcome.message.map(message_value),
                    "lifecycle": outcome.lifecycle.map(lifecycle_value)
                }),
                text,
            )
        }
        Some(orchestration_service_send_response::Outcome::Broadcast(outcome)) => (
            json!({
                "broadcast": {
                    "messages": outcome.messages.into_iter().map(message_value).collect::<Vec<_>>(),
                    "recipients": outcome.recipients
                }
            }),
            format!("broadcast\t{} recipients", outcome.recipients),
        ),
        Some(orchestration_service_send_response::Outcome::Relay(_)) => {
            (json!({ "relay": true }), "relayed".to_owned())
        }
        None => (json!({}), "No send outcome".to_owned()),
    }
}

pub(super) fn check_response(response: OrchestrationServiceCheckResponse) -> Value {
    json!({
        "messages": response.messages.into_iter().map(message_value).collect::<Vec<_>>(),
        "count": response.count,
        "runId": response.run_id,
        "dispatchId": response.dispatch_id,
        "deliveryId": response.delivery_id,
        "replayed": response.replayed,
        "acknowledged": response.acknowledged,
        "timedOut": response.timed_out,
        "cancelled": response.cancelled,
        "connectionLost": response.connection_lost,
        "formatted": response.formatted
    })
}

pub(super) fn check_text(response: &OrchestrationServiceCheckResponse) -> String {
    if let Some(formatted) = &response.formatted
        && !formatted.is_empty()
    {
        return formatted.clone();
    }
    if response.messages.is_empty() {
        if response.timed_out {
            return "Timed out with no messages".to_owned();
        }
        return "No messages".to_owned();
    }
    // Why: `--ack` takes a delivery id, not a message id — the daemon looks the id up in
    // `deliveries`. Without printing it here a coordinator cannot discover what it must ack.
    let mut lines = Vec::new();
    if let Some(delivery) = &response.delivery_id {
        lines.push(format!("delivery\t{delivery}"));
    }
    lines.extend(response.messages.iter().map(|message| {
        format!(
            "{}\t{}\t{}\t{}",
            message.id,
            message_type_name(message.r#type),
            message.from_handle,
            message.subject
        )
    }));
    lines.join("\n")
}

pub(super) fn reply_response(response: OrchestrationServiceReplyResponse) -> Value {
    json!({
        "message": response.message.map(message_value),
        "question": response.question.map(question_value),
        "duplicate": response.duplicate
    })
}

pub(super) fn reply_text(response: &OrchestrationServiceReplyResponse) -> String {
    match &response.message {
        Some(message) if response.duplicate => format!("{}\tduplicate", message.id),
        Some(message) => message.id.clone(),
        None => "Replied".to_owned(),
    }
}

pub(super) fn inbox_response(response: OrchestrationServiceInboxResponse) -> Value {
    json!({
        "messages": response.messages.into_iter().map(message_value).collect::<Vec<_>>(),
        "count": response.count
    })
}

pub(super) fn inbox_text(response: &OrchestrationServiceInboxResponse) -> String {
    lines_or(
        response
            .messages
            .iter()
            .map(|message| {
                format!(
                    "{}\t{}\t{}\t{}",
                    message.id,
                    message_type_name(message.r#type),
                    message.from_handle,
                    message.subject
                )
            })
            .collect(),
        "No messages",
    )
}

pub(super) fn ask_response(response: OrchestrationServiceAskResponse) -> Value {
    json!({
        "answer": response.answer,
        "messageId": response.message_id,
        "answerMessageId": response.answer_message_id,
        "threadId": response.thread_id,
        "timedOut": response.timed_out,
        "cancelled": response.cancelled,
        "connectionLost": response.connection_lost,
        "timeoutMs": response.timeout_ms
    })
}

pub(super) fn ask_text(response: &OrchestrationServiceAskResponse) -> String {
    if let Some(answer) = &response.answer {
        return answer.clone();
    }
    if response.timed_out {
        return format!("timed_out\tthread={}", response.thread_id);
    }
    if response.cancelled {
        return format!("cancelled\tthread={}", response.thread_id);
    }
    if response.connection_lost {
        return format!("connection_lost\tthread={}", response.thread_id);
    }
    format!("no_answer\tthread={}", response.thread_id)
}

pub(super) fn gate_response(response: OrchestrationServiceGateCreateResponse) -> Value {
    let mut value = Map::new();
    insert(&mut value, "gate", response.gate.map(gate_value));
    insert(
        &mut value,
        "mutation",
        response.mutation.map(mutation_value),
    );
    Value::Object(value)
}

pub(super) fn gate_resolve_response(response: OrchestrationServiceGateResolveResponse) -> Value {
    let mut value = Map::new();
    insert(&mut value, "gate", response.gate.map(gate_value));
    insert(
        &mut value,
        "mutation",
        response.mutation.map(mutation_value),
    );
    Value::Object(value)
}

pub(super) fn gate_text(gate: Option<&OrchestrationGate>) -> String {
    match gate {
        Some(gate) => format!(
            "{}\t{}\t{}",
            gate.id,
            gate_status_name(gate.status),
            gate.question
        ),
        None => "Gate not found".to_owned(),
    }
}

pub(super) fn gate_list_response(response: OrchestrationServiceGateListResponse) -> Value {
    json!({
        "gates": response.gates.into_iter().map(gate_value).collect::<Vec<_>>(),
        "count": response.count
    })
}

pub(super) fn gate_list_text(response: &OrchestrationServiceGateListResponse) -> String {
    lines_or(
        response
            .gates
            .iter()
            .map(|gate| {
                format!(
                    "{}\t{}\t{}",
                    gate.id,
                    gate_status_name(gate.status),
                    gate.question
                )
            })
            .collect(),
        "No gates",
    )
}

fn lines_or(lines: Vec<String>, empty: &str) -> String {
    if lines.is_empty() {
        empty.to_owned()
    } else {
        lines.join("\n")
    }
}

fn insert(target: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        target.insert(key.to_owned(), value);
    }
}

fn run_value(run: OrchestrationRun) -> Value {
    json!({
        "id": run.id,
        "objective": run.objective,
        "homeDatabase": run.home_database,
        "coordinatorHandle": run.coordinator_handle,
        "coordinatorPaneKey": run.coordinator_pane_key,
        "consumerGeneration": run.consumer_generation,
        "legacy": run.legacy,
        "createdAt": run.created_at,
        "updatedAt": run.updated_at
    })
}

fn binding_value(binding: OrchestrationRunBinding) -> Value {
    json!({ "consumerGeneration": binding.consumer_generation })
}

fn task_value(task: OrchestrationTask) -> Value {
    json!({
        "id": task.id,
        "runId": task.run_id,
        "parentId": task.parent_id,
        "createdByTerminalHandle": task.created_by_terminal_handle,
        "taskTitle": task.task_title,
        "displayName": task.display_name,
        "spec": task.spec,
        "status": task_status_name(task.status),
        "deps": task.deps,
        "result": task.result,
        "createdAt": task.created_at,
        "completedAt": task.completed_at,
        "assigneeHandle": task.assignee_handle,
        "dispatchId": task.dispatch_id,
        "specTruncated": task.spec_truncated
    })
}

fn dispatch_value(dispatch: OrchestrationDispatch) -> Value {
    json!({
        "id": dispatch.id,
        "runId": dispatch.run_id,
        "taskId": dispatch.task_id,
        "assigneeHandle": dispatch.assignee_handle,
        "assigneePaneKey": dispatch.assignee_pane_key,
        "status": dispatch_status_name(dispatch.status),
        "failureCount": dispatch.failure_count,
        "lastFailure": dispatch.last_failure,
        "dispatchedAt": dispatch.dispatched_at,
        "completedAt": dispatch.completed_at,
        "createdAt": dispatch.created_at,
        "lastHeartbeatAt": dispatch.last_heartbeat_at
    })
}

fn worker_value(worker: OrchestrationWorker) -> Value {
    json!({
        "dispatchId": worker.dispatch_id,
        "runtimeEpoch": worker.runtime_epoch,
        "state": worker_state_name(worker.state),
        "stage": worker.stage,
        "worktreeId": worker.worktree_id,
        "agentTerminalHandle": worker.agent_terminal_handle,
        "setupState": worker.setup_state,
        "effects": worker.effects.into_iter().map(effect_value).collect::<Vec<_>>(),
        "residualResources": worker.residual_resources.into_iter().map(effect_value).collect::<Vec<_>>(),
        "lastError": worker.last_error,
        "createdAt": worker.created_at,
        "updatedAt": worker.updated_at
    })
}

fn message_value(message: OrchestrationMessage) -> Value {
    json!({
        "id": message.id,
        "runId": message.run_id,
        "from": message.from_handle,
        "to": message.to_handle,
        "subject": message.subject,
        "body": message.body,
        "type": message_type_name(message.r#type),
        "priority": message_priority_name(message.priority),
        "threadId": message.thread_id,
        "payload": message.payload,
        "read": message.read,
        "sequence": message.sequence,
        "createdAt": message.created_at,
        "deliveredAt": message.delivered_at
    })
}

fn gate_value(gate: OrchestrationGate) -> Value {
    json!({
        "id": gate.id,
        "runId": gate.run_id,
        "taskId": gate.task_id,
        "question": gate.question,
        "options": gate.options,
        "status": gate_status_name(gate.status),
        "resolution": gate.resolution,
        "createdAt": gate.created_at,
        "resolvedAt": gate.resolved_at
    })
}

fn question_value(question: OrchestrationQuestion) -> Value {
    json!({
        "messageId": question.message_id,
        "runId": question.run_id,
        "dispatchId": question.dispatch_id,
        "askerHandle": question.asker_handle,
        "status": question.status,
        "answerMessageId": question.answer_message_id,
        "answerBody": question.answer_body,
        "createdAt": question.created_at,
        "answeredAt": question.answered_at,
        "closedAt": question.closed_at
    })
}

fn server_ref_value(server: OrchestrationServerRef) -> Value {
    json!({ "environmentId": server.environment_id, "name": server.name })
}

fn mutation_value(mutation: OrchestrationMutation) -> Value {
    json!({ "requestId": mutation.request_id, "replayed": mutation.replayed })
}

fn setup_receipt_value(receipt: OrchestrationWorkerSetupReceipt) -> Value {
    json!({
        "requested": setup_mode_name(receipt.requested),
        "effective": setup_mode_name(receipt.effective),
        "source": receipt.source,
        "hookFound": receipt.hook_found,
        "startupPolicy": receipt.startup_policy,
        "state": receipt.state
    })
}

fn close_value(close: OrchestrationWorkerStopClose) -> Value {
    json!({ "handle": close.handle, "wasRunning": close.was_running })
}

fn worker_terminal_value(terminal: OrchestrationWorkerTerminal) -> Value {
    json!({
        "paneRuntimeId": terminal.pane_runtime_id,
        "rendererGraphEpoch": terminal.renderer_graph_epoch,
        "transportGeneration": terminal.transport_generation
    })
}

fn observation_value(observation: OrchestrationWorkerObservation) -> Value {
    json!({ "status": observation.status, "exactWorker": observation.exact_worker })
}

fn worker_read_value(read: OrchestrationWorkerReadResult) -> Value {
    json!({
        "dispatchId": read.dispatch_id,
        "terminal": read.terminal.map(|terminal| json!({
            "handle": terminal.handle,
            "status": terminal_state_name(terminal.status),
            "tail": terminal.tail,
            "truncated": terminal.truncated,
            "limited": terminal.limited,
            "oldestCursor": terminal.oldest_cursor,
            "nextCursor": terminal.next_cursor,
            "latestCursor": terminal.latest_cursor,
            "returnedLineCount": terminal.returned_line_count
        })),
        "cursor": read.cursor,
        "workerState": read.worker_state,
        "fallbackReason": read.fallback_reason,
        "warnings": read.warnings
    })
}

fn effect_value(effect: OrchestrationEffect) -> Value {
    let mut fields = Map::new();
    for entry in effect.fields {
        let value = match entry.value.and_then(|field| field.value) {
            Some(orchestration_field_value::Value::Boolean(value)) => Value::Bool(value),
            Some(orchestration_field_value::Value::Integer(value)) => Value::from(value),
            Some(orchestration_field_value::Value::Number(value)) => Value::from(value),
            Some(orchestration_field_value::Value::Text(value)) => Value::String(value),
            None => Value::Null,
        };
        fields.insert(entry.key, value);
    }
    json!({ "kind": effect.kind, "fields": Value::Object(fields) })
}

fn lifecycle_value(
    lifecycle: agentstart_protocol::runtime::v1::OrchestrationLifecycleResult,
) -> Value {
    json!({
        "action": lifecycle.action,
        "code": lifecycle.code,
        "reason": lifecycle.reason,
        "taskId": lifecycle.task_id,
        "dispatchId": lifecycle.dispatch_id
    })
}

fn task_status_name(value: i32) -> String {
    OrchestrationTaskStatus::try_from(value)
        .ok()
        .and_then(|status| crate::rpc::orchestration_values::task_status_str(status).ok())
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string())
}

fn dispatch_status_name(value: i32) -> String {
    OrchestrationDispatchStatus::try_from(value)
        .ok()
        .and_then(crate::rpc::orchestration_values::dispatch_status_str)
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string())
}

fn worker_state_name(value: i32) -> String {
    OrchestrationWorkerState::try_from(value)
        .ok()
        .and_then(crate::rpc::orchestration_values::worker_state_str)
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string())
}

fn gate_status_name(value: i32) -> String {
    OrchestrationGateStatus::try_from(value)
        .ok()
        .and_then(crate::rpc::orchestration_values::gate_status_str)
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string())
}

fn message_type_name(value: i32) -> String {
    OrchestrationMessageType::try_from(value)
        .ok()
        .and_then(crate::rpc::orchestration_values::message_type_str)
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string())
}

fn message_priority_name(value: i32) -> String {
    OrchestrationMessagePriority::try_from(value)
        .ok()
        .and_then(crate::rpc::orchestration_values::message_priority_str)
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string())
}

fn setup_mode_name(value: i32) -> String {
    OrchestrationWorkerSetupMode::try_from(value)
        .ok()
        .and_then(crate::rpc::orchestration_values::setup_mode_str)
        .map(str::to_owned)
        .unwrap_or_else(|| value.to_string())
}

fn terminal_state_name(value: i32) -> String {
    TerminalState::try_from(value)
        .map(|state| state.as_str_name().to_ascii_lowercase())
        .unwrap_or_else(|_| value.to_string())
}

fn task_preview(task: &OrchestrationTask) -> String {
    let first = task.spec.lines().next().unwrap_or_default().trim();
    let mut preview = first.chars().take(72).collect::<String>();
    if first.chars().count() > 72 || task.spec_truncated {
        preview.push_str("...");
    }
    preview
}

fn run_status_text(run: &OrchestrationRun) -> String {
    if run.coordinator_pane_key.is_some() {
        "bound".to_owned()
    } else {
        "unbound".to_owned()
    }
}

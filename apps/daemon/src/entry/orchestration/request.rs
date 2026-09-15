use agentstart_protocol::method_metadata::methods::{
    AgentStartRuntimeV1OrchestrationServiceAsk as AskMethod,
    AgentStartRuntimeV1OrchestrationServiceCheck as CheckMethod,
    AgentStartRuntimeV1OrchestrationServiceDispatch as DispatchMethod,
    AgentStartRuntimeV1OrchestrationServiceDispatchShow as DispatchShowMethod,
    AgentStartRuntimeV1OrchestrationServiceGateCreate as GateCreateMethod,
    AgentStartRuntimeV1OrchestrationServiceGateList as GateListMethod,
    AgentStartRuntimeV1OrchestrationServiceGateResolve as GateResolveMethod,
    AgentStartRuntimeV1OrchestrationServiceInbox as InboxMethod,
    AgentStartRuntimeV1OrchestrationServiceReply as ReplyMethod,
    AgentStartRuntimeV1OrchestrationServiceRunCreate as RunCreateMethod,
    AgentStartRuntimeV1OrchestrationServiceRunCurrent as RunCurrentMethod,
    AgentStartRuntimeV1OrchestrationServiceRunList as RunListMethod,
    AgentStartRuntimeV1OrchestrationServiceRunShow as RunShowMethod,
    AgentStartRuntimeV1OrchestrationServiceRunUse as RunUseMethod,
    AgentStartRuntimeV1OrchestrationServiceSend as SendMethod,
    AgentStartRuntimeV1OrchestrationServiceTaskCreate as TaskCreateMethod,
    AgentStartRuntimeV1OrchestrationServiceTaskList as TaskListMethod,
    AgentStartRuntimeV1OrchestrationServiceTaskUpdate as TaskUpdateMethod,
    AgentStartRuntimeV1OrchestrationServiceWorkerAbandon as WorkerAbandonMethod,
    AgentStartRuntimeV1OrchestrationServiceWorkerRead as WorkerReadMethod,
    AgentStartRuntimeV1OrchestrationServiceWorkerShow as WorkerShowMethod,
    AgentStartRuntimeV1OrchestrationServiceWorkerStart as WorkerStartMethod,
    AgentStartRuntimeV1OrchestrationServiceWorkerStop as WorkerStopMethod,
};
use agentstart_protocol::runtime::v1::{
    OrchestrationGateStatus, OrchestrationMessagePriority, OrchestrationMessageType,
    OrchestrationServiceAskRequest, OrchestrationServiceCheckRequest,
    OrchestrationServiceDispatchRequest, OrchestrationServiceDispatchShowRequest,
    OrchestrationServiceGateCreateRequest, OrchestrationServiceGateListRequest,
    OrchestrationServiceGateResolveRequest, OrchestrationServiceInboxRequest,
    OrchestrationServiceReplyRequest, OrchestrationServiceRunCreateRequest,
    OrchestrationServiceRunCurrentRequest, OrchestrationServiceRunListRequest,
    OrchestrationServiceRunShowRequest, OrchestrationServiceRunUseRequest,
    OrchestrationServiceSendRequest, OrchestrationServiceTaskCreateRequest,
    OrchestrationServiceTaskListRequest, OrchestrationServiceTaskUpdateRequest,
    OrchestrationServiceWorkerAbandonRequest, OrchestrationServiceWorkerReadRequest,
    OrchestrationServiceWorkerShowRequest, OrchestrationServiceWorkerStartRequest,
    OrchestrationServiceWorkerStopRequest, OrchestrationTaskStatus, OrchestrationWorkerSetupMode,
};
use serde_json::{Map, Value};

use crate::rpc::orchestration_values;
use crate::transport::LocalProtocolClient;

use super::input::Args;
use super::output;
use super::{OrchestrationCommandError, blocking_deadline, identity, unary, unary_with_timeout};

/// Why: the daemon refuses a blocking `check`/`ask` beyond this, so the CLI clamps here rather
/// than letting the caller open a call that can never be satisfied.
pub(super) const MAX_TIMEOUT_MS: i64 = 30 * 60 * 1000;

pub(super) async fn run_create(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceRunCreateRequest {
        objective: args.required("objective")?,
        from: identity(peer, args).await?,
    };
    let response = unary::<RunCreateMethod>(peer, &request).await?;
    let text = output::run_binding_text(&response);
    output::write(args, output::run_binding_response(response), text);
    Ok(())
}

pub(super) async fn run_use(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceRunUseRequest {
        id: args.required("id")?,
        from: identity(peer, args).await?,
    };
    let response = unary::<RunUseMethod>(peer, &request).await?;
    let text = output::run_binding_text(&response);
    output::write(args, output::run_binding_response(response), text);
    Ok(())
}

pub(super) async fn run_current(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceRunCurrentRequest {
        from: identity(peer, args).await?,
    };
    let response = unary::<RunCurrentMethod>(peer, &request).await?;
    let text = output::run_current_text(&response);
    output::write(args, output::run_current_response(response), text);
    Ok(())
}

pub(super) async fn run_list(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let response = unary::<RunListMethod>(peer, &OrchestrationServiceRunListRequest {}).await?;
    let text = output::run_list_text(&response);
    output::write(args, output::run_list_response(response), text);
    Ok(())
}

pub(super) async fn run_show(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceRunShowRequest {
        id: args.required("id")?,
        from: Some(identity(peer, args).await?),
    };
    let response = unary::<RunShowMethod>(peer, &request).await?;
    let text = output::run_show_text(&response);
    output::write(args, output::run_show_response(response), text);
    Ok(())
}

pub(super) async fn task_create(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceTaskCreateRequest {
        spec: args.required("spec")?,
        task_title: args.optional("title"),
        display_name: args.optional("display-name"),
        deps: args.all("dep"),
        parent: args.optional("parent"),
        caller_terminal_handle: Some(identity(peer, args).await?),
        run: args.optional("run"),
    };
    let response = unary::<TaskCreateMethod>(peer, &request).await?;
    let text = output::task_text(response.task.as_ref());
    output::write(args, output::task_response(response), text);
    Ok(())
}

pub(super) async fn task_list(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceTaskListRequest {
        status: optional_enum(args, "status", task_status_id)?,
        ready: args.has("ready"),
        brief: args.has("brief"),
        run: args.optional("run"),
        caller_terminal_handle: Some(identity(peer, args).await?),
    };
    let response = unary::<TaskListMethod>(peer, &request).await?;
    let text = output::task_list_text(&response);
    output::write(args, output::task_list_response(response), text);
    Ok(())
}

pub(super) async fn task_update(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceTaskUpdateRequest {
        id: args.required("id")?,
        status: required_enum(args, "status", task_status_id)?,
        result: args.optional("result"),
        run: args.optional("run"),
        caller_terminal_handle: Some(identity(peer, args).await?),
    };
    let response = unary::<TaskUpdateMethod>(peer, &request).await?;
    let text = output::task_text(response.task.as_ref());
    output::write(args, output::task_update_response(response), text);
    Ok(())
}

pub(super) async fn dispatch(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceDispatchRequest {
        task: args.required("task")?,
        to: args.optional("to"),
        from: Some(identity(peer, args).await?),
        inject: args.has("inject"),
        dry_run: args.has("dry-run"),
        return_preamble: args.has("return-preamble"),
        dev_mode: false,
        run: args.optional("run"),
    };
    let response = unary::<DispatchMethod>(peer, &request).await?;
    let (json, text) = output::dispatch_response(response);
    output::write(args, json, text);
    Ok(())
}

pub(super) async fn dispatch_show(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceDispatchShowRequest {
        task: args.required("task")?,
        preamble: args.has("preamble"),
        from: Some(identity(peer, args).await?),
        dev_mode: false,
    };
    let response = unary::<DispatchShowMethod>(peer, &request).await?;
    let text = output::dispatch_show_text(&response);
    output::write(args, output::dispatch_show_response(response), text);
    Ok(())
}

pub(super) async fn worker_start(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceWorkerStartRequest {
        task: args.required("task")?,
        on: None,
        run: args.optional("run"),
        from: identity(peer, args).await?,
        worktree: args.optional("worktree"),
        name: args.optional("name"),
        repo: args.optional("repo"),
        base_branch: args.optional("base-branch"),
        display_name: args.optional("display-name"),
        comment: args.optional("comment"),
        setup: optional_enum(args, "setup", setup_mode_id)?,
        terminal: args.optional("terminal"),
        agent: args.optional("agent"),
        retry_of: args.optional("retry-of"),
        timeout_ms: args.integer("timeout-ms")?,
        dev_mode: false,
    };
    let response = unary::<WorkerStartMethod>(peer, &request).await?;
    let text = output::worker_start_text(&response);
    output::write(args, output::worker_start_response(response), text);
    Ok(())
}

pub(super) async fn worker_show(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceWorkerShowRequest {
        dispatch: args.required("dispatch")?,
    };
    let response = unary::<WorkerShowMethod>(peer, &request).await?;
    let text = output::worker_show_text(&response);
    output::write(args, output::worker_show_response(response), text);
    Ok(())
}

pub(super) async fn worker_read(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceWorkerReadRequest {
        dispatch: args.required("dispatch")?,
        cursor: args.optional("cursor"),
        limit: args.integer("limit")?,
        source: optional_enum(args, "source", read_source_id)?,
    };
    let response = unary::<WorkerReadMethod>(peer, &request).await?;
    let text = output::worker_read_text(&response);
    output::write(args, output::worker_read_response(response), text);
    Ok(())
}

pub(super) async fn worker_stop(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceWorkerStopRequest {
        dispatch: args.required("dispatch")?,
    };
    let response = unary::<WorkerStopMethod>(peer, &request).await?;
    let text = output::worker_stop_text(&response);
    output::write(args, output::worker_stop_response(response), text);
    Ok(())
}

pub(super) async fn worker_abandon(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceWorkerAbandonRequest {
        dispatch: args.required("dispatch")?,
    };
    let response = unary::<WorkerAbandonMethod>(peer, &request).await?;
    let text = output::worker_abandon_text(&response);
    output::write(args, output::worker_abandon_response(response), text);
    Ok(())
}

pub(super) async fn send(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let message_type = optional_enum(args, "type", message_type_id)?;
    if message_type == Some(OrchestrationMessageType::WorkerDone as i32) {
        match args.optional("outcome").as_deref() {
            Some("succeeded" | "failed") => {}
            Some(_) => return Err(OrchestrationCommandError::InvalidFlag("--outcome")),
            None => return Err(OrchestrationCommandError::MissingFlag("--outcome")),
        }
    }
    let request = OrchestrationServiceSendRequest {
        to: args.optional("to"),
        subject: args.required("subject")?,
        from: Some(identity(peer, args).await?),
        body: args.optional("body"),
        r#type: message_type,
        priority: optional_enum(args, "priority", message_priority_id)?,
        thread_id: args.optional("thread-id"),
        payload: payload_value(args)?,
        sender_pane_key: args.optional("pane"),
        run: args.optional("run"),
        dev_mode: false,
        capability: args.optional("dispatch-capability"),
    };
    let response = unary::<SendMethod>(peer, &request).await?;
    let (json, text) = output::send_response(response);
    output::write(args, json, text);
    Ok(())
}

pub(super) async fn check(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let pane = args.optional("pane");
    let terminal = match (pane.is_some(), args.optional("terminal")) {
        (_, Some(handle)) => Some(handle),
        (true, None) => None,
        (false, None) => Some(identity(peer, args).await?),
    };
    let wait = args.has("wait");
    let timeout_ms = args
        .integer("timeout-ms")?
        .unwrap_or(0)
        .clamp(0, MAX_TIMEOUT_MS);
    let all = args.has("all");
    let peek = args.has("peek");
    let request = OrchestrationServiceCheckRequest {
        terminal,
        terminal_pane_key: pane,
        // Why: the daemon treats `unread=false` as "show every message, consume nothing" and only
        // records an ackable delivery when it consumes. Because `CheckRequest.unread` is a plain
        // bool the wire cannot express the legacy "absent" case, so the CLI spells out the default
        // the coordinator actually wants: take the unread mail and hand back a delivery to ack.
        unread: !all && !peek,
        peek,
        all,
        types: message_types(args)?,
        format: args.has("format"),
        inject: false,
        ack: args.optional("ack"),
        run: args.optional("run"),
        wait,
        timeout_ms: wait.then_some(timeout_ms),
    };
    let response = if wait {
        unary_with_timeout::<CheckMethod>(peer, &request, blocking_deadline(timeout_ms)).await?
    } else {
        unary::<CheckMethod>(peer, &request).await?
    };
    let text = output::check_text(&response);
    output::write(args, output::check_response(response), text);
    Ok(())
}

pub(super) async fn reply(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceReplyRequest {
        id: args.required("id")?,
        body: args.required("body")?,
        from: Some(identity(peer, args).await?),
        run: args.optional("run"),
    };
    let response = unary::<ReplyMethod>(peer, &request).await?;
    let text = output::reply_text(&response);
    output::write(args, output::reply_response(response), text);
    Ok(())
}

pub(super) async fn inbox(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let terminal = match args.optional("terminal") {
        Some(handle) => Some(handle),
        None => Some(identity(peer, args).await?),
    };
    let request = OrchestrationServiceInboxRequest {
        limit: args.integer("limit")?,
        terminal,
    };
    let response = unary::<InboxMethod>(peer, &request).await?;
    let text = output::inbox_text(&response);
    output::write(args, output::inbox_response(response), text);
    Ok(())
}

pub(super) async fn ask(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let timeout_ms = args
        .integer("timeout-ms")?
        .unwrap_or(0)
        .clamp(0, MAX_TIMEOUT_MS);
    let request = OrchestrationServiceAskRequest {
        to: args.optional("to"),
        question: Some(args.required("question")?),
        resume: args.optional("resume"),
        options: args.optional("options"),
        timeout_ms: Some(timeout_ms),
        from: Some(identity(peer, args).await?),
        run: args.optional("run"),
        capability: args.optional("dispatch-capability"),
    };
    let response =
        unary_with_timeout::<AskMethod>(peer, &request, blocking_deadline(timeout_ms)).await?;
    let text = output::ask_text(&response);
    output::write(args, output::ask_response(response), text);
    Ok(())
}

pub(super) async fn gate_create(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceGateCreateRequest {
        task: args.required("task")?,
        question: args.required("question")?,
        options: args.all("option"),
    };
    let response = unary::<GateCreateMethod>(peer, &request).await?;
    let text = output::gate_text(response.gate.as_ref());
    output::write(args, output::gate_response(response), text);
    Ok(())
}

pub(super) async fn gate_resolve(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceGateResolveRequest {
        id: args.required("id")?,
        resolution: args.required("resolution")?,
    };
    let response = unary::<GateResolveMethod>(peer, &request).await?;
    let text = output::gate_text(response.gate.as_ref());
    output::write(args, output::gate_resolve_response(response), text);
    Ok(())
}

pub(super) async fn gate_list(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<(), OrchestrationCommandError> {
    let request = OrchestrationServiceGateListRequest {
        task: args.optional("task"),
        status: optional_enum(args, "status", gate_status_id)?,
    };
    let response = unary::<GateListMethod>(peer, &request).await?;
    let text = output::gate_list_text(&response);
    output::write(args, output::gate_list_response(response), text);
    Ok(())
}

/// Why: `worker_done`/`heartbeat` carry `taskId`/`dispatchId`/`outcome` inside the message's
/// `payload` rather than as wire fields — the daemon routes on `payload.dispatchId`. The CLI
/// folds them in so a worker can pass what the dispatch preamble told it to.
fn payload_value(args: &Args) -> Result<Option<String>, OrchestrationCommandError> {
    let mut object = match args.optional("payload") {
        Some(raw) => match serde_json::from_str::<Value>(&raw)? {
            Value::Object(object) => object,
            _ => return Err(OrchestrationCommandError::InvalidFlag("--payload")),
        },
        None => Map::new(),
    };
    for (flag, key) in [
        ("task-id", "taskId"),
        ("dispatch-id", "dispatchId"),
        ("outcome", "outcome"),
    ] {
        if let Some(value) = args.optional(flag) {
            object.insert(key.to_owned(), Value::String(value));
        }
    }
    if object.is_empty() {
        return Ok(None);
    }
    Ok(Some(serde_json::to_string(&Value::Object(object))?))
}

fn message_types(args: &Args) -> Result<Vec<i32>, OrchestrationCommandError> {
    args.all("type")
        .iter()
        .map(|value| {
            let parsed = message_type_id(value)?;
            Ok(parsed)
        })
        .collect()
}

fn optional_enum(
    args: &Args,
    flag: &'static str,
    parse: fn(&str) -> Result<i32, OrchestrationCommandError>,
) -> Result<Option<i32>, OrchestrationCommandError> {
    match args.optional(flag) {
        Some(value) => Ok(Some(parse(&value)?)),
        None => Ok(None),
    }
}

fn required_enum(
    args: &Args,
    flag: &'static str,
    parse: fn(&str) -> Result<i32, OrchestrationCommandError>,
) -> Result<i32, OrchestrationCommandError> {
    match args.optional(flag) {
        Some(value) => parse(&value),
        None => Err(OrchestrationCommandError::MissingFlag(flag)),
    }
}

fn task_status_id(value: &str) -> Result<i32, OrchestrationCommandError> {
    let status = orchestration_values::task_status(value);
    if status == OrchestrationTaskStatus::Unspecified {
        return Err(OrchestrationCommandError::InvalidFlag("--status"));
    }
    Ok(status as i32)
}

fn message_type_id(value: &str) -> Result<i32, OrchestrationCommandError> {
    let message_type = orchestration_values::message_type(value);
    if message_type == OrchestrationMessageType::Unspecified {
        return Err(OrchestrationCommandError::InvalidFlag("--type"));
    }
    Ok(message_type as i32)
}

fn message_priority_id(value: &str) -> Result<i32, OrchestrationCommandError> {
    let priority = orchestration_values::message_priority(value);
    if priority == OrchestrationMessagePriority::Unspecified {
        return Err(OrchestrationCommandError::InvalidFlag("--priority"));
    }
    Ok(priority as i32)
}

fn gate_status_id(value: &str) -> Result<i32, OrchestrationCommandError> {
    let status = orchestration_values::gate_status(value);
    if status == OrchestrationGateStatus::Unspecified {
        return Err(OrchestrationCommandError::InvalidFlag("--status"));
    }
    Ok(status as i32)
}

fn setup_mode_id(value: &str) -> Result<i32, OrchestrationCommandError> {
    let setup = orchestration_values::setup_mode(value);
    if setup == OrchestrationWorkerSetupMode::Unspecified {
        return Err(OrchestrationCommandError::InvalidFlag("--setup"));
    }
    Ok(setup as i32)
}

fn read_source_id(value: &str) -> Result<i32, OrchestrationCommandError> {
    let source = orchestration_values::worker_read_source(value);
    if source == agentstart_protocol::runtime::v1::OrchestrationWorkerReadSource::Unspecified {
        return Err(OrchestrationCommandError::InvalidFlag("--source"));
    }
    Ok(source as i32)
}

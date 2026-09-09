use serde_json::{Map, Value, json};
use yiru_protocol::protocol::v1::Status;
use yiru_protocol::runtime::v1::{
    OrchestrationServiceWorkerAbandonRequest, OrchestrationServiceWorkerAbandonResponse,
    OrchestrationServiceWorkerReadRequest, OrchestrationServiceWorkerReadResponse,
    OrchestrationServiceWorkerShowRequest, OrchestrationServiceWorkerShowResponse,
    OrchestrationServiceWorkerStartRequest, OrchestrationServiceWorkerStartResponse,
    OrchestrationServiceWorkerStopRequest, OrchestrationServiceWorkerStopResponse,
    OrchestrationWorkerObservation, OrchestrationWorkerReadSource, OrchestrationWorkerSetupMode,
    OrchestrationWorkerState, OrchestrationWorkerStopClose,
};
use yiru_protocol::transport::{decode, encode};

use super::super::OrchestrationRpc;
use super::values::{
    effects, field, invoke, mutation, optional_str, process_action, required, required_bool,
    required_str, server_ref, setup_mode_str, setup_receipt, worker, worker_read_result,
    worker_state, worker_terminal,
};

pub(in crate::rpc) async fn worker_start(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceWorkerStartRequest>(payload)?;
    let task = required(&request.task, "task")?;
    let from = required(&request.from, "from")?;
    let mut body = Map::new();
    body.insert("task".to_owned(), json!(task));
    optional_string(&mut body, "on", request.on);
    optional_string(&mut body, "run", request.run);
    body.insert("from".to_owned(), json!(from));
    optional_string(&mut body, "worktree", request.worktree);
    optional_string(&mut body, "name", request.name);
    optional_string(&mut body, "repo", request.repo);
    optional_string(&mut body, "baseBranch", request.base_branch);
    optional_string(&mut body, "displayName", request.display_name);
    optional_string(&mut body, "comment", request.comment);
    if let Some(setup) = request
        .setup
        .and_then(|raw| OrchestrationWorkerSetupMode::try_from(raw).ok())
        .and_then(setup_mode_str)
    {
        body.insert("setup".to_owned(), json!(setup));
    }
    optional_string(&mut body, "terminal", request.terminal);
    optional_string(&mut body, "agent", request.agent);
    optional_string(&mut body, "retryOf", request.retry_of);
    if let Some(timeout) = request.timeout_ms {
        body.insert("timeoutMs".to_owned(), json!(timeout));
    }
    body.insert("devMode".to_owned(), json!(request.dev_mode));
    let response = invoke(
        rpc,
        "orchestration.workerStart",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceWorkerStartResponse {
        run_id: optional_str(&response, "runId"),
        task_id: required_str(&response, "taskId")?.to_owned(),
        dispatch_id: required_str(&response, "dispatchId")?.to_owned(),
        state: worker_state(required_str(&response, "state")?) as i32,
        stage: required_str(&response, "stage")?.to_owned(),
        server: response.get("server").map(server_ref).transpose()?,
        setup: response.get("setup").map(setup_receipt).transpose()?,
        timeout_ms: response.get("timeoutMs").and_then(Value::as_i64),
        failed_stage: optional_str(&response, "failedStage"),
        last_error: optional_str(&response, "lastError"),
        effects: effects(&response, "effects"),
        residual_resources: effects(&response, "residualResources"),
        warning: optional_str(&response, "warning"),
        next_commands: response
            .get("nextCommands")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn worker_show(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceWorkerShowRequest>(payload)?;
    let dispatch_id = required(&request.dispatch, "dispatch")?;
    let response = invoke(
        rpc,
        "orchestration.workerShow",
        json!({ "dispatch": dispatch_id }),
        principal_id,
        None,
    )
    .await?;
    let terminal = response
        .get("terminal")
        .filter(|value| !value.is_null())
        .map(worker_terminal)
        .transpose()?;
    let observation = field(&response, "observation")?;
    Ok(encode(&OrchestrationServiceWorkerShowResponse {
        dispatch: response
            .get("dispatch")
            .filter(|value| !value.is_null())
            .map(super::values::dispatch)
            .transpose()?,
        worker: Some(worker(field(&response, "worker")?)?),
        server: response.get("server").map(server_ref).transpose()?,
        remote_runtime_epoch: optional_str(&response, "remoteRuntimeEpoch"),
        terminal,
        observation: Some(OrchestrationWorkerObservation {
            status: required_str(observation, "status")?.to_owned(),
            exact_worker: required_bool(observation, "exactWorker")?,
        }),
    }))
}

pub(in crate::rpc) async fn worker_read(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceWorkerReadRequest>(payload)?;
    let dispatch_id = required(&request.dispatch, "dispatch")?;
    let mut body = Map::new();
    body.insert("dispatch".to_owned(), json!(dispatch_id));
    optional_string(&mut body, "cursor", request.cursor);
    if let Some(limit) = request.limit {
        body.insert("limit".to_owned(), json!(limit));
    }
    if let Some(source) = request
        .source
        .and_then(|raw| OrchestrationWorkerReadSource::try_from(raw).ok())
        .and_then(super::values::worker_read_source_str)
    {
        body.insert("source".to_owned(), json!(source));
    }
    let response = invoke(
        rpc,
        "orchestration.workerRead",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceWorkerReadResponse {
        output: Some(worker_read_result(&response)?),
        server: response.get("server").map(server_ref).transpose()?,
        remote_runtime_epoch: optional_str(&response, "remoteRuntimeEpoch"),
    }))
}

pub(in crate::rpc) async fn worker_stop(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceWorkerStopRequest>(payload)?;
    let dispatch_id = required(&request.dispatch, "dispatch")?;
    let response = invoke(
        rpc,
        "orchestration.workerStop",
        json!({ "dispatch": dispatch_id }),
        principal_id,
        None,
    )
    .await?;
    let close = response
        .get("close")
        .map(|value| {
            Ok::<_, Status>(OrchestrationWorkerStopClose {
                handle: required_str(value, "handle")?.to_owned(),
                was_running: required_bool(value, "wasRunning")?,
            })
        })
        .transpose()?;
    Ok(encode(&OrchestrationServiceWorkerStopResponse {
        dispatch_id: required_str(&response, "dispatchId")?.to_owned(),
        state: response
            .get("state")
            .and_then(Value::as_str)
            .map(worker_state)
            .unwrap_or(OrchestrationWorkerState::Unspecified) as i32,
        already_settled: required_bool(&response, "alreadySettled")?,
        process_action: process_action(required_str(&response, "processAction")?) as i32,
        close,
        last_error: optional_str(&response, "lastError"),
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn worker_abandon(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceWorkerAbandonRequest>(payload)?;
    let dispatch_id = required(&request.dispatch, "dispatch")?;
    let response = invoke(
        rpc,
        "orchestration.workerAbandon",
        json!({ "dispatch": dispatch_id }),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceWorkerAbandonResponse {
        dispatch_id: required_str(&response, "dispatchId")?.to_owned(),
        state: response
            .get("state")
            .and_then(Value::as_str)
            .map(worker_state)
            .unwrap_or(OrchestrationWorkerState::Unspecified) as i32,
        already_settled: required_bool(&response, "alreadySettled")?,
        stale: required_bool(&response, "stale")?,
        process_action: process_action(required_str(&response, "processAction")?) as i32,
        warning: required_str(&response, "warning")?.to_owned(),
        residual_resources: effects(&response, "residualResources"),
        mutation: mutation(&response),
    }))
}

fn optional_string(body: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value.filter(|value| !value.is_empty()) {
        body.insert(key.to_owned(), json!(value));
    }
}

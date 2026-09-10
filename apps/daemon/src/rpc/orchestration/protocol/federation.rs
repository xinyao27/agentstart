use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    OrchestrationServiceFederationAckRequest, OrchestrationServiceFederationAckResponse,
    OrchestrationServiceFederationAttachStartRequest,
    OrchestrationServiceFederationAttachStartResponse, OrchestrationServiceFederationImportRequest,
    OrchestrationServiceFederationImportResponse, OrchestrationServiceFederationPullRequest,
    OrchestrationServiceFederationPullResponse, OrchestrationServiceFederationReadOutputRequest,
    OrchestrationServiceFederationReadOutputResponse, OrchestrationServiceFederationReadRequest,
    OrchestrationServiceFederationReadResponse, OrchestrationServiceFederationShowRequest,
    OrchestrationServiceFederationShowResponse, OrchestrationServiceFederationStopRequest,
    OrchestrationServiceFederationStopResponse, OrchestrationWorkerObservation,
    OrchestrationWorkerReadSource, OrchestrationWorkerSetupMode, OrchestrationWorkerState,
    OrchestrationWorkerStopClose,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::{Map, Value, json};

use super::super::OrchestrationRpc;
use super::values::{
    effects, field, invoke, mutation, optional_str, process_action, relay_item, remote_attachment,
    required, required_bool, required_i64, required_str, required_u64, setup_mode_str,
    setup_receipt, terminal_read, worker_read_result, worker_state, worker_terminal,
};

pub(in crate::rpc) async fn federation_attach_start(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceFederationAttachStartRequest>(payload)?;
    let dispatch_id = required(&request.dispatch_id, "dispatch_id")?;
    let task_id = required(&request.task_id, "task_id")?;
    let task_spec = required(&request.task_spec, "task_spec")?;
    let worktree = required(&request.worktree, "worktree")?;
    let mut body = Map::new();
    body.insert("dispatchId".to_owned(), json!(dispatch_id));
    body.insert("taskId".to_owned(), json!(task_id));
    body.insert("taskSpec".to_owned(), json!(task_spec));
    body.insert(
        "protocolVersion".to_owned(),
        json!(request.protocol_version),
    );
    body.insert("worktree".to_owned(), json!(worktree));
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
    if let Some(source) = request
        .setup_source
        .and_then(|raw| {
            agentstart_protocol::runtime::v1::OrchestrationWorkerSetupSource::try_from(raw).ok()
        })
        .and_then(super::values::setup_source_str)
    {
        body.insert("setupSource".to_owned(), json!(source));
    }
    optional_string(&mut body, "terminal", request.terminal);
    optional_string(&mut body, "agent", request.agent);
    if let Some(timeout) = request.timeout_ms {
        body.insert("timeoutMs".to_owned(), json!(timeout));
    }
    body.insert("devMode".to_owned(), json!(request.dev_mode));
    let response = invoke(
        rpc,
        "orchestration.federationAttachStart",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceFederationAttachStartResponse {
        dispatch_id: required_str(&response, "dispatchId")?.to_owned(),
        state: worker_state(required_str(&response, "state")?) as i32,
        stage: required_str(&response, "stage")?.to_owned(),
        runtime_epoch: required_str(&response, "runtimeEpoch")?.to_owned(),
        worktree_id: optional_str(&response, "worktreeId"),
        terminal_handle: optional_str(&response, "terminalHandle"),
        setup: Some(setup_receipt(field(&response, "setup")?)?),
        failed_stage: optional_str(&response, "failedStage"),
        last_error: optional_str(&response, "lastError"),
        effects: effects(&response, "effects"),
        residual_resources: effects(&response, "residualResources"),
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn federation_pull(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceFederationPullRequest>(payload)?;
    let dispatch_id = required(&request.dispatch_id, "dispatch_id")?;
    let mut body = Map::new();
    body.insert("dispatchId".to_owned(), json!(dispatch_id));
    if let Some(after) = request.after_sequence {
        body.insert("afterSequence".to_owned(), json!(after));
    }
    if let Some(limit) = request.limit {
        body.insert("limit".to_owned(), json!(limit));
    }
    let response = invoke(
        rpc,
        "orchestration.federationPull",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    let items = response
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(encode(&OrchestrationServiceFederationPullResponse {
        dispatch_id: required_str(&response, "dispatchId")?.to_owned(),
        runtime_epoch: required_str(&response, "runtimeEpoch")?.to_owned(),
        items: items
            .iter()
            .map(relay_item)
            .collect::<Result<Vec<_>, _>>()?,
    }))
}

pub(in crate::rpc) async fn federation_ack(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceFederationAckRequest>(payload)?;
    let dispatch_id = required(&request.dispatch_id, "dispatch_id")?;
    let response = invoke(
        rpc,
        "orchestration.federationAck",
        json!({ "dispatchId": dispatch_id, "throughSequence": request.through_sequence }),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceFederationAckResponse {
        dispatch_id: required_str(&response, "dispatchId")?.to_owned(),
        acknowledged_through: required_i64(&response, "acknowledgedThrough")?,
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn federation_import(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceFederationImportRequest>(payload)?;
    let dispatch_id = required(&request.dispatch_id, "dispatch_id")?;
    let items = request
        .items
        .iter()
        .map(|item| {
            json!({
                "dispatch_id": item.dispatch_id,
                "direction": "to_worker",
                "sequence": item.sequence,
                "message_id": item.message_id,
                "kind": item.kind,
                "payload": item.payload,
            })
        })
        .collect::<Vec<_>>();
    let response = invoke(
        rpc,
        "orchestration.federationImport",
        json!({ "dispatchId": dispatch_id, "items": items }),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceFederationImportResponse {
        dispatch_id: required_str(&response, "dispatchId")?.to_owned(),
        acknowledged_through: required_i64(&response, "acknowledgedThrough")?,
        imported: required_u64(&response, "imported")?,
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn federation_show(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceFederationShowRequest>(payload)?;
    let dispatch_id = required(&request.dispatch_id, "dispatch_id")?;
    let response = invoke(
        rpc,
        "orchestration.federationShow",
        json!({ "dispatchId": dispatch_id }),
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
    Ok(encode(&OrchestrationServiceFederationShowResponse {
        dispatch_id: required_str(&response, "dispatchId")?.to_owned(),
        runtime_epoch: required_str(&response, "runtimeEpoch")?.to_owned(),
        attachment: Some(remote_attachment(field(&response, "attachment")?)?),
        terminal,
        observation: Some(OrchestrationWorkerObservation {
            status: required_str(observation, "status")?.to_owned(),
            exact_worker: required_bool(observation, "exactWorker")?,
        }),
    }))
}

pub(in crate::rpc) async fn federation_read(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceFederationReadRequest>(payload)?;
    let dispatch_id = required(&request.dispatch_id, "dispatch_id")?;
    let mut body = Map::new();
    body.insert("dispatchId".to_owned(), json!(dispatch_id));
    optional_string(&mut body, "cursor", request.cursor);
    if let Some(limit) = request.limit {
        body.insert("limit".to_owned(), json!(limit));
    }
    let response = invoke(
        rpc,
        "orchestration.federationRead",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceFederationReadResponse {
        dispatch_id: required_str(&response, "dispatchId")?.to_owned(),
        runtime_epoch: required_str(&response, "runtimeEpoch")?.to_owned(),
        terminal: Some(terminal_read(field(&response, "terminal")?)?),
    }))
}

pub(in crate::rpc) async fn federation_read_output(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceFederationReadOutputRequest>(payload)?;
    let dispatch_id = required(&request.dispatch_id, "dispatch_id")?;
    let mut body = Map::new();
    body.insert("dispatchId".to_owned(), json!(dispatch_id));
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
        "orchestration.federationReadOutput",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceFederationReadOutputResponse {
        dispatch_id: required_str(&response, "dispatchId")?.to_owned(),
        runtime_epoch: required_str(&response, "runtimeEpoch")?.to_owned(),
        output: Some(worker_read_result(field(&response, "output")?)?),
    }))
}

pub(in crate::rpc) async fn federation_stop(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceFederationStopRequest>(payload)?;
    let dispatch_id = required(&request.dispatch_id, "dispatch_id")?;
    let response = invoke(
        rpc,
        "orchestration.federationStop",
        json!({ "dispatchId": dispatch_id }),
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
    Ok(encode(&OrchestrationServiceFederationStopResponse {
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

fn optional_string(body: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value.filter(|value| !value.is_empty()) {
        body.insert(key.to_owned(), json!(value));
    }
}

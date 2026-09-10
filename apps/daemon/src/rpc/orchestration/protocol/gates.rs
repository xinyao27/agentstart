use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    OrchestrationGateStatus, OrchestrationResetScope, OrchestrationServiceGateCreateRequest,
    OrchestrationServiceGateCreateResponse, OrchestrationServiceGateListRequest,
    OrchestrationServiceGateListResponse, OrchestrationServiceGateResolveRequest,
    OrchestrationServiceGateResolveResponse, OrchestrationServiceResetRequest,
    OrchestrationServiceResetResponse,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::{Map, Value, json};

use super::super::OrchestrationRpc;
use super::values::{
    encode_string_array, field, gate, gate_status_str, invoke, mutation, required, required_i64,
    required_str, reset_scope, reset_scope_str,
};

pub(in crate::rpc) async fn gate_create(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceGateCreateRequest>(payload)?;
    let task = required(&request.task, "task")?;
    let question = required(&request.question, "question")?;
    let mut body = Map::new();
    body.insert("task".to_owned(), json!(task));
    body.insert("question".to_owned(), json!(question));
    if !request.options.is_empty() {
        body.insert(
            "options".to_owned(),
            json!(encode_string_array(&request.options)?),
        );
    }
    let response = invoke(
        rpc,
        "orchestration.gateCreate",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceGateCreateResponse {
        gate: Some(gate(field(&response, "gate")?)?),
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn gate_resolve(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceGateResolveRequest>(payload)?;
    let id = required(&request.id, "id")?;
    let resolution = required(&request.resolution, "resolution")?;
    let response = invoke(
        rpc,
        "orchestration.gateResolve",
        json!({ "id": id, "resolution": resolution }),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceGateResolveResponse {
        gate: Some(gate(field(&response, "gate")?)?),
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn gate_list(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceGateListRequest>(payload)?;
    let mut body = Map::new();
    if let Some(task) = request.task.filter(|value| !value.is_empty()) {
        body.insert("task".to_owned(), json!(task));
    }
    if let Some(status) = request
        .status
        .and_then(|raw| OrchestrationGateStatus::try_from(raw).ok())
        .and_then(gate_status_str)
    {
        body.insert("status".to_owned(), json!(status));
    }
    let response = invoke(
        rpc,
        "orchestration.gateList",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    let gates = response
        .get("gates")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(encode(&OrchestrationServiceGateListResponse {
        gates: gates.iter().map(gate).collect::<Result<Vec<_>, _>>()?,
        count: required_i64(&response, "count")?,
    }))
}

// Why: `--all` truncates every run/task/message/gate on the host, not just the caller's run; see
// OrchestrationServiceResetRequest.
pub(in crate::rpc) async fn reset(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceResetRequest>(payload)?;
    let scope = reset_scope_str(
        OrchestrationResetScope::try_from(request.scope)
            .map_err(|_| super::values::invalid("Reset scope is invalid"))?,
    )?;
    let mut body = Map::new();
    body.insert(scope.to_owned(), json!(true));
    let response = invoke(
        rpc,
        "orchestration.reset",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceResetResponse {
        reset: reset_scope(required_str(&response, "reset")?) as i32,
        mutation: mutation(&response),
    }))
}

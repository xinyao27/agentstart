use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    OrchestrationServiceRunBindingResponse, OrchestrationServiceRunCreateRequest,
    OrchestrationServiceRunCurrentRequest, OrchestrationServiceRunCurrentResponse,
    OrchestrationServiceRunListRequest, OrchestrationServiceRunListResponse,
    OrchestrationServiceRunShowRequest, OrchestrationServiceRunShowResponse,
    OrchestrationServiceRunUseRequest,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::json;

use super::super::OrchestrationRpc;
use super::values::{field, invoke, mutation, required, run, run_binding};

pub(in crate::rpc) async fn run_create(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceRunCreateRequest>(payload)?;
    let objective = required(&request.objective, "objective")?;
    let from = required(&request.from, "from")?;
    let response = invoke(
        rpc,
        "orchestration.runCreate",
        json!({ "objective": objective, "from": from }),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceRunBindingResponse {
        run: Some(run(field(&response, "run")?)?),
        binding: Some(run_binding(&response)?),
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn run_use(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceRunUseRequest>(payload)?;
    let id = required(&request.id, "id")?;
    let from = required(&request.from, "from")?;
    let response = invoke(
        rpc,
        "orchestration.runUse",
        json!({ "id": id, "from": from }),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceRunBindingResponse {
        run: Some(run(field(&response, "run")?)?),
        binding: Some(run_binding(&response)?),
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn run_current(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceRunCurrentRequest>(payload)?;
    let from = required(&request.from, "from")?;
    let response = invoke(
        rpc,
        "orchestration.runCurrent",
        json!({ "from": from }),
        principal_id,
        None,
    )
    .await?;
    let current = response.get("run").filter(|value| !value.is_null());
    Ok(encode(&OrchestrationServiceRunCurrentResponse {
        run: current.map(run).transpose()?,
    }))
}

pub(in crate::rpc) async fn run_list(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    decode::<OrchestrationServiceRunListRequest>(payload)?;
    let response = invoke(rpc, "orchestration.runList", json!({}), principal_id, None).await?;
    let runs = response
        .get("runs")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(encode(&OrchestrationServiceRunListResponse {
        runs: runs.iter().map(run).collect::<Result<Vec<_>, _>>()?,
    }))
}

pub(in crate::rpc) async fn run_show(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceRunShowRequest>(payload)?;
    let id = required(&request.id, "id")?;
    let mut body = serde_json::Map::new();
    body.insert("id".to_owned(), json!(id));
    if let Some(from) = request.from.as_deref().filter(|value| !value.is_empty()) {
        body.insert("from".to_owned(), json!(from));
    }
    let response = invoke(
        rpc,
        "orchestration.runShow",
        serde_json::Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceRunShowResponse {
        run: Some(run(field(&response, "run")?)?),
    }))
}

use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    OrchestrationServiceTaskCreateRequest, OrchestrationServiceTaskCreateResponse,
    OrchestrationServiceTaskListRequest, OrchestrationServiceTaskListResponse,
    OrchestrationServiceTaskUpdateRequest, OrchestrationServiceTaskUpdateResponse,
    OrchestrationTaskStatus,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::{Map, json};

use super::super::OrchestrationRpc;
use super::values::{
    encode_string_array, field, invoke, mutation, required, required_bool, required_i64,
    required_str, task, task_status_str,
};

pub(in crate::rpc) async fn task_create(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceTaskCreateRequest>(payload)?;
    let spec = required(&request.spec, "spec")?;
    let mut body = Map::new();
    body.insert("spec".to_owned(), json!(spec));
    optional_into(&mut body, "taskTitle", request.task_title);
    optional_into(&mut body, "displayName", request.display_name);
    if !request.deps.is_empty() {
        body.insert(
            "deps".to_owned(),
            json!(encode_string_array(&request.deps)?),
        );
    }
    optional_into(&mut body, "parent", request.parent);
    optional_into(
        &mut body,
        "callerTerminalHandle",
        request.caller_terminal_handle,
    );
    optional_into(&mut body, "run", request.run);
    let response = invoke(
        rpc,
        "orchestration.taskCreate",
        serde_json::Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceTaskCreateResponse {
        task: Some(task(field(&response, "task")?)?),
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn task_list(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceTaskListRequest>(payload)?;
    let mut body = Map::new();
    if let Some(status) = request
        .status
        .and_then(|raw| OrchestrationTaskStatus::try_from(raw).ok())
        .and_then(|status| task_status_str(status).ok())
    {
        body.insert("status".to_owned(), json!(status));
    }
    body.insert("ready".to_owned(), json!(request.ready));
    body.insert("brief".to_owned(), json!(request.brief));
    optional_into(&mut body, "run", request.run);
    optional_into(
        &mut body,
        "callerTerminalHandle",
        request.caller_terminal_handle,
    );
    let response = invoke(
        rpc,
        "orchestration.taskList",
        serde_json::Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    let tasks = response
        .get("tasks")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(encode(&OrchestrationServiceTaskListResponse {
        run_id: required_str(&response, "runId")?.to_owned(),
        legacy_read_only: required_bool(&response, "legacyReadOnly")?,
        tasks: tasks.iter().map(task).collect::<Result<Vec<_>, _>>()?,
        count: required_i64(&response, "count")?,
    }))
}

pub(in crate::rpc) async fn task_update(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceTaskUpdateRequest>(payload)?;
    let id = required(&request.id, "id")?;
    let status = task_status_str(
        OrchestrationTaskStatus::try_from(request.status)
            .map_err(|_| super::values::invalid("Task status is invalid"))?,
    )?;
    let mut body = Map::new();
    body.insert("id".to_owned(), json!(id));
    body.insert("status".to_owned(), json!(status));
    optional_into(&mut body, "result", request.result);
    optional_into(&mut body, "run", request.run);
    optional_into(
        &mut body,
        "callerTerminalHandle",
        request.caller_terminal_handle,
    );
    let response = invoke(
        rpc,
        "orchestration.taskUpdate",
        serde_json::Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceTaskUpdateResponse {
        task: Some(task(field(&response, "task")?)?),
        mutation: mutation(&response),
    }))
}

fn optional_into(body: &mut Map<String, serde_json::Value>, key: &str, value: Option<String>) {
    if let Some(value) = value.filter(|value| !value.is_empty()) {
        body.insert(key.to_owned(), json!(value));
    }
}

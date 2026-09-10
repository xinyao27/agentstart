use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    OrchestrationDispatchDryRunOutcome, OrchestrationDispatchOutcome,
    OrchestrationServiceDispatchRequest, OrchestrationServiceDispatchResponse,
    OrchestrationServiceDispatchShowRequest, OrchestrationServiceDispatchShowResponse,
    orchestration_service_dispatch_response::Outcome,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::{Map, Value, json};

use super::super::OrchestrationRpc;
use super::values::{
    dispatch as dispatch_message, field, invoke, mutation, optional_str, required,
};

pub(in crate::rpc) async fn dispatch(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceDispatchRequest>(payload)?;
    let task = required(&request.task, "task")?;
    let mut body = Map::new();
    body.insert("task".to_owned(), json!(task));
    optional_string(&mut body, "to", request.to);
    optional_string(&mut body, "from", request.from);
    body.insert("inject".to_owned(), json!(request.inject));
    body.insert("dryRun".to_owned(), json!(request.dry_run));
    body.insert("returnPreamble".to_owned(), json!(request.return_preamble));
    body.insert("devMode".to_owned(), json!(request.dev_mode));
    optional_string(&mut body, "run", request.run);
    let response = invoke(
        rpc,
        "orchestration.dispatch",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    let outcome = if response.get("dryRun").and_then(Value::as_bool) == Some(true) {
        Outcome::DryRun(OrchestrationDispatchDryRunOutcome {
            preamble: field(&response, "preamble")?
                .as_str()
                .ok_or_else(|| super::values::internal("preamble"))?
                .to_owned(),
        })
    } else {
        Outcome::Dispatched(OrchestrationDispatchOutcome {
            dispatch: Some(dispatch_message(field(&response, "dispatch")?)?),
            injected: response
                .get("injected")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            preamble: optional_str(&response, "preamble"),
        })
    };
    Ok(encode(&OrchestrationServiceDispatchResponse {
        outcome: Some(outcome),
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn dispatch_show(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceDispatchShowRequest>(payload)?;
    let task = required(&request.task, "task")?;
    let mut body = Map::new();
    body.insert("task".to_owned(), json!(task));
    body.insert("preamble".to_owned(), json!(request.preamble));
    optional_string(&mut body, "from", request.from);
    body.insert("devMode".to_owned(), json!(request.dev_mode));
    let response = invoke(
        rpc,
        "orchestration.dispatchShow",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    let dispatch = response
        .get("dispatch")
        .filter(|value| !value.is_null())
        .map(dispatch_message)
        .transpose()?;
    Ok(encode(&OrchestrationServiceDispatchShowResponse {
        dispatch,
        preamble: optional_str(&response, "preamble"),
    }))
}

fn optional_string(body: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value.filter(|value| !value.is_empty()) {
        body.insert(key.to_owned(), json!(value));
    }
}

use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    OrchestrationLifecycleAction, OrchestrationLifecycleResult, OrchestrationMessagePriority,
    OrchestrationMessageType, OrchestrationRelayAcceptance, OrchestrationRelayDestination,
    OrchestrationRelayLifecycle, OrchestrationSendBroadcastOutcome,
    OrchestrationSendMessageOutcome, OrchestrationSendRelayOutcome, OrchestrationServiceAskRequest,
    OrchestrationServiceAskResponse, OrchestrationServiceCheckRequest,
    OrchestrationServiceCheckResponse, OrchestrationServiceInboxRequest,
    OrchestrationServiceInboxResponse, OrchestrationServiceReplyRequest,
    OrchestrationServiceReplyResponse, OrchestrationServiceSendRequest,
    OrchestrationServiceSendResponse, orchestration_service_send_response::Outcome,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::{Map, Value, json};

use super::super::OrchestrationRpc;
use super::values::{
    field, invoke, message, message_priority_str, message_type_str, mutation, optional_i64,
    optional_str, question, required, required_bool, required_i64, required_str,
};

pub(in crate::rpc) async fn send(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceSendRequest>(payload)?;
    let subject = required(&request.subject, "subject")?;
    let mut body = Map::new();
    body.insert("subject".to_owned(), json!(subject));
    optional_string(&mut body, "to", request.to);
    optional_string(&mut body, "from", request.from);
    optional_string(&mut body, "body", request.body);
    if let Some(kind) = request
        .r#type
        .and_then(|raw| OrchestrationMessageType::try_from(raw).ok())
        .and_then(message_type_str)
    {
        body.insert("type".to_owned(), json!(kind));
    }
    if let Some(priority) = request
        .priority
        .and_then(|raw| OrchestrationMessagePriority::try_from(raw).ok())
        .and_then(message_priority_str)
    {
        body.insert("priority".to_owned(), json!(priority));
    }
    optional_string(&mut body, "threadId", request.thread_id);
    optional_string(&mut body, "payload", request.payload);
    optional_string(&mut body, "senderPaneKey", request.sender_pane_key);
    optional_string(&mut body, "run", request.run);
    body.insert("devMode".to_owned(), json!(request.dev_mode));
    let capability = request.capability.filter(|value| !value.is_empty());
    let response = invoke(
        rpc,
        "orchestration.send",
        Value::Object(body),
        principal_id,
        capability,
    )
    .await?;
    let outcome = if response.get("messages").is_some() {
        let messages = response
            .get("messages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        Outcome::Broadcast(OrchestrationSendBroadcastOutcome {
            messages: messages
                .iter()
                .map(message)
                .collect::<Result<Vec<_>, _>>()?,
            recipients: u32::try_from(required_i64(&response, "recipients")?).unwrap_or(0),
        })
    } else if let Some(relay) = response.get("relay") {
        Outcome::Relay(OrchestrationSendRelayOutcome {
            relay: Some(relay_acceptance(relay)?),
            lifecycle: response.get("lifecycle").map(relay_lifecycle).transpose()?,
        })
    } else {
        Outcome::Message(OrchestrationSendMessageOutcome {
            message: Some(message(field(&response, "message")?)?),
            lifecycle: response
                .get("lifecycle")
                .map(lifecycle_result)
                .transpose()?,
        })
    };
    Ok(encode(&OrchestrationServiceSendResponse {
        outcome: Some(outcome),
        mutation: mutation(&response),
    }))
}

// Why: check --wait holds this unary call open until a message arrives or timeout_ms elapses
// (see check_messages/check_run_mailbox in apps/daemon/src/orchestration/authority.rs);
// callers must set a transport-level deadline at least as long as timeout_ms.
pub(in crate::rpc) async fn check(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceCheckRequest>(payload)?;
    let mut body = Map::new();
    optional_string(&mut body, "terminal", request.terminal);
    optional_string(&mut body, "terminalPaneKey", request.terminal_pane_key);
    body.insert("unread".to_owned(), json!(request.unread));
    body.insert("peek".to_owned(), json!(request.peek));
    body.insert("all".to_owned(), json!(request.all));
    let types = request
        .types
        .into_iter()
        .filter_map(|raw| OrchestrationMessageType::try_from(raw).ok())
        .filter_map(message_type_str)
        .collect::<Vec<_>>();
    if !types.is_empty() {
        body.insert("types".to_owned(), json!(types.join(",")));
    }
    body.insert("format".to_owned(), json!(request.format));
    body.insert("inject".to_owned(), json!(request.inject));
    optional_string(&mut body, "ack", request.ack);
    optional_string(&mut body, "run", request.run);
    body.insert("wait".to_owned(), json!(request.wait));
    if let Some(timeout) = request.timeout_ms {
        body.insert("timeoutMs".to_owned(), json!(timeout));
    }
    let response = invoke(
        rpc,
        "orchestration.check",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    let messages = response
        .get("messages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(encode(&OrchestrationServiceCheckResponse {
        messages: messages
            .iter()
            .map(message)
            .collect::<Result<Vec<_>, _>>()?,
        count: required_i64(&response, "count")?,
        run_id: optional_str(&response, "runId"),
        dispatch_id: optional_str(&response, "dispatchId"),
        delivery_id: optional_str(&response, "deliveryId"),
        replayed: response
            .get("replayed")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        acknowledged: optional_str(&response, "acknowledged"),
        timed_out: response
            .get("timedOut")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        cancelled: response
            .get("cancelled")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        connection_lost: response
            .get("connectionLost")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        formatted: optional_str(&response, "formatted"),
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn reply(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceReplyRequest>(payload)?;
    let id = required(&request.id, "id")?;
    let body_text = required(&request.body, "body")?;
    let mut body = Map::new();
    body.insert("id".to_owned(), json!(id));
    body.insert("body".to_owned(), json!(body_text));
    optional_string(&mut body, "from", request.from);
    optional_string(&mut body, "run", request.run);
    let response = invoke(
        rpc,
        "orchestration.reply",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceReplyResponse {
        message: Some(message(field(&response, "message")?)?),
        question: response.get("question").map(question).transpose()?,
        duplicate: response
            .get("duplicate")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        mutation: mutation(&response),
    }))
}

pub(in crate::rpc) async fn inbox(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceInboxRequest>(payload)?;
    let mut body = Map::new();
    if let Some(limit) = request.limit {
        body.insert("limit".to_owned(), json!(limit));
    }
    optional_string(&mut body, "terminal", request.terminal);
    let response = invoke(
        rpc,
        "orchestration.inbox",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    let messages = response
        .get("messages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(encode(&OrchestrationServiceInboxResponse {
        messages: messages
            .iter()
            .map(message)
            .collect::<Result<Vec<_>, _>>()?,
        count: required_i64(&response, "count")?,
    }))
}

// Why: blocks until answered, cancelled by disconnect, or --timeout-ms elapses (up to
// ASK_MAX_TIMEOUT_MS = 30 minutes); same "hold the unary call open" contract as check().
pub(in crate::rpc) async fn ask(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceAskRequest>(payload)?;
    let mut body = Map::new();
    optional_string(&mut body, "to", request.to);
    optional_string(&mut body, "question", request.question);
    optional_string(&mut body, "resume", request.resume);
    optional_string(&mut body, "options", request.options);
    if let Some(timeout) = request.timeout_ms {
        body.insert("timeoutMs".to_owned(), json!(timeout));
    }
    optional_string(&mut body, "from", request.from);
    optional_string(&mut body, "run", request.run);
    let capability = request.capability.filter(|value| !value.is_empty());
    let response = invoke(
        rpc,
        "orchestration.ask",
        Value::Object(body),
        principal_id,
        capability,
    )
    .await?;
    Ok(encode(&OrchestrationServiceAskResponse {
        answer: optional_str(&response, "answer"),
        message_id: required_str(&response, "messageId")?.to_owned(),
        answer_message_id: optional_str(&response, "answerMessageId"),
        thread_id: required_str(&response, "threadId")?.to_owned(),
        timed_out: required_bool(&response, "timedOut")?,
        cancelled: required_bool(&response, "cancelled")?,
        connection_lost: required_bool(&response, "connectionLost")?,
        timeout_ms: optional_i64(&response, "timeoutMs").unwrap_or_default(),
        mutation: mutation(&response),
    }))
}

fn lifecycle_result(value: &Value) -> Result<OrchestrationLifecycleResult, Status> {
    let action = match required_str(value, "action")? {
        "ignored" => OrchestrationLifecycleAction::Ignored,
        "suppressed" => OrchestrationLifecycleAction::Suppressed,
        "rejected" => OrchestrationLifecycleAction::Rejected,
        "completed" => OrchestrationLifecycleAction::Completed,
        "failed" => OrchestrationLifecycleAction::Failed,
        "heartbeat_recorded" => OrchestrationLifecycleAction::HeartbeatRecorded,
        _ => OrchestrationLifecycleAction::Unspecified,
    };
    Ok(OrchestrationLifecycleResult {
        action: action as i32,
        code: optional_str(value, "code"),
        reason: optional_str(value, "reason"),
        task_id: optional_str(value, "taskId"),
        dispatch_id: optional_str(value, "dispatchId"),
    })
}

fn relay_lifecycle(value: &Value) -> Result<OrchestrationRelayLifecycle, Status> {
    let action = match required_str(value, "action")? {
        "completed" => OrchestrationLifecycleAction::Completed,
        "failed" => OrchestrationLifecycleAction::Failed,
        _ => OrchestrationLifecycleAction::Unspecified,
    };
    Ok(OrchestrationRelayLifecycle {
        action: action as i32,
    })
}

fn relay_acceptance(value: &Value) -> Result<OrchestrationRelayAcceptance, Status> {
    let destination = match required_str(value, "destination")? {
        "run_home" => OrchestrationRelayDestination::RunHome,
        "worker" => OrchestrationRelayDestination::Worker,
        _ => OrchestrationRelayDestination::Unspecified,
    };
    Ok(OrchestrationRelayAcceptance {
        message_id: required_str(value, "messageId")?.to_owned(),
        sequence: required_i64(value, "sequence")?,
        dispatch_id: required_str(value, "dispatchId")?.to_owned(),
        destination: destination as i32,
    })
}

fn optional_string(body: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value.filter(|value| !value.is_empty()) {
        body.insert(key.to_owned(), json!(value));
    }
}

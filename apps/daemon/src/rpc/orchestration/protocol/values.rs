use crate::rpc::orchestration::protocol_status_code;
use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    OrchestrationDispatch as ProtocolDispatch, OrchestrationDispatchStatus,
    OrchestrationEffect as ProtocolEffect, OrchestrationFieldEntry as ProtocolFieldEntry,
    OrchestrationFieldValue as ProtocolFieldValue, OrchestrationGate as ProtocolGate,
    OrchestrationGateStatus, OrchestrationMessage as ProtocolMessage, OrchestrationMessagePriority,
    OrchestrationMessageType, OrchestrationMutation as ProtocolMutation,
    OrchestrationQuestion as ProtocolQuestion, OrchestrationQuestionStatus,
    OrchestrationResetScope, OrchestrationRun as ProtocolRun, OrchestrationRunBinding,
    OrchestrationTask as ProtocolTask, OrchestrationTaskStatus, OrchestrationWorkerReadSource,
    OrchestrationWorkerSetupMode, OrchestrationWorkerSetupSource, OrchestrationWorkerState,
    orchestration_field_value::Value as FieldValueKind,
};
use serde_json::Value;

use super::super::OrchestrationRpc;

// Why: mirrors the legacy CONTRACT_VERSION gate in ../../orchestration.rs — every protobuf
// handler below carries the current contract so `OrchestrationRpc::invoke` never rejects a
// mutation as `client_contract_missing`.
pub(super) use super::super::CONTRACT_VERSION;

pub(in crate::rpc) fn status_from_error(error: crate::orchestration::OrchestrationError) -> Status {
    match error.rpc_parts() {
        Some((code, message, _data)) => Status {
            code: protocol_status_code(code) as i32,
            message: message.to_owned(),
            details: Vec::new(),
        },
        None => Status {
            code: StatusCode::Internal as i32,
            message: error.to_string(),
            details: Vec::new(),
        },
    }
}

pub(in crate::rpc) fn invalid(message: &str) -> Status {
    Status {
        code: StatusCode::InvalidArgument as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

pub(in crate::rpc) fn internal(field: &str) -> Status {
    Status {
        code: StatusCode::Internal as i32,
        message: format!("orchestration_field_missing:{field}"),
        details: Vec::new(),
    }
}

pub(in crate::rpc) fn required<'a>(value: &'a str, field: &'static str) -> Result<&'a str, Status> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(invalid(&format!("{field} is required")))
    } else {
        Ok(trimmed)
    }
}

pub(in crate::rpc) fn field<'a>(value: &'a Value, name: &str) -> Result<&'a Value, Status> {
    value.get(name).ok_or_else(|| internal(name))
}

pub(in crate::rpc) fn required_str<'a>(value: &'a Value, name: &str) -> Result<&'a str, Status> {
    value
        .get(name)
        .and_then(Value::as_str)
        .ok_or_else(|| internal(name))
}

pub(in crate::rpc) fn optional_str(value: &Value, name: &str) -> Option<String> {
    value.get(name).and_then(Value::as_str).map(str::to_owned)
}

pub(in crate::rpc) fn required_bool(value: &Value, name: &str) -> Result<bool, Status> {
    value
        .get(name)
        .and_then(Value::as_bool)
        .ok_or_else(|| internal(name))
}

pub(in crate::rpc) fn optional_bool(value: &Value, name: &str) -> bool {
    value.get(name).and_then(Value::as_bool).unwrap_or(false)
}

pub(in crate::rpc) fn required_i64(value: &Value, name: &str) -> Result<i64, Status> {
    value
        .get(name)
        .and_then(Value::as_i64)
        .ok_or_else(|| internal(name))
}

pub(in crate::rpc) fn optional_i64(value: &Value, name: &str) -> Option<i64> {
    value.get(name).and_then(Value::as_i64)
}

pub(in crate::rpc) fn required_u64(value: &Value, name: &str) -> Result<u64, Status> {
    value
        .get(name)
        .and_then(Value::as_u64)
        .ok_or_else(|| internal(name))
}

// Why: a --deps/--options CLI flag is a JSON-array-of-strings *encoded as a string* on the
// legacy JSON transport (see parse_string_array_json in
// apps/daemon/src/orchestration/authority.rs); the protobuf request carries `repeated
// string` directly, so this re-encodes it back into that same string shape before calling the
// unchanged authority code.
pub(in crate::rpc) fn encode_string_array(values: &[String]) -> Result<String, Status> {
    serde_json::to_string(values).map_err(|_| invalid("Could not encode a repeated string field"))
}

pub(in crate::rpc) fn decode_string_array(value: &Value, name: &str) -> Vec<String> {
    value
        .get(name)
        .and_then(Value::as_str)
        .and_then(|text| serde_json::from_str::<Vec<String>>(text).ok())
        .unwrap_or_default()
}

// Why: worker-shaped JSON stores `effects`/`residualResources` as a DB-persisted JSON string in
// some call paths (find_worker) and as an already-built Vec<Value> in others (a fresh
// worker_start/federation_attach_start result); this normalizes both into one array before it is
// converted into typed OrchestrationEffect messages.
pub(in crate::rpc) fn json_array_maybe_string(value: &Value) -> Vec<Value> {
    match value {
        Value::Array(items) => items.clone(),
        Value::String(text) => serde_json::from_str(text).unwrap_or_default(),
        _ => Vec::new(),
    }
}

pub(in crate::rpc) fn field_value(value: &Value) -> Option<ProtocolFieldValue> {
    let kind = match value {
        Value::Bool(flag) => FieldValueKind::Boolean(*flag),
        Value::Number(number) if number.is_i64() => {
            FieldValueKind::Integer(number.as_i64().unwrap_or_default())
        }
        Value::Number(number) => FieldValueKind::Number(number.as_f64().unwrap_or_default()),
        Value::String(text) => FieldValueKind::Text(text.clone()),
        _ => return None,
    };
    Some(ProtocolFieldValue { value: Some(kind) })
}

pub(in crate::rpc) fn field_entries(value: &Value) -> Vec<ProtocolFieldEntry> {
    let Some(object) = value.as_object() else {
        return Vec::new();
    };
    object
        .iter()
        .filter_map(|(key, entry)| {
            field_value(entry).map(|value| ProtocolFieldEntry {
                key: key.clone(),
                value: Some(value),
            })
        })
        .collect()
}

pub(in crate::rpc) fn effect(value: &Value) -> ProtocolEffect {
    let kind = value
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let fields = value
        .as_object()
        .map(|object| {
            object
                .iter()
                .filter(|(key, _)| key.as_str() != "kind")
                .filter_map(|(key, entry)| {
                    field_value(entry).map(|value| ProtocolFieldEntry {
                        key: key.clone(),
                        value: Some(value),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    ProtocolEffect { kind, fields }
}

pub(in crate::rpc) fn effects(value: &Value, name: &str) -> Vec<ProtocolEffect> {
    json_array_maybe_string(value.get(name).unwrap_or(&Value::Null))
        .iter()
        .map(effect)
        .collect()
}

pub(in crate::rpc) fn mutation(value: &Value) -> Option<ProtocolMutation> {
    let mutation = value.get("mutation")?;
    Some(ProtocolMutation {
        request_id: required_str(mutation, "requestId").ok()?.to_owned(),
        replayed: optional_bool(mutation, "replayed"),
    })
}

pub(in crate::rpc) fn task_status(value: &str) -> OrchestrationTaskStatus {
    match value {
        "pending" => OrchestrationTaskStatus::Pending,
        "ready" => OrchestrationTaskStatus::Ready,
        "dispatched" => OrchestrationTaskStatus::Dispatched,
        "completed" => OrchestrationTaskStatus::Completed,
        "failed" => OrchestrationTaskStatus::Failed,
        "blocked" => OrchestrationTaskStatus::Blocked,
        _ => OrchestrationTaskStatus::Unspecified,
    }
}

pub(in crate::rpc) fn task_status_str(
    value: OrchestrationTaskStatus,
) -> Result<&'static str, Status> {
    match value {
        OrchestrationTaskStatus::Pending => Ok("pending"),
        OrchestrationTaskStatus::Ready => Ok("ready"),
        OrchestrationTaskStatus::Dispatched => Ok("dispatched"),
        OrchestrationTaskStatus::Completed => Ok("completed"),
        OrchestrationTaskStatus::Failed => Ok("failed"),
        OrchestrationTaskStatus::Blocked => Ok("blocked"),
        OrchestrationTaskStatus::Unspecified => Err(invalid("Missing --status")),
    }
}

pub(in crate::rpc) fn dispatch_status(value: &str) -> OrchestrationDispatchStatus {
    match value {
        "pending" => OrchestrationDispatchStatus::Pending,
        "dispatched" => OrchestrationDispatchStatus::Dispatched,
        "completed" => OrchestrationDispatchStatus::Completed,
        "failed" => OrchestrationDispatchStatus::Failed,
        "circuit_broken" => OrchestrationDispatchStatus::CircuitBroken,
        _ => OrchestrationDispatchStatus::Unspecified,
    }
}

pub(in crate::rpc) fn gate_status(value: &str) -> OrchestrationGateStatus {
    match value {
        "pending" => OrchestrationGateStatus::Pending,
        "resolved" => OrchestrationGateStatus::Resolved,
        "timeout" => OrchestrationGateStatus::Timeout,
        _ => OrchestrationGateStatus::Unspecified,
    }
}

pub(in crate::rpc) fn gate_status_str(value: OrchestrationGateStatus) -> Option<&'static str> {
    match value {
        OrchestrationGateStatus::Pending => Some("pending"),
        OrchestrationGateStatus::Resolved => Some("resolved"),
        OrchestrationGateStatus::Timeout => Some("timeout"),
        OrchestrationGateStatus::Unspecified => None,
    }
}

pub(in crate::rpc) fn question_status(value: &str) -> OrchestrationQuestionStatus {
    match value {
        "pending" => OrchestrationQuestionStatus::Pending,
        "answered" => OrchestrationQuestionStatus::Answered,
        "closed" => OrchestrationQuestionStatus::Closed,
        _ => OrchestrationQuestionStatus::Unspecified,
    }
}

pub(in crate::rpc) fn message_type(value: &str) -> OrchestrationMessageType {
    match value {
        "status" => OrchestrationMessageType::Status,
        "dispatch" => OrchestrationMessageType::Dispatch,
        "worker_done" => OrchestrationMessageType::WorkerDone,
        "merge_ready" => OrchestrationMessageType::MergeReady,
        "escalation" => OrchestrationMessageType::Escalation,
        "handoff" => OrchestrationMessageType::Handoff,
        "decision_gate" => OrchestrationMessageType::DecisionGate,
        "question" => OrchestrationMessageType::Question,
        "heartbeat" => OrchestrationMessageType::Heartbeat,
        _ => OrchestrationMessageType::Unspecified,
    }
}

pub(in crate::rpc) fn message_type_str(value: OrchestrationMessageType) -> Option<&'static str> {
    match value {
        OrchestrationMessageType::Status => Some("status"),
        OrchestrationMessageType::Dispatch => Some("dispatch"),
        OrchestrationMessageType::WorkerDone => Some("worker_done"),
        OrchestrationMessageType::MergeReady => Some("merge_ready"),
        OrchestrationMessageType::Escalation => Some("escalation"),
        OrchestrationMessageType::Handoff => Some("handoff"),
        OrchestrationMessageType::DecisionGate => Some("decision_gate"),
        OrchestrationMessageType::Question => Some("question"),
        OrchestrationMessageType::Heartbeat => Some("heartbeat"),
        OrchestrationMessageType::Unspecified => None,
    }
}

pub(in crate::rpc) fn message_priority_str(
    value: OrchestrationMessagePriority,
) -> Option<&'static str> {
    match value {
        OrchestrationMessagePriority::Normal => Some("normal"),
        OrchestrationMessagePriority::High => Some("high"),
        OrchestrationMessagePriority::Urgent => Some("urgent"),
        OrchestrationMessagePriority::Unspecified => None,
    }
}

pub(in crate::rpc) fn message_priority(value: &str) -> OrchestrationMessagePriority {
    match value {
        "normal" => OrchestrationMessagePriority::Normal,
        "high" => OrchestrationMessagePriority::High,
        "urgent" => OrchestrationMessagePriority::Urgent,
        _ => OrchestrationMessagePriority::Unspecified,
    }
}

pub(in crate::rpc) fn worker_state(value: &str) -> OrchestrationWorkerState {
    match value {
        "starting" => OrchestrationWorkerState::Starting,
        "ready" => OrchestrationWorkerState::Ready,
        "start_unknown" => OrchestrationWorkerState::StartUnknown,
        "failed" => OrchestrationWorkerState::Failed,
        "succeeded" => OrchestrationWorkerState::Succeeded,
        "stopping" => OrchestrationWorkerState::Stopping,
        "stop_unknown" => OrchestrationWorkerState::StopUnknown,
        "stopped" => OrchestrationWorkerState::Stopped,
        "abandoned" => OrchestrationWorkerState::Abandoned,
        _ => OrchestrationWorkerState::Unspecified,
    }
}

pub(in crate::rpc) fn setup_mode_str(value: OrchestrationWorkerSetupMode) -> Option<&'static str> {
    match value {
        OrchestrationWorkerSetupMode::Run => Some("run"),
        OrchestrationWorkerSetupMode::Skip => Some("skip"),
        OrchestrationWorkerSetupMode::Inherit => Some("inherit"),
        OrchestrationWorkerSetupMode::NotApplicable | OrchestrationWorkerSetupMode::Unspecified => {
            None
        }
    }
}

pub(in crate::rpc) fn setup_mode(value: &str) -> OrchestrationWorkerSetupMode {
    match value {
        "run" => OrchestrationWorkerSetupMode::Run,
        "skip" => OrchestrationWorkerSetupMode::Skip,
        "inherit" => OrchestrationWorkerSetupMode::Inherit,
        "not_applicable" => OrchestrationWorkerSetupMode::NotApplicable,
        _ => OrchestrationWorkerSetupMode::Unspecified,
    }
}

pub(in crate::rpc) fn setup_receipt(
    value: &Value,
) -> Result<agentstart_protocol::runtime::v1::OrchestrationWorkerSetupReceipt, Status> {
    Ok(
        agentstart_protocol::runtime::v1::OrchestrationWorkerSetupReceipt {
            requested: setup_mode(required_str(value, "requested")?) as i32,
            effective: setup_mode(required_str(value, "effective")?) as i32,
            source: required_str(value, "source")?.to_owned(),
            hook_found: required_bool(value, "hookFound")?,
            startup_policy: required_str(value, "startupPolicy")?.to_owned(),
            state: required_str(value, "state")?.to_owned(),
        },
    )
}

pub(in crate::rpc) fn setup_source_str(
    value: OrchestrationWorkerSetupSource,
) -> Option<&'static str> {
    match value {
        OrchestrationWorkerSetupSource::ExplicitRequest => Some("explicit_request"),
        OrchestrationWorkerSetupSource::OrchestrationDefault => Some("orchestration_default"),
        OrchestrationWorkerSetupSource::Unspecified => None,
    }
}

pub(in crate::rpc) fn worker_read_source_str(
    value: OrchestrationWorkerReadSource,
) -> Option<&'static str> {
    match value {
        OrchestrationWorkerReadSource::Auto => Some("auto"),
        OrchestrationWorkerReadSource::Transcript => Some("transcript"),
        OrchestrationWorkerReadSource::Terminal => Some("terminal"),
        OrchestrationWorkerReadSource::Unspecified => None,
    }
}

pub(in crate::rpc) fn reset_scope_str(
    value: OrchestrationResetScope,
) -> Result<&'static str, Status> {
    match value {
        OrchestrationResetScope::All => Ok("all"),
        OrchestrationResetScope::Tasks => Ok("tasks"),
        OrchestrationResetScope::Messages => Ok("messages"),
        OrchestrationResetScope::Unspecified => Err(invalid(
            "Choose exactly one reset scope: all, tasks, or messages.",
        )),
    }
}

pub(in crate::rpc) fn process_action(
    value: &str,
) -> agentstart_protocol::runtime::v1::OrchestrationWorkerProcessAction {
    use agentstart_protocol::runtime::v1::OrchestrationWorkerProcessAction;
    match value {
        "none" => OrchestrationWorkerProcessAction::None,
        "closed_agent_terminal" => OrchestrationWorkerProcessAction::ClosedAgentTerminal,
        "unknown" => OrchestrationWorkerProcessAction::Unknown,
        _ => OrchestrationWorkerProcessAction::Unspecified,
    }
}

pub(in crate::rpc) fn worker(
    value: &Value,
) -> Result<agentstart_protocol::runtime::v1::OrchestrationWorker, Status> {
    Ok(agentstart_protocol::runtime::v1::OrchestrationWorker {
        dispatch_id: required_str(value, "dispatch_id")?.to_owned(),
        runtime_epoch: optional_str(value, "runtime_epoch"),
        state: worker_state(required_str(value, "state")?) as i32,
        stage: required_str(value, "stage")?.to_owned(),
        worktree_id: optional_str(value, "worktree_id"),
        agent_terminal_handle: optional_str(value, "agent_terminal_handle"),
        setup_state: required_str(value, "setup_state")?.to_owned(),
        effects: effects(value, "effects"),
        residual_resources: effects(value, "residualResources"),
        start_options: value
            .get("startOptions")
            .map(field_entries)
            .unwrap_or_default(),
        last_error: optional_str(value, "last_error"),
        created_at: required_str(value, "created_at")?.to_owned(),
        updated_at: required_str(value, "updated_at")?.to_owned(),
    })
}

pub(in crate::rpc) fn remote_attachment(
    value: &Value,
) -> Result<agentstart_protocol::runtime::v1::OrchestrationRemoteAttachment, Status> {
    Ok(
        agentstart_protocol::runtime::v1::OrchestrationRemoteAttachment {
            dispatch_id: required_str(value, "dispatch_id")?.to_owned(),
            task_id: required_str(value, "task_id")?.to_owned(),
            home_peer_fingerprint: required_str(value, "home_peer_fingerprint")?.to_owned(),
            protocol_version: required_i64(value, "protocol_version")?,
            runtime_epoch: required_str(value, "runtime_epoch")?.to_owned(),
            capability_hash: optional_str(value, "capability_hash"),
            pane_key: optional_str(value, "pane_key"),
            process_incarnation: optional_str(value, "process_incarnation"),
            state: worker_state(required_str(value, "state")?) as i32,
            stage: required_str(value, "stage")?.to_owned(),
            worktree_id: optional_str(value, "worktree_id"),
            terminal_handle: optional_str(value, "terminal_handle"),
            setup_state: required_str(value, "setup_state")?.to_owned(),
            effects: effects(value, "effects"),
            residual_resources: effects(value, "residualResources"),
            to_worker_imported_sequence: required_i64(value, "to_worker_imported_sequence")?,
            last_error: optional_str(value, "last_error"),
            created_at: required_str(value, "created_at")?.to_owned(),
            updated_at: required_str(value, "updated_at")?.to_owned(),
        },
    )
}

pub(in crate::rpc) fn relay_item(
    value: &Value,
) -> Result<agentstart_protocol::runtime::v1::OrchestrationFederationRelayItem, Status> {
    Ok(
        agentstart_protocol::runtime::v1::OrchestrationFederationRelayItem {
            dispatch_id: required_str(value, "dispatch_id")?.to_owned(),
            direction: required_str(value, "direction")?.to_owned(),
            sequence: required_i64(value, "sequence")?,
            message_id: required_str(value, "message_id")?.to_owned(),
            kind: required_str(value, "kind")?.to_owned(),
            payload: required_str(value, "payload")?.to_owned(),
            byte_count: required_i64(value, "byte_count")?,
            acked_at: optional_str(value, "acked_at"),
            created_at: required_str(value, "created_at")?.to_owned(),
        },
    )
}

pub(in crate::rpc) fn reset_scope(value: &str) -> OrchestrationResetScope {
    match value {
        "all" => OrchestrationResetScope::All,
        "tasks" => OrchestrationResetScope::Tasks,
        "messages" => OrchestrationResetScope::Messages,
        _ => OrchestrationResetScope::Unspecified,
    }
}

pub(in crate::rpc) fn run(value: &Value) -> Result<ProtocolRun, Status> {
    Ok(ProtocolRun {
        id: required_str(value, "id")?.to_owned(),
        objective: required_str(value, "objective")?.to_owned(),
        home_database: required_str(value, "home_database")?.to_owned(),
        coordinator_handle: optional_str(value, "coordinator_handle"),
        coordinator_pane_key: optional_str(value, "coordinator_pane_key"),
        consumer_generation: required_i64(value, "consumer_generation")?,
        legacy: required_i64(value, "legacy")? != 0,
        created_at: required_str(value, "created_at")?.to_owned(),
        updated_at: required_str(value, "updated_at")?.to_owned(),
    })
}

pub(in crate::rpc) fn run_binding(value: &Value) -> Result<OrchestrationRunBinding, Status> {
    let binding = field(value, "binding")?;
    Ok(OrchestrationRunBinding {
        consumer_generation: required_i64(binding, "consumerGeneration")?,
    })
}

pub(in crate::rpc) fn task(value: &Value) -> Result<ProtocolTask, Status> {
    Ok(ProtocolTask {
        id: required_str(value, "id")?.to_owned(),
        run_id: required_str(value, "run_id")?.to_owned(),
        parent_id: optional_str(value, "parent_id"),
        created_by_terminal_handle: optional_str(value, "created_by_terminal_handle"),
        task_title: optional_str(value, "task_title"),
        display_name: optional_str(value, "display_name"),
        spec: required_str(value, "spec")?.to_owned(),
        status: task_status(required_str(value, "status")?) as i32,
        deps: decode_string_array(value, "deps"),
        result: optional_str(value, "result"),
        created_at: required_str(value, "created_at")?.to_owned(),
        completed_at: optional_str(value, "completed_at"),
        assignee_handle: optional_str(value, "assignee_handle"),
        dispatch_id: optional_str(value, "dispatch_id"),
        spec_truncated: optional_bool(value, "spec_truncated"),
    })
}

pub(in crate::rpc) fn dispatch(value: &Value) -> Result<ProtocolDispatch, Status> {
    Ok(ProtocolDispatch {
        id: required_str(value, "id")?.to_owned(),
        run_id: required_str(value, "run_id")?.to_owned(),
        task_id: required_str(value, "task_id")?.to_owned(),
        assignee_handle: optional_str(value, "assignee_handle"),
        assignee_pane_key: optional_str(value, "assignee_pane_key"),
        capability_hash: optional_str(value, "capability_hash"),
        process_incarnation: optional_str(value, "process_incarnation"),
        capability_revoked_at: optional_str(value, "capability_revoked_at"),
        status: dispatch_status(required_str(value, "status")?) as i32,
        failure_count: required_i64(value, "failure_count")?,
        last_failure: optional_str(value, "last_failure"),
        dispatched_at: optional_str(value, "dispatched_at"),
        completed_at: optional_str(value, "completed_at"),
        created_at: required_str(value, "created_at")?.to_owned(),
        last_heartbeat_at: optional_str(value, "last_heartbeat_at"),
    })
}

pub(in crate::rpc) fn message(value: &Value) -> Result<ProtocolMessage, Status> {
    Ok(ProtocolMessage {
        id: required_str(value, "id")?.to_owned(),
        run_id: required_str(value, "run_id")?.to_owned(),
        from_handle: required_str(value, "from_handle")?.to_owned(),
        to_handle: required_str(value, "to_handle")?.to_owned(),
        subject: required_str(value, "subject")?.to_owned(),
        body: required_str(value, "body")?.to_owned(),
        r#type: message_type(required_str(value, "type")?) as i32,
        priority: message_priority(required_str(value, "priority")?) as i32,
        thread_id: optional_str(value, "thread_id"),
        payload: optional_str(value, "payload"),
        read: required_i64(value, "read")? != 0,
        sequence: required_i64(value, "sequence")?,
        created_at: required_str(value, "created_at")?.to_owned(),
        delivered_at: optional_str(value, "delivered_at"),
        sender_pane_key: optional_str(value, "sender_pane_key"),
    })
}

pub(in crate::rpc) fn question(value: &Value) -> Result<ProtocolQuestion, Status> {
    Ok(ProtocolQuestion {
        message_id: required_str(value, "message_id")?.to_owned(),
        run_id: required_str(value, "run_id")?.to_owned(),
        dispatch_id: required_str(value, "dispatch_id")?.to_owned(),
        asker_handle: required_str(value, "asker_handle")?.to_owned(),
        status: question_status(required_str(value, "status")?) as i32,
        answer_message_id: optional_str(value, "answer_message_id"),
        answer_body: optional_str(value, "answer_body"),
        answered_by_generation: optional_i64(value, "answered_by_generation"),
        created_at: required_str(value, "created_at")?.to_owned(),
        answered_at: optional_str(value, "answered_at"),
        closed_at: optional_str(value, "closed_at"),
    })
}

pub(in crate::rpc) fn server_ref(
    value: &Value,
) -> Result<agentstart_protocol::runtime::v1::OrchestrationServerRef, Status> {
    Ok(agentstart_protocol::runtime::v1::OrchestrationServerRef {
        environment_id: optional_str(value, "environmentId"),
        name: required_str(value, "name")?.to_owned(),
    })
}

// Why: worker-show/federation-show embed the daemon's internal TerminalShow (TerminalSummary
// flattened with pane_runtime_id/renderer_graph_epoch/transport_generation, all camelCase per
// `#[serde(rename_all = "camelCase")]` on TerminalShow in
// apps/daemon/src/terminal_session/model.rs); this reuses the terminal namespace's own
// TerminalSummary message for the flattened part instead of redeclaring those fields here.
pub(in crate::rpc) fn worker_terminal(
    value: &Value,
) -> Result<agentstart_protocol::runtime::v1::OrchestrationWorkerTerminal, Status> {
    use agentstart_protocol::runtime::v1::{OrchestrationWorkerTerminal, TerminalSummary};
    let summary = TerminalSummary {
        handle: required_str(value, "handle")?.to_owned(),
        pty_id: optional_str(value, "ptyId"),
        worktree_id: required_str(value, "worktreeId")?.to_owned(),
        worktree_path: required_str(value, "worktreePath")?.to_owned(),
        branch: required_str(value, "branch")?.to_owned(),
        tab_id: required_str(value, "tabId")?.to_owned(),
        leaf_id: required_str(value, "leafId")?.to_owned(),
        title: optional_str(value, "title"),
        connected: required_bool(value, "connected")?,
        writable: required_bool(value, "writable")?,
        last_output_at: optional_i64(value, "lastOutputAt"),
        preview: optional_str(value, "preview").unwrap_or_default(),
        agent_phase: None,
    };
    Ok(OrchestrationWorkerTerminal {
        summary: Some(summary),
        pane_runtime_id: required_i64(value, "paneRuntimeId")?,
        renderer_graph_epoch: required_u64(value, "rendererGraphEpoch")?,
        transport_generation: required_str(value, "transportGeneration")?.to_owned(),
    })
}

// Why: the same TerminalReadResult shape terminal.read produces
// (apps/daemon/src/terminal_session/model.rs, camelCase), embedded as-is by
// read_worker_terminal in apps/daemon/src/orchestration/authority/workers.rs.
pub(in crate::rpc) fn terminal_read(
    value: &Value,
) -> Result<agentstart_protocol::runtime::v1::TerminalRead, Status> {
    use agentstart_protocol::runtime::v1::{TerminalRead, TerminalState};
    let status = match required_str(value, "status")? {
        "running" => TerminalState::Running,
        "exited" => TerminalState::Exited,
        _ => TerminalState::Unknown,
    };
    Ok(TerminalRead {
        handle: required_str(value, "handle")?.to_owned(),
        status: status as i32,
        tail: value
            .get("tail")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        truncated: required_bool(value, "truncated")?,
        limited: required_bool(value, "limited")?,
        oldest_cursor: required_str(value, "oldestCursor")?.to_owned(),
        next_cursor: required_str(value, "nextCursor")?.to_owned(),
        latest_cursor: required_str(value, "latestCursor")?.to_owned(),
        returned_line_count: u32::try_from(required_i64(value, "returnedLineCount")?)
            .unwrap_or_default(),
    })
}

pub(in crate::rpc) fn worker_read_result(
    value: &Value,
) -> Result<agentstart_protocol::runtime::v1::OrchestrationWorkerReadResult, Status> {
    let status = field(value, "status")?;
    Ok(
        agentstart_protocol::runtime::v1::OrchestrationWorkerReadResult {
            dispatch_id: required_str(value, "dispatchId")?.to_owned(),
            terminal: Some(terminal_read(field(value, "terminal")?)?),
            cursor: optional_str(value, "cursor"),
            worker_state: required_str(status, "worker")?.to_owned(),
            fallback_reason: optional_str(value, "fallbackReason").unwrap_or_default(),
            warnings: value
                .get("warnings")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default(),
        },
    )
}

pub(in crate::rpc) fn gate(value: &Value) -> Result<ProtocolGate, Status> {
    Ok(ProtocolGate {
        id: required_str(value, "id")?.to_owned(),
        run_id: required_str(value, "run_id")?.to_owned(),
        task_id: required_str(value, "task_id")?.to_owned(),
        question: required_str(value, "question")?.to_owned(),
        options: decode_string_array(value, "options"),
        status: gate_status(required_str(value, "status")?) as i32,
        resolution: optional_str(value, "resolution"),
        created_at: required_str(value, "created_at")?.to_owned(),
        resolved_at: optional_str(value, "resolved_at"),
    })
}

// Why: OrchestrationCall carries no CLI request id for protobuf calls — see CONTRACT_VERSION's
// Why: comment above — so this always takes the "no idempotency receipt" branch of
// OrchestrationRpc::invoke and calls straight through to OrchestrationAuthority::invoke.
pub(in crate::rpc) fn call(
    principal_id: &str,
    capability: Option<String>,
) -> super::super::OrchestrationCall {
    super::super::OrchestrationCall {
        capability,
        contract_version: Some(CONTRACT_VERSION),
        principal_id: principal_id.to_owned(),
        request_id: None,
    }
}

pub(in crate::rpc) async fn invoke(
    rpc: &OrchestrationRpc,
    method: &'static str,
    body: Value,
    principal_id: &str,
    capability: Option<String>,
) -> Result<Value, Status> {
    rpc.invoke(method, Some(body), &call(principal_id, capability))
        .await
        .map_err(status_from_error)
}

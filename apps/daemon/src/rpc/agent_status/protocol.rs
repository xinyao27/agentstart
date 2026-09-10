use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::agent_status_service_subscribe_response::Event;
use agentstart_protocol::runtime::v1::{
    AgentInterruptIntent as ProtocolInterruptIntent, AgentMigrationUnsupportedPtyEntry,
    AgentMigrationUnsupportedReason, AgentMigrationUnsupportedSource, AgentProviderSession,
    AgentProviderSessionKey, AgentStatusNullableString, AgentStatusPaneKey, AgentStatusPtyKey,
    AgentStatusServiceDropByTabPrefixRequest, AgentStatusServiceDropByTabPrefixResponse,
    AgentStatusServiceDropRequest, AgentStatusServiceDropResponse,
    AgentStatusServiceGetMigrationUnsupportedSnapshotRequest,
    AgentStatusServiceGetMigrationUnsupportedSnapshotResponse,
    AgentStatusServiceGetSnapshotRequest, AgentStatusServiceGetSnapshotResponse,
    AgentStatusServiceInferInterruptRequest, AgentStatusServiceInferInterruptResponse,
    AgentStatusServiceRetirePaneAuthorityRequest, AgentStatusServiceRetirePaneAuthorityResponse,
    AgentStatusServiceSubscribeRequest, AgentStatusServiceSubscribeResponse,
    AgentStatusServiceTransferPaneAuthorityRequest,
    AgentStatusServiceTransferPaneAuthorityResponse, AgentStatusSnapshotEntry, AgentStatusState,
    AgentStatusSubagent, AgentStatusSubscribeReady, AgentStatusSubscribeSnapshot,
    AgentSubagentState, agent_status_nullable_string,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::Value;

use crate::rpc::protocol_call::ProtocolCallContext;

use super::{AgentInterruptInference, AgentInterruptIntent, AgentStatusAuthority};

pub(in crate::rpc) async fn infer_interrupt(
    authority: &AgentStatusAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<AgentStatusServiceInferInterruptRequest>(payload)?;
    let input = interrupt_input(request)?;
    let inferred = authority.infer_interrupt(&input).await;
    Ok(encode(&AgentStatusServiceInferInterruptResponse {
        inferred,
    }))
}

pub(in crate::rpc) async fn get_snapshot(
    authority: &AgentStatusAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<AgentStatusServiceGetSnapshotRequest>(payload)?;
    let statuses = authority
        .snapshot()
        .iter()
        .map(protocol_status_entry)
        .collect::<Result<Vec<_>, Status>>()?;
    Ok(encode(&AgentStatusServiceGetSnapshotResponse { statuses }))
}

pub(in crate::rpc) async fn get_migration_unsupported_snapshot(
    authority: &AgentStatusAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<AgentStatusServiceGetMigrationUnsupportedSnapshotRequest>(payload)?;
    let migration_unsupported_ptys = authority
        .migration_snapshot()
        .iter()
        .map(protocol_migration_entry)
        .collect::<Result<Vec<_>, Status>>()?;
    Ok(encode(
        &AgentStatusServiceGetMigrationUnsupportedSnapshotResponse {
            migration_unsupported_ptys,
        },
    ))
}

/// Replays the current state as `ready`, then publishes each revision's diff
/// until the authority shuts down. Cancellation, the deadline, or a dropped
/// connection end the stream by dropping this future, exactly like the other
/// daemon-owned server streams.
pub(in crate::rpc) async fn subscribe(
    authority: &AgentStatusAuthority,
    payload: &[u8],
    connection_id: &str,
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    decode::<AgentStatusServiceSubscribeRequest>(payload)?;
    let subscription_id = format!(
        "agent-status-{connection_id}-{}",
        crate::terminal_session::random_id().map_err(|_| stream_status(
            "Agent status subscription identifier could not be generated"
        ))?
    );
    let ready = AgentStatusSubscribeReady {
        subscription_id,
        snapshot: Some(subscribe_snapshot(authority)?),
    };
    context
        .send_stream_payload(encode(&AgentStatusServiceSubscribeResponse {
            event: Some(Event::Ready(ready)),
        }))
        .await?;
    let mut revision = authority.revision.subscribe();
    let mut keyed = authority.keyed_snapshots();
    loop {
        if revision.changed().await.is_err() {
            return Ok(());
        }
        let (next, diff) = authority.event_diff(&keyed);
        for pane_key in &diff.cleared_panes {
            context
                .send_stream_payload(encode(&AgentStatusServiceSubscribeResponse {
                    event: Some(Event::Clear(AgentStatusPaneKey {
                        pane_key: pane_key.clone(),
                    })),
                }))
                .await?;
        }
        for status in &diff.set_statuses {
            let status = protocol_status_entry(status)?;
            context
                .send_stream_payload(encode(&AgentStatusServiceSubscribeResponse {
                    event: Some(Event::Set(status)),
                }))
                .await?;
        }
        for pty_id in &diff.cleared_ptys {
            context
                .send_stream_payload(encode(&AgentStatusServiceSubscribeResponse {
                    event: Some(Event::MigrationUnsupportedClear(AgentStatusPtyKey {
                        pty_id: pty_id.clone(),
                    })),
                }))
                .await?;
        }
        for entry in &diff.set_migration_entries {
            let entry = protocol_migration_entry(entry)?;
            context
                .send_stream_payload(encode(&AgentStatusServiceSubscribeResponse {
                    event: Some(Event::MigrationUnsupported(entry)),
                }))
                .await?;
        }
        keyed = next;
    }
}

pub(in crate::rpc) async fn drop_pane(
    authority: &AgentStatusAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<AgentStatusServiceDropRequest>(payload)?;
    let pane_key = required_pane_key(&request.pane_key)?;
    authority.drop_pane(pane_key);
    Ok(encode(&AgentStatusServiceDropResponse {}))
}

pub(in crate::rpc) async fn drop_by_tab_prefix(
    authority: &AgentStatusAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<AgentStatusServiceDropByTabPrefixRequest>(payload)?;
    if request.tab_id.is_empty() {
        return Err(invalid_argument("Agent status tab id must not be empty"));
    }
    authority.drop_tab(&request.tab_id);
    Ok(encode(&AgentStatusServiceDropByTabPrefixResponse {}))
}

pub(in crate::rpc) async fn retire_pane_authority(
    authority: &AgentStatusAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<AgentStatusServiceRetirePaneAuthorityRequest>(payload)?;
    let pane_key = required_pane_key(&request.pane_key)?;
    authority.drop_pane(pane_key);
    Ok(encode(&AgentStatusServiceRetirePaneAuthorityResponse {}))
}

pub(in crate::rpc) async fn transfer_pane_authority(
    authority: &AgentStatusAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<AgentStatusServiceTransferPaneAuthorityRequest>(payload)?;
    let from = required_pane_key(&request.from_pane_key)?;
    let to = required_pane_key(&request.to_pane_key)?;
    if !authority.transfer(from, to, request.pty_id.as_deref()) {
        return Err(status(StatusCode::NotFound, "Pane authority not found"));
    }
    Ok(encode(&AgentStatusServiceTransferPaneAuthorityResponse {}))
}

fn subscribe_snapshot(
    authority: &AgentStatusAuthority,
) -> Result<AgentStatusSubscribeSnapshot, Status> {
    Ok(AgentStatusSubscribeSnapshot {
        statuses: authority
            .snapshot()
            .iter()
            .map(protocol_status_entry)
            .collect::<Result<Vec<_>, Status>>()?,
        migration_unsupported_ptys: authority
            .migration_snapshot()
            .iter()
            .map(protocol_migration_entry)
            .collect::<Result<Vec<_>, Status>>()?,
    })
}

fn interrupt_input(
    request: AgentStatusServiceInferInterruptRequest,
) -> Result<AgentInterruptInference, Status> {
    if request.pane_key.is_empty() {
        return Err(invalid_argument("Agent status pane key must not be empty"));
    }
    let baseline_updated_at = timestamp(
        request.baseline_updated_at,
        "Agent status baseline update timestamp",
    )?;
    let baseline_state_started_at = timestamp(
        request.baseline_state_started_at,
        "Agent status baseline state timestamp",
    )?;
    let intent = match ProtocolInterruptIntent::try_from(request.intent) {
        Ok(ProtocolInterruptIntent::PlainEscape) => AgentInterruptIntent::PlainEscape,
        Ok(ProtocolInterruptIntent::CtrlC) => AgentInterruptIntent::CtrlC,
        Ok(ProtocolInterruptIntent::Unspecified) | Err(_) => {
            return Err(invalid_argument("Agent interrupt intent is invalid"));
        }
    };
    Ok(AgentInterruptInference {
        pane_key: request.pane_key,
        baseline_updated_at,
        baseline_state_started_at,
        baseline_prompt: request.baseline_prompt,
        baseline_agent_type: request.baseline_agent_type,
        intent,
        input_count: request.input_count.map(i64::from),
    })
}

fn protocol_status_entry(value: &Value) -> Result<AgentStatusSnapshotEntry, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Stored agent status entry is not an object"))?;
    let subagents = object
        .get("subagents")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .map(protocol_subagent)
                .collect::<Result<Vec<_>, Status>>()
        })
        .transpose()?
        .unwrap_or_default();
    Ok(AgentStatusSnapshotEntry {
        pane_key: required_string(object, "paneKey")?,
        received_at: integer(object, "receivedAt"),
        state_started_at: integer(object, "stateStartedAt"),
        state: enum_string(object, "state", protocol_status_state) as i32,
        prompt: optional_string(object, "prompt").unwrap_or_default(),
        launch_token: optional_string(object, "launchToken"),
        tab_id: optional_string(object, "tabId"),
        worktree_id: optional_string(object, "worktreeId"),
        connection_id: optional_object(object, "connectionId", protocol_nullable_string)?,
        agent_type: optional_string(object, "agentType"),
        model: optional_string(object, "model"),
        tool_name: optional_string(object, "toolName"),
        tool_input: optional_string(object, "toolInput"),
        interactive_prompt: optional_string(object, "interactivePrompt"),
        last_assistant_message: optional_string(object, "lastAssistantMessage"),
        subagents,
        provider_session: optional_object(object, "providerSession", protocol_provider_session)?,
        provider_session_only: object.get("providerSessionOnly").and_then(Value::as_bool),
        prompt_interaction_key: optional_string(object, "promptInteractionKey"),
        tool_use_id: optional_string(object, "toolUseId"),
        tool_agent_id: optional_string(object, "toolAgentId"),
        tool_agent_type: optional_string(object, "toolAgentType"),
        interrupted: object.get("interrupted").and_then(Value::as_bool),
    })
}

fn protocol_subagent(value: &Value) -> Result<AgentStatusSubagent, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Stored agent subagent entry is not an object"))?;
    Ok(AgentStatusSubagent {
        id: required_string(object, "id")?,
        state: enum_string(object, "state", protocol_subagent_state) as i32,
        started_at: integer(object, "startedAt"),
        agent_type: optional_string(object, "agentType"),
        model: optional_string(object, "model"),
        description: optional_string(object, "description"),
    })
}

fn protocol_provider_session(value: &Value) -> Result<AgentProviderSession, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Stored agent provider session is not an object"))?;
    Ok(AgentProviderSession {
        key: enum_string(object, "key", protocol_provider_session_key) as i32,
        id: required_string(object, "id")?,
        transcript_path: optional_string(object, "transcriptPath"),
    })
}

fn protocol_nullable_string(value: &Value) -> Result<AgentStatusNullableString, Status> {
    let value = match value {
        Value::Null => agent_status_nullable_string::Value::Null(true),
        Value::String(value) => agent_status_nullable_string::Value::Text(value.clone()),
        _ => return Err(data_loss("Stored agent status nullable string is invalid")),
    };
    Ok(AgentStatusNullableString { value: Some(value) })
}

fn protocol_migration_entry(value: &Value) -> Result<AgentMigrationUnsupportedPtyEntry, Status> {
    let object = value
        .as_object()
        .ok_or_else(|| data_loss("Stored migration-unsupported entry is not an object"))?;
    Ok(AgentMigrationUnsupportedPtyEntry {
        pty_id: required_string(object, "ptyId")?,
        reason: enum_string(object, "reason", protocol_migration_reason) as i32,
        source: enum_string(object, "source", protocol_migration_source) as i32,
        updated_at: integer(object, "updatedAt"),
        worktree_id: optional_string(object, "worktreeId"),
        tab_id: optional_string(object, "tabId"),
        leaf_id: optional_string(object, "leafId"),
        pane_key: optional_string(object, "paneKey"),
    })
}

fn protocol_status_state(value: &str) -> AgentStatusState {
    match value {
        "working" => AgentStatusState::Working,
        "blocked" => AgentStatusState::Blocked,
        "waiting" => AgentStatusState::Waiting,
        "done" => AgentStatusState::Done,
        // Why: persisted entries may predate the typed enum, and an unknown
        // state must not fail the whole snapshot — the legacy surface forwarded
        // it verbatim.
        _ => AgentStatusState::Unspecified,
    }
}

fn protocol_subagent_state(value: &str) -> AgentSubagentState {
    match value {
        "working" => AgentSubagentState::Working,
        "blocked" => AgentSubagentState::Blocked,
        "waiting" => AgentSubagentState::Waiting,
        "idle" => AgentSubagentState::Idle,
        _ => AgentSubagentState::Unspecified,
    }
}

fn protocol_provider_session_key(value: &str) -> AgentProviderSessionKey {
    match value {
        "session_id" => AgentProviderSessionKey::SessionId,
        "conversation_id" => AgentProviderSessionKey::ConversationId,
        _ => AgentProviderSessionKey::Unspecified,
    }
}

fn protocol_migration_reason(value: &str) -> AgentMigrationUnsupportedReason {
    match value {
        "legacy-numeric-pane-key" => AgentMigrationUnsupportedReason::LegacyNumericPaneKey,
        _ => AgentMigrationUnsupportedReason::Unspecified,
    }
}

fn protocol_migration_source(value: &str) -> AgentMigrationUnsupportedSource {
    match value {
        "local" => AgentMigrationUnsupportedSource::Local,
        "ssh" => AgentMigrationUnsupportedSource::Ssh,
        _ => AgentMigrationUnsupportedSource::Unspecified,
    }
}

fn enum_string<T>(
    object: &serde_json::Map<String, Value>,
    field: &str,
    convert: impl Fn(&str) -> T + Copy,
) -> T {
    object
        .get(field)
        .and_then(Value::as_str)
        .map(convert)
        .unwrap_or_else(|| convert(""))
}

fn required_string(object: &serde_json::Map<String, Value>, field: &str) -> Result<String, Status> {
    object
        .get(field)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| data_loss("Stored agent status entry is missing a required string"))
}

fn optional_string(object: &serde_json::Map<String, Value>, field: &str) -> Option<String> {
    object.get(field).and_then(Value::as_str).map(str::to_owned)
}

fn integer(object: &serde_json::Map<String, Value>, field: &str) -> i64 {
    object
        .get(field)
        .and_then(Value::as_i64)
        .unwrap_or_default()
}

fn optional_object<T>(
    object: &serde_json::Map<String, Value>,
    field: &str,
    convert: impl FnOnce(&Value) -> Result<T, Status>,
) -> Result<Option<T>, Status> {
    object.get(field).map(convert).transpose()
}

fn required_pane_key(value: &str) -> Result<&str, Status> {
    if value.is_empty() {
        return Err(invalid_argument("Agent status pane key must not be empty"));
    }
    Ok(value)
}

fn timestamp(value: Option<f64>, name: &str) -> Result<f64, Status> {
    match value {
        Some(value) if value.is_finite() => Ok(value),
        _ => Err(invalid_argument(&format!(
            "{name} must be present and finite"
        ))),
    }
}

fn stream_status(message: &str) -> Status {
    status(StatusCode::Internal, message)
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn data_loss(message: &str) -> Status {
    status(StatusCode::DataLoss, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

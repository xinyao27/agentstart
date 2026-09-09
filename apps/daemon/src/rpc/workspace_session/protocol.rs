use serde_json::{Map, Value, json};
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    ShellSessionServiceFlushRequest, ShellSessionServiceGetRequest, ShellSessionServiceGetResponse,
    ShellSessionServiceMutatedResponse, ShellSessionServicePatchRequest,
    ShellSessionServiceSetRequest, ShellSessionVersion,
};
use yiru_protocol::transport::{decode, encode};

use crate::workspace_session::{SessionSnapshot, SessionVersion, WorkspaceSessionError};

use super::WorkspaceSessionRpc;
use super::input::{parse_flush, parse_get, parse_patch, parse_set};
use super::protocol_values::session_value;

pub(in crate::rpc) async fn get(
    rpc: &WorkspaceSessionRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellSessionServiceGetRequest>(payload)?;
    // Why: Session normalization retains stored-data compatibility at this boundary.
    let input = optional_host_input(request.host_id);
    let host_id = parse_get(Some(&Value::Object(input))).map_err(input_status)?;
    let snapshot = rpc
        .authority
        .get_snapshot(host_id.as_deref())
        .await
        .map_err(state_status)?;
    Ok(encode(&ShellSessionServiceGetResponse {
        session: Some(session_value(&snapshot.session)),
        version: Some(version_value(snapshot.version)),
    }))
}

pub(in crate::rpc) async fn watch(
    rpc: &WorkspaceSessionRpc,
    payload: &[u8],
    context: &crate::rpc::protocol_call::ProtocolCallContext,
) -> Result<(), Status> {
    let request = decode::<ShellSessionServiceGetRequest>(payload)?;
    let input = optional_host_input(request.host_id);
    let host_id = parse_get(Some(&Value::Object(input))).map_err(input_status)?;
    let mut changes = rpc.authority.subscribe_changes();
    loop {
        changes.borrow_and_update();
        let snapshot = rpc
            .authority
            .get_snapshot(host_id.as_deref())
            .await
            .map_err(state_status)?;
        context
            .send_stream_payload(encode(&ShellSessionServiceGetResponse {
                session: Some(session_value(&snapshot.session)),
                version: Some(version_value(snapshot.version)),
            }))
            .await?;
        if changes.changed().await.is_err() {
            return Ok(());
        }
    }
}

pub(in crate::rpc) async fn set(
    rpc: &WorkspaceSessionRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellSessionServiceSetRequest>(payload)?;
    let expected = expected_version(request.expected_version)?;
    let mut input = optional_host_input(request.host_id);
    input.insert(
        "session".to_owned(),
        request
            .session
            .as_ref()
            .map(super::protocol_values::json_from_value)
            .unwrap_or(Value::Null),
    );
    let parsed = parse_set(Some(&Value::Object(input))).map_err(input_status)?;
    let snapshot = rpc
        .authority
        .set(parsed.session, parsed.host_id.as_deref(), expected)
        .await
        .map_err(state_status)?;
    Ok(mutation_response(snapshot))
}

pub(in crate::rpc) async fn patch(
    rpc: &WorkspaceSessionRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellSessionServicePatchRequest>(payload)?;
    let expected = expected_version(request.expected_version)?;
    let mut input = optional_host_input(request.host_id);
    // Why: the legacy schema validates a patch object, so the entries render
    // as a JSON object key-by-key preserving caller order.
    let mut patch = Map::new();
    for entry in request.patch {
        patch.insert(
            entry.key,
            entry
                .value
                .as_ref()
                .map(super::protocol_values::json_from_value)
                .unwrap_or(Value::Null),
        );
    }
    input.insert("patch".to_owned(), Value::Object(patch));
    let parsed = parse_patch(Some(&Value::Object(input))).map_err(input_status)?;
    let snapshot = rpc
        .authority
        .patch(parsed.patch, parsed.host_id.as_deref(), expected)
        .await
        .map_err(state_status)?;
    Ok(mutation_response(snapshot))
}

pub(in crate::rpc) async fn flush(
    rpc: &WorkspaceSessionRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellSessionServiceFlushRequest>(payload)?;
    parse_flush(None).map_err(input_status)?;
    rpc.authority.flush().await.map_err(state_status)?;
    Ok(encode(&ShellSessionServiceMutatedResponse::default()))
}

fn optional_host_input(host_id: Option<String>) -> Map<String, Value> {
    let mut input = Map::new();
    if let Some(host_id) = host_id.filter(|host_id| !host_id.is_empty()) {
        input.insert("hostId".to_owned(), json!(host_id));
    }
    input
}

fn input_status(_error: super::input::SessionInputFailure) -> Status {
    status(StatusCode::InvalidArgument, "Input validation failed")
}

fn state_status(error: WorkspaceSessionError) -> Status {
    let code = if matches!(error, WorkspaceSessionError::VersionConflict) {
        StatusCode::Aborted
    } else {
        StatusCode::Internal
    };
    status(code, &error.to_string())
}

fn expected_version(value: Option<ShellSessionVersion>) -> Result<SessionVersion, Status> {
    let value =
        value.ok_or_else(|| status(StatusCode::FailedPrecondition, "session_version_required"))?;
    if value.epoch.is_empty() {
        return Err(status(
            StatusCode::FailedPrecondition,
            "session_version_required",
        ));
    }
    Ok(SessionVersion {
        epoch: value.epoch,
        revision: value.revision,
    })
}

fn version_value(value: SessionVersion) -> ShellSessionVersion {
    ShellSessionVersion {
        epoch: value.epoch,
        revision: value.revision,
    }
}

fn mutation_response(snapshot: SessionSnapshot) -> Vec<u8> {
    encode(&ShellSessionServiceMutatedResponse {
        version: Some(version_value(snapshot.version)),
        session: Some(session_value(&snapshot.session)),
    })
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

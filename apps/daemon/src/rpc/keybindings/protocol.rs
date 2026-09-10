use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    ShellKeybindingsServiceEnsureFileRequest, ShellKeybindingsServiceGetRequest,
    ShellKeybindingsServiceOpenFileRequest, ShellKeybindingsServiceReloadRequest,
    ShellKeybindingsServiceRevealFileRequest, ShellKeybindingsServiceSetActionRequest,
    shell_keybindings_service_set_action_request,
};
use agentstart_protocol::transport::{decode, encode};

use super::KeybindingsRpc;
use super::protocol_values::protocol_snapshot;

pub(in crate::rpc) async fn get(rpc: &KeybindingsRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    decode::<ShellKeybindingsServiceGetRequest>(payload)?;
    let snapshot = rpc.get_snapshot().await.map_err(keybindings_status)?;
    Ok(encode(&protocol_snapshot(&snapshot)))
}

pub(in crate::rpc) async fn ensure_file(
    rpc: &KeybindingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellKeybindingsServiceEnsureFileRequest>(payload)?;
    let snapshot = rpc.ensure_file().await.map_err(keybindings_status)?;
    Ok(encode(&protocol_snapshot(&snapshot)))
}

pub(in crate::rpc) async fn reload(
    rpc: &KeybindingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellKeybindingsServiceReloadRequest>(payload)?;
    let snapshot = rpc.reload().await.map_err(keybindings_status)?;
    Ok(encode(&protocol_snapshot(&snapshot)))
}

pub(in crate::rpc) async fn open_file(
    rpc: &KeybindingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellKeybindingsServiceOpenFileRequest>(payload)?;
    let snapshot = rpc.open_file().await.map_err(keybindings_status)?;
    Ok(encode(&protocol_snapshot(&snapshot)))
}

pub(in crate::rpc) async fn reveal_file(
    rpc: &KeybindingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellKeybindingsServiceRevealFileRequest>(payload)?;
    let snapshot = rpc.reveal_file().await.map_err(keybindings_status)?;
    Ok(encode(&protocol_snapshot(&snapshot)))
}

pub(in crate::rpc) async fn set_action(
    rpc: &KeybindingsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellKeybindingsServiceSetActionRequest>(payload)?;
    if request.action_id.is_empty() {
        return Err(invalid_argument("Action id must not be empty"));
    }
    let bindings = match request.bindings {
        Some(shell_keybindings_service_set_action_request::Bindings::Set(list)) => {
            Some(list.bindings)
        }
        Some(shell_keybindings_service_set_action_request::Bindings::Clear(_)) => None,
        None => return Err(invalid_argument("Bindings must be a list or null")),
    };
    let snapshot = rpc
        .set_action(request.action_id, bindings)
        .await
        .map_err(keybindings_status)?;
    Ok(encode(&protocol_snapshot(&snapshot)))
}

// Why: the legacy JSON surface answers every authority failure with one
// internal error, so the protobuf surface keeps that outcome for authority
// failures and only request-shape problems become invalid arguments.
fn keybindings_status(error: crate::keybindings::KeybindingsError) -> Status {
    status(StatusCode::Internal, &error.to_string())
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

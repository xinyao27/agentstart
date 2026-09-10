use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    ShellPlatformOpenFailure, ShellPlatformServiceExistsResponse,
    ShellPlatformServiceGetSystemAccentColorRequest,
    ShellPlatformServiceGetSystemAccentColorResponse, ShellPlatformServiceOpenFileUriRequest,
    ShellPlatformServiceOpenInExternalEditorRequest, ShellPlatformServiceOpenPathRequest,
    ShellPlatformServiceOpenedResponse, ShellPlatformServiceOutcomeResponse,
    ShellPlatformServicePathRequest, ShellPlatformServicePickDirectoryRequest,
    ShellPlatformServicePickRequest, ShellPlatformServicePickedResponse,
    ShellPlatformServiceUnitResponse,
};
use agentstart_protocol::transport::{decode, encode};

use crate::shell_platform::FileKind;

use super::ShellPlatformRpc;

pub(in crate::rpc) async fn get_system_accent_color(
    rpc: &ShellPlatformRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellPlatformServiceGetSystemAccentColorRequest>(payload)?;
    Ok(encode(&ShellPlatformServiceGetSystemAccentColorResponse {
        color: rpc.authority.get_system_accent_color().await,
    }))
}

pub(in crate::rpc) async fn open_path(
    rpc: &ShellPlatformRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellPlatformServiceOpenPathRequest>(payload)?;
    required(&request.path, "Path must not be empty")?;
    rpc.authority.open_path(&request.path).await;
    Ok(encode(&ShellPlatformServiceUnitResponse {}))
}

pub(in crate::rpc) async fn open_file_uri(
    rpc: &ShellPlatformRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellPlatformServiceOpenFileUriRequest>(payload)?;
    required(&request.uri, "URI must not be empty")?;
    rpc.authority.open_file_uri(&request.uri).await;
    Ok(encode(&ShellPlatformServiceUnitResponse {}))
}

pub(in crate::rpc) async fn open_in_external_editor(
    rpc: &ShellPlatformRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellPlatformServiceOpenInExternalEditorRequest>(payload)?;
    required(&request.path, "Path must not be empty")?;
    let outcome = rpc
        .authority
        .open_in_external_editor(
            &request.path,
            request.command.as_deref(),
            request.connection_id.as_deref(),
        )
        .await;
    Ok(encode(&protocol_outcome(&outcome)?))
}

pub(in crate::rpc) async fn open_in_file_manager(
    rpc: &ShellPlatformRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellPlatformServicePathRequest>(payload)?;
    required(&request.path, "Path must not be empty")?;
    let outcome = rpc.authority.open_in_file_manager(&request.path).await;
    Ok(encode(&protocol_outcome(&outcome)?))
}

pub(in crate::rpc) async fn open_file_path(
    rpc: &ShellPlatformRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellPlatformServicePathRequest>(payload)?;
    required(&request.path, "Path must not be empty")?;
    let opened = rpc.authority.open_file_path(&request.path).await;
    Ok(encode(&ShellPlatformServiceOpenedResponse { opened }))
}

pub(in crate::rpc) async fn path_exists(
    rpc: &ShellPlatformRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellPlatformServicePathRequest>(payload)?;
    required(&request.path, "Path must not be empty")?;
    let exists = rpc.authority.path_exists(&request.path).await;
    Ok(encode(&ShellPlatformServiceExistsResponse { exists }))
}

pub(in crate::rpc) async fn pick_attachment(
    rpc: &ShellPlatformRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellPlatformServicePickRequest>(payload)?;
    Ok(encode(&protocol_picked(
        rpc.authority.pick_file(FileKind::Attachment).await,
    )))
}

pub(in crate::rpc) async fn pick_image(
    rpc: &ShellPlatformRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellPlatformServicePickRequest>(payload)?;
    Ok(encode(&protocol_picked(
        rpc.authority.pick_file(FileKind::Image).await,
    )))
}

pub(in crate::rpc) async fn pick_audio(
    rpc: &ShellPlatformRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellPlatformServicePickRequest>(payload)?;
    Ok(encode(&protocol_picked(
        rpc.authority.pick_file(FileKind::Audio).await,
    )))
}

pub(in crate::rpc) async fn pick_directory(
    rpc: &ShellPlatformRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let _request = decode::<ShellPlatformServicePickDirectoryRequest>(payload)?;
    Ok(encode(&protocol_picked(
        rpc.authority.pick_directory().await,
    )))
}

// Why: the authority answers open failures as an in-band `{ok, reason}` JSON
// pair, so the protobuf surface maps the same closed reason set instead of
// turning recoverable failures into RPC errors.
fn protocol_outcome(
    outcome: &serde_json::Value,
) -> Result<ShellPlatformServiceOutcomeResponse, Status> {
    let object = outcome
        .as_object()
        .ok_or_else(|| data_loss("Shell platform open outcome is not an object"))?;
    Ok(ShellPlatformServiceOutcomeResponse {
        ok: object
            .get("ok")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        reason: match object.get("reason").and_then(serde_json::Value::as_str) {
            Some("not-absolute") => ShellPlatformOpenFailure::NotAbsolute,
            Some("not-found") => ShellPlatformOpenFailure::NotFound,
            Some("launch-failed") => ShellPlatformOpenFailure::LaunchFailed,
            Some("remote-runtime-unsupported") => {
                ShellPlatformOpenFailure::RemoteRuntimeUnsupported
            }
            _ => ShellPlatformOpenFailure::Unspecified,
        } as i32,
    })
}

fn protocol_picked(path: Option<String>) -> ShellPlatformServicePickedResponse {
    ShellPlatformServicePickedResponse { path }
}

fn required(value: &str, message: &str) -> Result<(), Status> {
    if value.is_empty() {
        return Err(status(StatusCode::InvalidArgument, message));
    }
    Ok(())
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

use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    ComputerServiceCapabilitiesRequest, ComputerServiceClickRequest, ComputerServiceDragRequest,
    ComputerServiceGetAppStateRequest, ComputerServiceHotkeyRequest,
    ComputerServiceListAppsRequest, ComputerServiceListWindowsRequest,
    ComputerServicePasteTextRequest, ComputerServicePerformSecondaryActionRequest,
    ComputerServicePermissionsRequest, ComputerServicePermissionsResetRequest,
    ComputerServicePermissionsStatusRequest, ComputerServicePressKeyRequest,
    ComputerServiceScrollRequest, ComputerServiceSetValueRequest, ComputerServiceTypeTextRequest,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::json;

use crate::computer::ComputerError;
use crate::rpc::protocol_call::status;

use super::ComputerRpc;
use super::{request, response};

pub(in crate::rpc) async fn capabilities(
    rpc: &ComputerRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ComputerServiceCapabilitiesRequest>(payload)?;
    let value = rpc
        .invoke_typed("computer.capabilities", json!({}))
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::capabilities_response(&value)))
}

pub(in crate::rpc) async fn list_apps(
    rpc: &ComputerRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ComputerServiceListAppsRequest>(payload)?;
    let value = rpc
        .invoke_typed("computer.listApps", json!({}))
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::list_apps_response(&value)))
}

pub(in crate::rpc) async fn permissions(
    rpc: &ComputerRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let input = decode::<ComputerServicePermissionsRequest>(payload)?;
    let body = request::permissions(&input)?;
    let value = rpc
        .invoke_typed("computer.permissions", body)
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::permissions_response(&value)))
}

pub(in crate::rpc) async fn permissions_status(
    rpc: &ComputerRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ComputerServicePermissionsStatusRequest>(payload)?;
    let value = rpc
        .invoke_typed("computer.permissionsStatus", json!({}))
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::permissions_status_response(&value)))
}

pub(in crate::rpc) async fn permissions_reset(
    rpc: &ComputerRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ComputerServicePermissionsResetRequest>(payload)?;
    let value = rpc
        .invoke_typed("computer.permissionsReset", json!({}))
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::permissions_reset_response(&value)))
}

pub(in crate::rpc) async fn list_windows(
    rpc: &ComputerRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let input = decode::<ComputerServiceListWindowsRequest>(payload)?;
    let body = request::list_windows(&input);
    let value = rpc
        .invoke_typed("computer.listWindows", body)
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::list_windows_response(&value)))
}

pub(in crate::rpc) async fn get_app_state(
    rpc: &ComputerRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let input = decode::<ComputerServiceGetAppStateRequest>(payload)?;
    let body = request::get_app_state(&input)?;
    let value = rpc
        .invoke_typed("computer.getAppState", body)
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::get_app_state_response(&value)))
}

pub(in crate::rpc) async fn click(rpc: &ComputerRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let input = decode::<ComputerServiceClickRequest>(payload)?;
    let body = request::click(&input)?;
    let value = rpc
        .invoke_typed("computer.click", body)
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::action_response(&value)))
}

pub(in crate::rpc) async fn perform_secondary_action(
    rpc: &ComputerRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let input = decode::<ComputerServicePerformSecondaryActionRequest>(payload)?;
    let body = request::perform_secondary_action(&input)?;
    let value = rpc
        .invoke_typed("computer.performSecondaryAction", body)
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::action_response(&value)))
}

pub(in crate::rpc) async fn scroll(rpc: &ComputerRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let input = decode::<ComputerServiceScrollRequest>(payload)?;
    let body = request::scroll(&input)?;
    let value = rpc
        .invoke_typed("computer.scroll", body)
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::action_response(&value)))
}

pub(in crate::rpc) async fn drag(rpc: &ComputerRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let input = decode::<ComputerServiceDragRequest>(payload)?;
    let body = request::drag(&input)?;
    let value = rpc
        .invoke_typed("computer.drag", body)
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::action_response(&value)))
}

pub(in crate::rpc) async fn type_text(
    rpc: &ComputerRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let input = decode::<ComputerServiceTypeTextRequest>(payload)?;
    let body = request::type_text(&input)?;
    let value = rpc
        .invoke_typed("computer.typeText", body)
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::action_response(&value)))
}

pub(in crate::rpc) async fn press_key(
    rpc: &ComputerRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let input = decode::<ComputerServicePressKeyRequest>(payload)?;
    let body = request::press_key(&input)?;
    let value = rpc
        .invoke_typed("computer.pressKey", body)
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::action_response(&value)))
}

pub(in crate::rpc) async fn hotkey(rpc: &ComputerRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let input = decode::<ComputerServiceHotkeyRequest>(payload)?;
    let body = request::hotkey(&input)?;
    let value = rpc
        .invoke_typed("computer.hotkey", body)
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::action_response(&value)))
}

pub(in crate::rpc) async fn paste_text(
    rpc: &ComputerRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let input = decode::<ComputerServicePasteTextRequest>(payload)?;
    let body = request::paste_text(&input)?;
    let value = rpc
        .invoke_typed("computer.pasteText", body)
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::action_response(&value)))
}

pub(in crate::rpc) async fn set_value(
    rpc: &ComputerRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let input = decode::<ComputerServiceSetValueRequest>(payload)?;
    let body = request::set_value(&input)?;
    let value = rpc
        .invoke_typed("computer.setValue", body)
        .await
        .map_err(computer_status)?;
    Ok(encode(&response::action_response(&value)))
}

// Why: mirrors the legacy `error_status` HTTP-style mapping in
// `rpc/computer.rs`, translated to gRPC-style codes for the typed transport.
fn computer_status(error: ComputerError) -> Status {
    let (code, message) = error.rpc_parts();
    let status_code = match code {
        "app_not_found" | "window_not_found" | "element_not_found" => StatusCode::NotFound,
        "permission_denied" | "app_blocked" => StatusCode::PermissionDenied,
        "provider_incompatible" | "unsupported_capability" | "action_not_supported" => {
            StatusCode::FailedPrecondition
        }
        "action_timeout" => StatusCode::DeadlineExceeded,
        "accessibility_error" | "screenshot_failed" => StatusCode::Internal,
        _ => StatusCode::InvalidArgument,
    };
    status(status_code, message)
}

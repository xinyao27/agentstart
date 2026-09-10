use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    DeveloperPermissionId as ProtocolPermissionId,
    DeveloperPermissionState as ProtocolPermissionState,
    DeveloperPermissionStatus as ProtocolPermissionStatus,
    DeveloperPermissionsServiceGetStatusRequest, DeveloperPermissionsServiceGetStatusResponse,
    DeveloperPermissionsServiceRequestRequest, DeveloperPermissionsServiceRequestResponse,
};
use agentstart_protocol::transport::{decode, encode};

use crate::developer_permissions::{
    DeveloperPermissionId, DeveloperPermissionState, DeveloperPermissionStatus,
    DeveloperPermissionsError,
};

use super::DeveloperPermissionsRpc;

pub(in crate::rpc) async fn get_status(
    rpc: &DeveloperPermissionsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<DeveloperPermissionsServiceGetStatusRequest>(payload)?;
    Ok(encode(&DeveloperPermissionsServiceGetStatusResponse {
        permissions: rpc.status().await.into_iter().map(protocol_state).collect(),
    }))
}

pub(in crate::rpc) async fn request(
    rpc: &DeveloperPermissionsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<DeveloperPermissionsServiceRequestRequest>(payload)?;
    let id = permission_id(request.id)?;
    let result = rpc.request(id).await.map_err(request_status)?;
    Ok(encode(&DeveloperPermissionsServiceRequestResponse {
        permission: Some(protocol_state(DeveloperPermissionState {
            id: result.id,
            status: result.status,
        })),
        opened_system_settings: result.opened_system_settings,
    }))
}

fn permission_id(value: i32) -> Result<DeveloperPermissionId, Status> {
    match ProtocolPermissionId::try_from(value) {
        Ok(ProtocolPermissionId::Microphone) => Ok(DeveloperPermissionId::Microphone),
        Ok(ProtocolPermissionId::Camera) => Ok(DeveloperPermissionId::Camera),
        Ok(ProtocolPermissionId::Screen) => Ok(DeveloperPermissionId::Screen),
        Ok(ProtocolPermissionId::Accessibility) => Ok(DeveloperPermissionId::Accessibility),
        Ok(ProtocolPermissionId::FullDiskAccess) => Ok(DeveloperPermissionId::FullDiskAccess),
        Ok(ProtocolPermissionId::Automation) => Ok(DeveloperPermissionId::Automation),
        Ok(ProtocolPermissionId::LocalNetwork) => Ok(DeveloperPermissionId::LocalNetwork),
        Ok(ProtocolPermissionId::Usb) => Ok(DeveloperPermissionId::Usb),
        Ok(ProtocolPermissionId::Bluetooth) => Ok(DeveloperPermissionId::Bluetooth),
        Ok(ProtocolPermissionId::Unspecified) | Err(_) => Err(status(
            StatusCode::InvalidArgument,
            "Unknown developer permission",
        )),
    }
}

fn protocol_state(state: DeveloperPermissionState) -> ProtocolPermissionState {
    ProtocolPermissionState {
        id: protocol_id(state.id) as i32,
        status: protocol_status(state.status) as i32,
    }
}

fn protocol_id(id: DeveloperPermissionId) -> ProtocolPermissionId {
    match id {
        DeveloperPermissionId::Microphone => ProtocolPermissionId::Microphone,
        DeveloperPermissionId::Camera => ProtocolPermissionId::Camera,
        DeveloperPermissionId::Screen => ProtocolPermissionId::Screen,
        DeveloperPermissionId::Accessibility => ProtocolPermissionId::Accessibility,
        DeveloperPermissionId::FullDiskAccess => ProtocolPermissionId::FullDiskAccess,
        DeveloperPermissionId::Automation => ProtocolPermissionId::Automation,
        DeveloperPermissionId::LocalNetwork => ProtocolPermissionId::LocalNetwork,
        DeveloperPermissionId::Usb => ProtocolPermissionId::Usb,
        DeveloperPermissionId::Bluetooth => ProtocolPermissionId::Bluetooth,
    }
}

fn protocol_status(status: DeveloperPermissionStatus) -> ProtocolPermissionStatus {
    match status {
        #[cfg(target_os = "macos")]
        DeveloperPermissionStatus::Granted => ProtocolPermissionStatus::Granted,
        #[cfg(target_os = "macos")]
        DeveloperPermissionStatus::Unknown => ProtocolPermissionStatus::Unknown,
        #[cfg(not(target_os = "macos"))]
        DeveloperPermissionStatus::Unsupported => ProtocolPermissionStatus::Unsupported,
        #[cfg(target_os = "macos")]
        DeveloperPermissionStatus::Ready => ProtocolPermissionStatus::Ready,
    }
}

fn request_status(error: DeveloperPermissionsError) -> Status {
    match error {
        #[cfg(target_os = "macos")]
        DeveloperPermissionsError::SettingsOpenFailed => status(
            StatusCode::Unavailable,
            "Could not open macOS Privacy & Security",
        ),
        // Why: the Computer Use helper reports its own failure reason, and the
        // workbench shows it the way the permission pane already does.
        DeveloperPermissionsError::ComputerUse(error) => {
            status(StatusCode::Internal, error.rpc_parts().1)
        }
    }
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

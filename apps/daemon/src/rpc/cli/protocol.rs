use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    CliInstallMethod as ProtocolCliInstallMethod, CliInstallState as ProtocolCliInstallState,
    CliInstallStatus as ProtocolCliInstallStatus,
    CliInstallUnsupportedReason as ProtocolCliInstallUnsupportedReason,
    CliServiceGetInstallStatusRequest, CliServiceGetInstallStatusResponse,
    CliServiceInstallRequest, CliServiceInstallResponse, CliServiceRemoveRequest,
    CliServiceRemoveResponse, GetWslInstallStatusRequest, GetWslInstallStatusResponse,
    HostPlatform, InstallWslRequest, InstallWslResponse, RemoveWslRequest, RemoveWslResponse,
};
use agentstart_protocol::transport::{decode, encode};

use crate::cli_installer::{
    CliInstallMethod, CliInstallState, CliInstallStatus, CliInstallUnsupportedReason,
    CliInstallerError,
};

use super::CliRpc;

pub(in crate::rpc) async fn get_install_status(
    rpc: &CliRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<CliServiceGetInstallStatusRequest>(payload)?;
    Ok(encode(&CliServiceGetInstallStatusResponse {
        status: Some(protocol_local_status(rpc.protocol_status().await?)?),
    }))
}

pub(in crate::rpc) async fn install(rpc: &CliRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    decode::<CliServiceInstallRequest>(payload)?;
    Ok(encode(&CliServiceInstallResponse {
        status: Some(protocol_local_status(rpc.protocol_install().await?)?),
    }))
}

pub(in crate::rpc) async fn remove(rpc: &CliRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    decode::<CliServiceRemoveRequest>(payload)?;
    Ok(encode(&CliServiceRemoveResponse {
        status: Some(protocol_local_status(rpc.protocol_remove().await?)?),
    }))
}

pub(in crate::rpc) async fn get_wsl_install_status(
    rpc: &CliRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GetWslInstallStatusRequest>(payload)?;
    Ok(encode(&GetWslInstallStatusResponse {
        status: Some(protocol_status(
            rpc.protocol_wsl_status(request.distro.as_deref()).await?,
        )?),
    }))
}

pub(in crate::rpc) async fn install_wsl(rpc: &CliRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<InstallWslRequest>(payload)?;
    Ok(encode(&InstallWslResponse {
        status: Some(protocol_status(
            rpc.protocol_wsl_install(request.distro.as_deref()).await?,
        )?),
    }))
}

pub(in crate::rpc) async fn remove_wsl(rpc: &CliRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<RemoveWslRequest>(payload)?;
    Ok(encode(&RemoveWslResponse {
        status: Some(protocol_status(
            rpc.protocol_wsl_remove(request.distro.as_deref()).await?,
        )?),
    }))
}

fn protocol_status(status: CliInstallStatus) -> Result<ProtocolCliInstallStatus, Status> {
    if status.platform != "linux" {
        return Err(wsl_platform_error());
    }
    protocol_platform_status(status, HostPlatform::Linux)
}

fn protocol_local_status(status: CliInstallStatus) -> Result<ProtocolCliInstallStatus, Status> {
    // Why: an unsupported OS keeps the wire's UNKNOWN platform so the caller
    // still receives supported:false with the unsupported reason, exactly like
    // the legacy JSON status payload.
    let platform = match status.platform.as_str() {
        "darwin" => HostPlatform::Darwin,
        "linux" => HostPlatform::Linux,
        "win32" => HostPlatform::Windows,
        _ => HostPlatform::Unknown,
    };
    protocol_platform_status(status, platform)
}

fn protocol_platform_status(
    status: CliInstallStatus,
    platform: HostPlatform,
) -> Result<ProtocolCliInstallStatus, Status> {
    Ok(ProtocolCliInstallStatus {
        platform: platform as i32,
        command_name: status.command_name,
        command_path: status.command_path,
        path_directory: status.path_directory,
        path_configured: status.path_configured,
        launcher_path: status.launcher_path,
        install_method: status.install_method.map(protocol_method).map(i32::from),
        supported: status.supported,
        state: protocol_state(status.state) as i32,
        current_target: status.current_target,
        unsupported_reason: status
            .unsupported_reason
            .map(protocol_unsupported_reason)
            .map(i32::from),
        detail: status.detail,
    })
}

fn wsl_platform_error() -> Status {
    Status {
        code: StatusCode::DataLoss as i32,
        message: "WSL CLI installer returned an invalid platform".to_owned(),
        details: Vec::new(),
    }
}

fn protocol_method(method: CliInstallMethod) -> ProtocolCliInstallMethod {
    match method {
        CliInstallMethod::Symlink => ProtocolCliInstallMethod::Symlink,
        CliInstallMethod::Wrapper => ProtocolCliInstallMethod::Wrapper,
    }
}

fn protocol_state(state: CliInstallState) -> ProtocolCliInstallState {
    match state {
        CliInstallState::Installed => ProtocolCliInstallState::Installed,
        CliInstallState::NotInstalled => ProtocolCliInstallState::NotInstalled,
        CliInstallState::Stale => ProtocolCliInstallState::Stale,
        CliInstallState::Conflict => ProtocolCliInstallState::Conflict,
        CliInstallState::Unsupported => ProtocolCliInstallState::Unsupported,
    }
}

fn protocol_unsupported_reason(
    reason: CliInstallUnsupportedReason,
) -> ProtocolCliInstallUnsupportedReason {
    match reason {
        CliInstallUnsupportedReason::PlatformNotSupported => {
            ProtocolCliInstallUnsupportedReason::PlatformNotSupported
        }
        CliInstallUnsupportedReason::LauncherMissing => {
            ProtocolCliInstallUnsupportedReason::LauncherMissing
        }
        CliInstallUnsupportedReason::LaunchModeUnavailable => {
            ProtocolCliInstallUnsupportedReason::LaunchModeUnavailable
        }
    }
}

impl From<CliInstallerError> for Status {
    fn from(error: CliInstallerError) -> Self {
        // Why: the Bun methods classified every installer failure as runtime_error/500.
        Self {
            code: StatusCode::Internal as i32,
            message: error.to_string(),
            details: Vec::new(),
        }
    }
}

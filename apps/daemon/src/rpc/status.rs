use yiru_protocol::CURRENT_PROTOCOL_VERSION;
use yiru_protocol::protocol::v1::Welcome;
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    GetStatusRequest, GetStatusResponse, RemoteUpdateInstallMode, RemoteUpdateReason,
    RemoteUpdateSupport, RuntimeDeviceScope, RuntimeGraphStatus,
};
use yiru_protocol::transport::{decode, encode};

use crate::protocol::CallerClass;
use crate::runtime::RuntimeStatus;

#[derive(Clone)]
pub(super) struct StatusRpc {
    status: RuntimeStatus,
}

impl StatusRpc {
    pub(super) fn new(status: RuntimeStatus) -> Self {
        Self { status }
    }

    pub(super) fn welcome(
        &self,
        session_id: &str,
        max_frame_bytes: u32,
        initial_call_credit_bytes: u64,
        keep_alive_interval_ms: u32,
    ) -> Welcome {
        let status = self.status.view();
        Welcome {
            protocol_version: CURRENT_PROTOCOL_VERSION,
            daemon_version: status.app_version.to_owned(),
            runtime_id: status.runtime_id.to_owned(),
            session_id: session_id.to_owned(),
            max_frame_bytes,
            initial_call_credit_bytes,
            keep_alive_interval_ms,
            enabled_transport_features: Vec::new(),
        }
    }

    pub(super) fn protocol_status(
        &self,
        payload: &[u8],
        principal: CallerClass,
    ) -> Result<Vec<u8>, Status> {
        decode::<GetStatusRequest>(payload)?;
        let response = protocol_status_response(&self.status, principal)?;
        Ok(encode(&response))
    }
}

// Why shared: `shell.runtime.syncWindowGraph` answers with the same runtime
// status projection as StatusService, so both surfaces render the snapshot
// through this one function and cannot disagree about its fields.
pub(in crate::rpc) fn protocol_status_response(
    status: &RuntimeStatus,
    principal: CallerClass,
) -> Result<GetStatusResponse, Status> {
    let status = status.view();
    let live_tab_count = protocol_count(status.live_tab_count, "live_tab_count")?;
    let live_leaf_count = protocol_count(status.live_leaf_count, "live_leaf_count")?;
    Ok(GetStatusResponse {
        runtime_id: status.runtime_id.to_owned(),
        capabilities: status
            .capabilities
            .iter()
            .map(ToString::to_string)
            .collect(),
        host_platform: status.host_platform.to_owned(),
        runtime_api_version: status.runtime_api_version,
        min_compatible_runtime_client_version: status.min_compatible_runtime_client_version,
        renderer_graph_epoch: status.renderer_graph_epoch,
        graph_status: if status.graph_is_reloading {
            RuntimeGraphStatus::Reloading
        } else {
            RuntimeGraphStatus::Ready
        } as i32,
        authoritative_window_id: status.authoritative_window_id,
        live_tab_count,
        live_leaf_count,
        app_version: status.app_version.to_owned(),
        remote_update_support: Some(protocol_update_support(&status.remote_update_support)),
        remote_control: None,
        terminal_windows_shell: status.terminal_windows_shell,
        device_scope: match principal {
            CallerClass::Local => RuntimeDeviceScope::Unspecified,
            CallerClass::Mobile => RuntimeDeviceScope::Mobile,
            CallerClass::Runtime => RuntimeDeviceScope::Runtime,
        } as i32,
    })
}

fn protocol_update_support(support: &crate::updater::DaemonUpdaterSupport) -> RemoteUpdateSupport {
    let install_mode = match support.install_mode {
        crate::updater::DaemonUpdaterInstallMode::SupervisedHeadlessServe => {
            RemoteUpdateInstallMode::SupervisedHeadlessServe
        }
        crate::updater::DaemonUpdaterInstallMode::UnsupportedHeadlessServe => {
            RemoteUpdateInstallMode::UnsupportedHeadlessServe
        }
    };
    let reason = match support.reason {
        crate::updater::DaemonUpdaterSupportReason::Available => RemoteUpdateReason::Available,
        crate::updater::DaemonUpdaterSupportReason::ManualServiceUpdateRequired => {
            RemoteUpdateReason::ManualServiceUpdateRequired
        }
        crate::updater::DaemonUpdaterSupportReason::UnpackagedBuild => {
            RemoteUpdateReason::UnpackagedBuild
        }
        crate::updater::DaemonUpdaterSupportReason::UpdaterUnavailable => {
            RemoteUpdateReason::UpdaterUnavailable
        }
    };
    RemoteUpdateSupport {
        install_mode: install_mode as i32,
        automatic: support.automatic,
        reason: reason as i32,
    }
}

fn protocol_count(value: usize, field: &str) -> Result<u32, Status> {
    u32::try_from(value).map_err(|_| Status {
        code: StatusCode::ResourceExhausted as i32,
        message: format!("Runtime graph {field} exceeds the protocol limit"),
        details: Vec::new(),
    })
}

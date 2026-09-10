use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    WindowsFirewallRepairFailureReason as ProtocolRepairFailureReason,
    WindowsFirewallServiceGetStatusRequest, WindowsFirewallServiceGetStatusResponse,
    WindowsFirewallServiceOpenNetworkSettingsRequest,
    WindowsFirewallServiceOpenNetworkSettingsResponse, WindowsFirewallServiceRepairRequest,
    WindowsFirewallServiceRepairResponse, WindowsMobileFirewallDetails as ProtocolFirewallDetails,
    WindowsMobileFirewallStatus as ProtocolFirewallStatus,
    WindowsNetworkCategory as ProtocolNetworkCategory,
};
use agentstart_protocol::transport::{decode, encode};

use crate::mobile::windows_firewall::{
    WindowsFirewallRepairFailureReason, WindowsMobileFirewallDetails,
    WindowsMobileFirewallRepairResult, WindowsMobileFirewallStatus, WindowsNetworkCategory,
};

use super::WindowsFirewallRpc;

pub(in crate::rpc) async fn get_status(
    rpc: &WindowsFirewallRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WindowsFirewallServiceGetStatusRequest>(payload)?;
    Ok(encode(&WindowsFirewallServiceGetStatusResponse {
        status: Some(protocol_status(
            rpc.inspect(request.address.as_deref()).await,
        )),
    }))
}

pub(in crate::rpc) async fn repair(
    rpc: &WindowsFirewallRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<WindowsFirewallServiceRepairRequest>(payload)?;
    let (ok, reason) = match rpc.repair().await {
        WindowsMobileFirewallRepairResult::Ok => (true, None),
        WindowsMobileFirewallRepairResult::Failed(reason) => {
            (false, Some(protocol_repair_reason(reason) as i32))
        }
    };
    Ok(encode(&WindowsFirewallServiceRepairResponse { ok, reason }))
}

pub(in crate::rpc) fn open_network_settings(
    rpc: &WindowsFirewallRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<WindowsFirewallServiceOpenNetworkSettingsRequest>(payload)?;
    Ok(encode(&WindowsFirewallServiceOpenNetworkSettingsResponse {
        opened: rpc.open_network_settings(),
    }))
}

fn protocol_status(status: WindowsMobileFirewallStatus) -> ProtocolFirewallStatus {
    match status {
        WindowsMobileFirewallStatus::Unsupported => ProtocolFirewallStatus {
            supported: false,
            details: None,
        },
        WindowsMobileFirewallStatus::Supported(details) => ProtocolFirewallStatus {
            supported: true,
            details: Some(protocol_details(details)),
        },
    }
}

fn protocol_details(details: WindowsMobileFirewallDetails) -> ProtocolFirewallDetails {
    ProtocolFirewallDetails {
        port: u32::from(details.port),
        rule_allowed: details.rule_allowed,
        blocking_rule_detected: details.blocking_rule_detected,
        private_firewall_enabled: details.private_firewall_enabled,
        network_category: protocol_category(details.network_category) as i32,
        inspection_available: details.inspection_available,
    }
}

fn protocol_category(category: WindowsNetworkCategory) -> ProtocolNetworkCategory {
    match category {
        WindowsNetworkCategory::Private => ProtocolNetworkCategory::Private,
        WindowsNetworkCategory::Public => ProtocolNetworkCategory::Public,
        WindowsNetworkCategory::Domain => ProtocolNetworkCategory::Domain,
        WindowsNetworkCategory::Unknown => ProtocolNetworkCategory::Unknown,
    }
}

fn protocol_repair_reason(
    reason: WindowsFirewallRepairFailureReason,
) -> ProtocolRepairFailureReason {
    match reason {
        WindowsFirewallRepairFailureReason::Cancelled => ProtocolRepairFailureReason::Cancelled,
        WindowsFirewallRepairFailureReason::Failed => ProtocolRepairFailureReason::Failed,
        WindowsFirewallRepairFailureReason::Unsupported => ProtocolRepairFailureReason::Unsupported,
    }
}

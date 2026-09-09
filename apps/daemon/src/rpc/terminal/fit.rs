use yiru_protocol::protocol::v1::Status;
use yiru_protocol::runtime::v1::{
    TerminalDriverKind as ProtocolDriverKind, TerminalDriverSnapshot as ProtocolDriverSnapshot,
    TerminalFitOverride as ProtocolFitOverride, TerminalFitOverrideMode as ProtocolFitOverrideMode,
    TerminalFitServiceGetDriversRequest, TerminalFitServiceGetDriversResponse,
    TerminalFitServiceGetOverridesRequest, TerminalFitServiceGetOverridesResponse,
    TerminalFitServiceRestoreRequest, TerminalFitServiceRestoreResponse,
};
use yiru_protocol::transport::{decode, encode};

use crate::terminal_session::{
    TerminalDriverSnapshot, TerminalDriverState, TerminalFitOverrideMode,
    TerminalFitOverrideSnapshot, TerminalSessionAuthority,
};

pub(super) fn protocol_get_drivers(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<TerminalFitServiceGetDriversRequest>(payload)?;
    Ok(encode(&TerminalFitServiceGetDriversResponse {
        drivers: authority
            .terminal_drivers()
            .into_iter()
            .map(protocol_driver)
            .collect(),
    }))
}

pub(super) fn protocol_get_overrides(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<TerminalFitServiceGetOverridesRequest>(payload)?;
    Ok(encode(&TerminalFitServiceGetOverridesResponse {
        overrides: authority
            .terminal_fit_overrides()
            .into_iter()
            .map(protocol_override)
            .collect(),
    }))
}

pub(super) async fn protocol_restore(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalFitServiceRestoreRequest>(payload)?;
    let restored = match authority.handle_for_pty(&request.pty_id) {
        Some(handle) => authority.reclaim_desktop(&handle).await.unwrap_or(false),
        None => false,
    };
    Ok(encode(&TerminalFitServiceRestoreResponse { restored }))
}

fn protocol_driver(snapshot: TerminalDriverSnapshot) -> ProtocolDriverSnapshot {
    let (kind, client_id) = match snapshot.driver {
        TerminalDriverState::Desktop => (ProtocolDriverKind::Desktop, None),
        TerminalDriverState::Mobile(client_id) => (ProtocolDriverKind::Mobile, Some(client_id)),
    };
    ProtocolDriverSnapshot {
        pty_id: snapshot.pty_id,
        kind: kind as i32,
        client_id,
    }
}

fn protocol_override(snapshot: TerminalFitOverrideSnapshot) -> ProtocolFitOverride {
    ProtocolFitOverride {
        pty_id: snapshot.pty_id,
        mode: match snapshot.mode {
            TerminalFitOverrideMode::Mobile => ProtocolFitOverrideMode::MobileFit,
            TerminalFitOverrideMode::RemoteDesktop => ProtocolFitOverrideMode::RemoteDesktopFit,
        } as i32,
        cols: u32::from(snapshot.cols),
        rows: u32::from(snapshot.rows),
    }
}

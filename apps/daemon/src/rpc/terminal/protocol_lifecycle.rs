use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    TerminalClose as ProtocolClose, TerminalServiceApproveRequest, TerminalServiceApproveResponse,
    TerminalServiceClearBufferRequest, TerminalServiceClearBufferResponse,
    TerminalServiceCloseTabRequest, TerminalServiceCloseTabResponse, TerminalServiceRenameRequest,
    TerminalServiceRenameResponse, TerminalServiceResolveActiveRequest,
    TerminalServiceResolveActiveResponse, TerminalServiceResolvePaneRequest,
    TerminalServiceResolvePaneResponse, TerminalServiceRestoreDesktopFitRequest,
    TerminalServiceRestoreDesktopFitResponse, TerminalServiceShowRequest,
    TerminalServiceShowResponse, TerminalServiceSplitRequest, TerminalServiceSplitResponse,
    TerminalServiceStopExactRequest, TerminalServiceStopExactResponse, TerminalServiceStopRequest,
    TerminalServiceStopResponse, TerminalServiceUnsubscribeRequest,
    TerminalServiceUnsubscribeResponse, TerminalServiceWaitRequest, TerminalServiceWaitResponse,
    TerminalSplitDirection as ProtocolSplitDirection,
    TerminalSplitTelemetrySource as ProtocolTelemetrySource, TerminalWaitCondition,
    TerminalWaitStatus,
};
use agentstart_protocol::transport::{decode, encode};

use crate::dangerous_approval::{DangerousApprovalAuthority, DangerousApprovalError};
use crate::rpc::protocol_call::status;
use crate::session_tabs::SessionTabsAuthority;
use crate::terminal_session::{TerminalSendRequest, TerminalSessionAuthority, WaitCondition};

use super::protocol::{internal, invalid, nonempty, protocol_summary, required, terminal_status};

pub(super) async fn approve(
    authority: &TerminalSessionAuthority,
    dangerous_approval: &DangerousApprovalAuthority,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceApproveRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    dangerous_approval
        .consume(&format!("terminal.approve:{}", request.terminal))
        .await
        .map_err(dangerous_status)?;
    let result = authority
        .send_guarded(
            TerminalSendRequest {
                claim_viewport: false,
                client: None,
                enter: true,
                input_kind: None,
                interrupt: false,
                require_agent_sendable: false,
                terminal: request.terminal,
                text: Some("y".to_owned()),
                viewport: None,
            },
            principal_id,
        )
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceApproveResponse {
        accepted: result.accepted,
    }))
}

pub(super) async fn clear_buffer(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceClearBufferRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    authority
        .clear(&request.terminal)
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceClearBufferResponse {
        cleared: true,
        handle: request.terminal,
    }))
}

pub(super) async fn close_tab(
    authority: &TerminalSessionAuthority,
    session_tabs: &SessionTabsAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceCloseTabRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let (tab_id, worktree_id, _) = authority
        .identity(&request.terminal)
        .map_err(terminal_status)?;
    session_tabs
        .close_tab(&format!("id:{worktree_id}"), &tab_id)
        .await
        .map_err(|_| internal("Terminal tab close failed"))?;
    Ok(encode(&TerminalServiceCloseTabResponse {
        close: Some(ProtocolClose {
            handle: request.terminal,
            tab_id,
            pty_killed: false,
        }),
    }))
}

pub(super) async fn rename(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceRenameRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let title = nonempty(request.title);
    let renamed = authority
        .rename(&request.terminal, title)
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceRenameResponse {
        handle: renamed.handle,
        tab_id: renamed.tab_id,
        title: renamed.title,
    }))
}

pub(super) fn show(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceShowRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let show = authority.show(&request.terminal).map_err(terminal_status)?;
    Ok(encode(&TerminalServiceShowResponse {
        summary: Some(protocol_summary(show.summary)),
        pane_runtime_id: show.pane_runtime_id,
        renderer_graph_epoch: show.renderer_graph_epoch,
        transport_generation: show.transport_generation,
    }))
}

pub(super) async fn split(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceSplitRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let direction = split_direction(request.direction)?;
    let telemetry_source = telemetry_source(request.telemetry_source)?;
    let split = authority
        .split(
            &request.terminal,
            direction,
            nonempty(request.command),
            request.env.into_iter().collect(),
            telemetry_source,
        )
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceSplitResponse {
        handle: split.handle,
        pane_runtime_id: split.pane_runtime_id,
        tab_id: split.tab_id,
    }))
}

pub(super) async fn stop(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceStopRequest>(payload)?;
    required(&request.worktree, "Terminal worktree selector")?;
    let stopped = authority
        .stop(&request.worktree)
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceStopResponse {
        stopped: u32::try_from(stopped).unwrap_or(u32::MAX),
    }))
}

pub(super) async fn stop_exact(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceStopExactRequest>(payload)?;
    required(&request.worktree, "Terminal worktree selector")?;
    if request.expected_pty_ids.is_empty() {
        return Err(invalid("Terminal expected PTY IDs are required"));
    }
    let result = authority
        .stop_exact(
            &request.worktree,
            request.expected_pty_ids,
            request.target_only,
        )
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceStopExactResponse {
        stopped_pty_ids: result.stopped_pty_ids,
        stopped: u32::try_from(result.stopped).unwrap_or(u32::MAX),
        live_pty_ids: result.live_pty_ids,
        post_stop_verified: result.post_stop_verified,
        post_stop_failure: result.post_stop_failure.map(str::to_owned),
        remaining_live_pty_ids: result.remaining_live_pty_ids,
    }))
}

pub(super) async fn resolve_active(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceResolveActiveRequest>(payload)?;
    let handle = authority
        .resolve_active(nonempty(request.worktree).as_deref())
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceResolveActiveResponse { handle }))
}

pub(super) fn resolve_pane(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceResolvePaneRequest>(payload)?;
    required(&request.pane_key, "Terminal pane key")?;
    let pane = authority
        .resolve_pane(&request.pane_key)
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceResolvePaneResponse {
        handle: pane.handle,
        leaf_id: pane.leaf_id,
        pty_id: pane.pty_id,
        tab_id: pane.tab_id,
    }))
}

pub(super) async fn wait(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceWaitRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let condition = match TerminalWaitCondition::try_from(request.condition) {
        Ok(TerminalWaitCondition::Exit) => WaitCondition::Exit,
        Ok(TerminalWaitCondition::TuiIdle) => WaitCondition::TuiIdle,
        Ok(TerminalWaitCondition::Unspecified) | Err(_) => {
            return Err(invalid("Terminal wait condition is invalid"));
        }
    };
    let timeout = wait_timeout(condition, request.timeout_ms);
    let result = authority
        .wait(&request.terminal, condition, timeout)
        .await
        .map_err(terminal_status)?;
    let status = match result.status {
        "running" => TerminalWaitStatus::Running,
        "exited" => TerminalWaitStatus::Exited,
        _ => return Err(internal("Terminal wait status is invalid")),
    };
    Ok(encode(&TerminalServiceWaitResponse {
        handle: result.handle,
        condition: request.condition,
        satisfied: result.satisfied,
        status: status as i32,
        exit_code: result.exit_code,
        blocked_reason: result.blocked_reason.map(str::to_owned),
    }))
}

pub(super) async fn restore_desktop_fit(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceRestoreDesktopFitRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let restored = authority
        .reclaim_desktop(&request.terminal)
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceRestoreDesktopFitResponse {
        restored,
    }))
}

pub(super) fn unsubscribe(payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceUnsubscribeRequest>(payload)?;
    required(&request.subscription_id, "Terminal subscription ID")?;
    if let Some(client) = request.client {
        required(&client.id, "Terminal client ID")?;
    }
    // Why: binary terminal streams own their lifecycle and are torn down by the
    // multiplex control frame; this leaf stays idempotent for clients closing a
    // legacy subscription during reconnect cleanup.
    Ok(encode(&TerminalServiceUnsubscribeResponse {
        unsubscribed: true,
    }))
}

fn split_direction(value: i32) -> Result<&'static str, Status> {
    match ProtocolSplitDirection::try_from(value) {
        Ok(ProtocolSplitDirection::Unspecified | ProtocolSplitDirection::Horizontal) => {
            Ok("horizontal")
        }
        Ok(ProtocolSplitDirection::Vertical) => Ok("vertical"),
        Err(_) => Err(invalid("Terminal split direction is invalid")),
    }
}

fn telemetry_source(value: i32) -> Result<Option<String>, Status> {
    match ProtocolTelemetrySource::try_from(value) {
        Ok(ProtocolTelemetrySource::Unspecified) => Ok(None),
        Ok(ProtocolTelemetrySource::ContextualTour) => Ok(Some("contextual_tour".to_owned())),
        Ok(ProtocolTelemetrySource::Keyboard) => Ok(Some("keyboard".to_owned())),
        Ok(ProtocolTelemetrySource::ContextMenu) => Ok(Some("context_menu".to_owned())),
        Ok(ProtocolTelemetrySource::Command) => Ok(Some("command".to_owned())),
        Ok(ProtocolTelemetrySource::Unknown) => Ok(Some("unknown".to_owned())),
        Err(_) => Err(invalid("Terminal split telemetry source is invalid")),
    }
}

fn wait_timeout(condition: WaitCondition, timeout_ms: Option<u64>) -> Option<std::time::Duration> {
    timeout_ms
        .map(std::time::Duration::from_millis)
        .or_else(|| {
            (condition == WaitCondition::TuiIdle).then(|| std::time::Duration::from_secs(5 * 60))
        })
}

fn dangerous_status(error: DangerousApprovalError) -> Status {
    let code = match &error {
        DangerousApprovalError::Required | DangerousApprovalError::NotConfigured => {
            StatusCode::FailedPrecondition
        }
        DangerousApprovalError::OperationInvalid
        | DangerousApprovalError::ChallengeInvalid
        | DangerousApprovalError::AssertionInvalid
        | DangerousApprovalError::RegistrationInvalid => StatusCode::InvalidArgument,
        DangerousApprovalError::Ceremony(_)
        | DangerousApprovalError::Clock(_)
        | DangerousApprovalError::Random(_)
        | DangerousApprovalError::Store(_) => StatusCode::Internal,
    };
    status(code, &error.to_string())
}

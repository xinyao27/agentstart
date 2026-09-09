use yiru_protocol::protocol::v1::Status;
use yiru_protocol::runtime::v1::{
    TerminalAgentStatusValue, TerminalManagedSession as ProtocolManagedSession,
    TerminalManagedSessionState, TerminalManagedShellState, TerminalServiceGetAgentStatusRequest,
    TerminalServiceGetAgentStatusResponse, TerminalServiceInspectProcessRequest,
    TerminalServiceInspectProcessResponse, TerminalServiceIsRunningAgentRequest,
    TerminalServiceIsRunningAgentResponse, TerminalServiceKillAllManagedRequest,
    TerminalServiceKillAllManagedResponse, TerminalServiceKillManagedRequest,
    TerminalServiceKillManagedResponse, TerminalServiceListManagedSessionsRequest,
    TerminalServiceListManagedSessionsResponse, TerminalServiceRestartManagedRequest,
    TerminalServiceRestartManagedResponse,
};
use yiru_protocol::transport::{decode, encode};

use crate::terminal_session::{TerminalManagementSession, TerminalSessionAuthority};

use super::protocol::{internal, required, terminal_status};

pub(super) async fn inspect_process(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceInspectProcessRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let inspection = authority.inspect_process(&request.terminal).await;
    Ok(encode(&TerminalServiceInspectProcessResponse {
        foreground_process: inspection.foreground_process,
        has_child_processes: inspection.has_child_processes,
    }))
}

pub(super) fn is_running_agent(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceIsRunningAgentRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let state = authority
        .agent_status(&request.terminal)
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceIsRunningAgentResponse {
        is_running_agent: state.is_running_agent,
    }))
}

pub(super) fn get_agent_status(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceGetAgentStatusRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let state = authority
        .agent_status(&request.terminal)
        .map_err(terminal_status)?;
    let status = match state.status {
        None => TerminalAgentStatusValue::Unspecified,
        Some("working") => TerminalAgentStatusValue::Working,
        Some("permission") => TerminalAgentStatusValue::Permission,
        Some("idle") => TerminalAgentStatusValue::Idle,
        Some(_) => return Err(internal("Terminal agent status is invalid")),
    };
    Ok(encode(&TerminalServiceGetAgentStatusResponse {
        handle: state.handle,
        is_running_agent: state.is_running_agent,
        status: status as i32,
    }))
}

pub(super) fn list_managed_sessions(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<TerminalServiceListManagedSessionsRequest>(payload)?;
    let sessions = authority
        .management_sessions()
        .into_iter()
        .map(managed_session)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(encode(&TerminalServiceListManagedSessionsResponse {
        degraded: false,
        sessions,
    }))
}

pub(super) async fn kill_all_managed(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<TerminalServiceKillAllManagedRequest>(payload)?;
    let result = authority.kill_all().await.map_err(terminal_status)?;
    Ok(encode(&TerminalServiceKillAllManagedResponse {
        killed_count: u32::try_from(result.killed_count).unwrap_or(u32::MAX),
        remaining_count: u32::try_from(result.remaining_count).unwrap_or(u32::MAX),
        killed_session_ids: result.killed_session_ids,
    }))
}

pub(super) async fn kill_managed(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceKillManagedRequest>(payload)?;
    required(&request.session_id, "Terminal session ID")?;
    let success = authority
        .kill_one(&request.session_id)
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceKillManagedResponse { success }))
}

pub(super) async fn restart_managed(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<TerminalServiceRestartManagedRequest>(payload)?;
    let result = authority.kill_all().await.map_err(terminal_status)?;
    Ok(encode(&TerminalServiceRestartManagedResponse {
        success: result.remaining_count == 0,
    }))
}

fn managed_session(session: TerminalManagementSession) -> Result<ProtocolManagedSession, Status> {
    let state = match session.state {
        "created" => TerminalManagedSessionState::Created,
        "spawning" => TerminalManagedSessionState::Spawning,
        "running" => TerminalManagedSessionState::Running,
        "exiting" => TerminalManagedSessionState::Exiting,
        "exited" => TerminalManagedSessionState::Exited,
        _ => return Err(internal("Terminal managed session state is invalid")),
    };
    let shell_state = match session.shell_state {
        "pending" => TerminalManagedShellState::Pending,
        "ready" => TerminalManagedShellState::Ready,
        "timed_out" => TerminalManagedShellState::TimedOut,
        "unsupported" => TerminalManagedShellState::Unsupported,
        _ => return Err(internal("Terminal managed shell state is invalid")),
    };
    Ok(ProtocolManagedSession {
        session_id: session.session_id,
        state: state as i32,
        shell_state: shell_state as i32,
        is_alive: session.is_alive,
        pid: session.pid,
        cwd: session.cwd,
        cols: u32::from(session.cols),
        rows: u32::from(session.rows),
        created_at: session.created_at,
        protocol_version: u32::from(session.protocol_version),
    })
}

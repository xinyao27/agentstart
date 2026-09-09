use serde_json::Value;
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    AgentSession as ProtocolAgentSession, AgentSessionPhase as ProtocolAgentSessionPhase,
    AgentSessionProvider as ProtocolAgentSessionProvider, AgentSessionServiceFollowupRequest,
    AgentSessionServiceFollowupResponse, AgentSessionServiceListRequest,
    AgentSessionServiceListResponse, AgentSessionServiceProvidersRequest,
    AgentSessionServiceProvidersResponse, AgentSessionServiceStartRequest,
    AgentSessionServiceStartResponse, AgentSessionServiceStopRequest,
    AgentSessionServiceStopResponse, AgentSessionStatus as ProtocolAgentSessionStatus,
};
use yiru_protocol::transport::{decode, encode};

use crate::terminal_session::TerminalPresentation;

use super::{
    AgentSessionFollowupRequest, AgentSessionLaunchError, AgentSessionLaunchRequest,
    AgentSessionRpc,
};

// Why: mirrors the legacy agentSession.start/followup input caps in this file's own
// parse_start/parse_followup so a protobuf caller cannot bypass the size limits the JSON
// transport already enforces.
const MAX_PROMPT_UTF16_LENGTH: usize = 128_000;
const MAX_TITLE_UTF16_LENGTH: usize = 256;

pub(super) async fn providers(rpc: &AgentSessionRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<AgentSessionServiceProvidersRequest>(payload)?;
    let host_id = nonempty(request.host_id).unwrap_or_else(|| "local".to_owned());
    let response = rpc
        .authority
        .providers(&host_id)
        .await
        .map_err(agent_session_status)?;
    let providers = required_array(&response, "providers")?
        .iter()
        .map(protocol_provider)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(encode(&AgentSessionServiceProvidersResponse { providers }))
}

pub(super) async fn list(rpc: &AgentSessionRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<AgentSessionServiceListRequest>(payload)?;
    let worktree_id = nonempty(request.worktree_id);
    let response = rpc
        .authority
        .list(worktree_id.as_deref())
        .await
        .map_err(agent_session_status)?;
    let sessions = required_array(&response, "sessions")?
        .iter()
        .map(agent_session_message)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(encode(&AgentSessionServiceListResponse { sessions }))
}

pub(super) async fn start(rpc: &AgentSessionRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<AgentSessionServiceStartRequest>(payload)?;
    let agent = required(&request.agent, "agent")?.to_owned();
    let worktree_id = required(&request.worktree_id, "worktree_id")?.to_owned();
    let prompt = within_limit(request.prompt, MAX_PROMPT_UTF16_LENGTH, "prompt")?;
    let title = within_limit(request.title, MAX_TITLE_UTF16_LENGTH, "title")?;
    let launch = rpc
        .authority
        .launch(AgentSessionLaunchRequest {
            agent,
            presentation: TerminalPresentation::Visible,
            prompt,
            title,
            worktree_id,
        })
        .await
        .map_err(agent_launch_status)?;
    Ok(encode(&AgentSessionServiceStartResponse {
        session: Some(agent_session_message(&launch.session)?),
    }))
}

pub(super) async fn followup(
    rpc: &AgentSessionRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<AgentSessionServiceFollowupRequest>(payload)?;
    let session_id = required(&request.session_id, "session_id")?.to_owned();
    let prompt = required(&request.prompt, "prompt")?.to_owned();
    if prompt.encode_utf16().count() > MAX_PROMPT_UTF16_LENGTH {
        return Err(invalid("prompt is too long"));
    }
    let result = rpc
        .authority
        .send_followup(
            AgentSessionFollowupRequest { session_id, prompt },
            principal_id,
        )
        .await
        .map_err(agent_session_status)?;
    Ok(encode(&AgentSessionServiceFollowupResponse {
        accepted: result.accepted,
        session: Some(agent_session_message(&result.session)?),
    }))
}

pub(super) async fn stop(rpc: &AgentSessionRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<AgentSessionServiceStopRequest>(payload)?;
    let session_id = required(&request.session_id, "session_id")?;
    let response = rpc
        .authority
        .stop(session_id)
        .await
        .map_err(agent_session_status)?;
    Ok(encode(&AgentSessionServiceStopResponse {
        session: Some(agent_session_message(field(&response, "session")?)?),
    }))
}

fn protocol_provider(value: &Value) -> Result<ProtocolAgentSessionProvider, Status> {
    Ok(ProtocolAgentSessionProvider {
        id: required_str(value, "id")?.to_owned(),
        label: required_str(value, "label")?.to_owned(),
        available: required_bool(value, "available")?,
        executable: optional_str(value, "executable"),
        resumable: required_bool(value, "resumable")?,
    })
}

// Why: the internal session record stays the JSON Value shape session_value()/row_value()
// already produce (the same shape the legacy agentSession.* JSON responses send today), so this
// is the single place that shape gets translated into the wire message.
fn agent_session_message(value: &Value) -> Result<ProtocolAgentSession, Status> {
    Ok(ProtocolAgentSession {
        id: required_str(value, "id")?.to_owned(),
        agent: required_str(value, "agent")?.to_owned(),
        worktree_id: required_str(value, "worktreeId")?.to_owned(),
        terminal_handle: required_str(value, "terminalHandle")?.to_owned(),
        title: optional_str(value, "title"),
        phase: protocol_phase(required_str(value, "phase")?)? as i32,
        status: protocol_status(required_str(value, "status")?)? as i32,
        created_at: required_i64(value, "createdAt")?,
        updated_at: required_i64(value, "updatedAt")?,
        completed_at: optional_i64(value, "completedAt"),
    })
}

fn protocol_phase(value: &str) -> Result<ProtocolAgentSessionPhase, Status> {
    match value {
        "thinking" => Ok(ProtocolAgentSessionPhase::Thinking),
        "waiting-decision" => Ok(ProtocolAgentSessionPhase::WaitingDecision),
        "complete" => Ok(ProtocolAgentSessionPhase::Complete),
        _ => Err(internal("phase")),
    }
}

fn protocol_status(value: &str) -> Result<ProtocolAgentSessionStatus, Status> {
    match value {
        "running" => Ok(ProtocolAgentSessionStatus::Running),
        "complete" => Ok(ProtocolAgentSessionStatus::Complete),
        "interrupted" => Ok(ProtocolAgentSessionStatus::Interrupted),
        _ => Err(internal("status")),
    }
}

// Why: agentSession.list/providers/stop/followup return a String error today (see this file's
// dispatch(), which folds every one of them into a 400 BAD_REQUEST); "agent_session_not_found" is
// the one sentinel worth a distinct status code, everything else is an internal-layer failure.
fn agent_session_status(error: String) -> Status {
    if error == "agent_session_not_found" {
        status(StatusCode::NotFound, &error)
    } else {
        status(StatusCode::Internal, &error)
    }
}

fn agent_launch_status(error: AgentSessionLaunchError) -> Status {
    let code = match &error {
        AgentSessionLaunchError::UnknownProvider => StatusCode::InvalidArgument,
        AgentSessionLaunchError::ProviderUnavailable(_) => StatusCode::FailedPrecondition,
        AgentSessionLaunchError::TerminalMissing
        | AgentSessionLaunchError::InvalidSessionRow(_)
        | AgentSessionLaunchError::Store(_) => StatusCode::Internal,
        AgentSessionLaunchError::Filesystem(_)
        | AgentSessionLaunchError::Host(_)
        | AgentSessionLaunchError::Worktree(_) => StatusCode::InvalidArgument,
        AgentSessionLaunchError::Terminal(_) => StatusCode::Internal,
    };
    status(code, &error.to_string())
}

fn required<'a>(value: &'a str, field: &'static str) -> Result<&'a str, Status> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(invalid(&format!("{field} is required")))
    } else {
        Ok(trimmed)
    }
}

fn within_limit(
    value: Option<String>,
    limit: usize,
    field: &'static str,
) -> Result<Option<String>, Status> {
    match value {
        Some(value) if value.encode_utf16().count() > limit => {
            Err(invalid(&format!("{field} is too long")))
        }
        other => Ok(other),
    }
}

fn nonempty(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.is_empty())
}

fn field<'a>(value: &'a Value, name: &str) -> Result<&'a Value, Status> {
    value.get(name).ok_or_else(|| internal(name))
}

fn required_array<'a>(value: &'a Value, field: &str) -> Result<&'a Vec<Value>, Status> {
    value
        .get(field)
        .and_then(Value::as_array)
        .ok_or_else(|| internal(field))
}

fn required_str<'a>(value: &'a Value, field: &str) -> Result<&'a str, Status> {
    value
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| internal(field))
}

fn required_bool(value: &Value, field: &str) -> Result<bool, Status> {
    value
        .get(field)
        .and_then(Value::as_bool)
        .ok_or_else(|| internal(field))
}

fn required_i64(value: &Value, field: &str) -> Result<i64, Status> {
    value
        .get(field)
        .and_then(Value::as_i64)
        .ok_or_else(|| internal(field))
}

fn optional_str(value: &Value, field: &str) -> Option<String> {
    value.get(field).and_then(Value::as_str).map(str::to_owned)
}

fn optional_i64(value: &Value, field: &str) -> Option<i64> {
    value.get(field).and_then(Value::as_i64)
}

fn internal(field: &str) -> Status {
    status(
        StatusCode::Internal,
        &format!("agent_session_field_missing:{field}"),
    )
}

fn invalid(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

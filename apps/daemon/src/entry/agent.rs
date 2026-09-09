use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::time::Duration;

use serde_json::{Value, json};
use thiserror::Error;
use yiru_protocol::method_metadata::UnaryMethod;
use yiru_protocol::method_metadata::methods::{
    YiruRuntimeV1AgentSessionServiceFollowup as FollowupMethod,
    YiruRuntimeV1AgentSessionServiceList as ListMethod,
    YiruRuntimeV1AgentSessionServiceProviders as ProvidersMethod,
    YiruRuntimeV1AgentSessionServiceStart as StartMethod,
    YiruRuntimeV1AgentSessionServiceStop as StopMethod,
};
use yiru_protocol::runtime::v1::{
    AgentSession, AgentSessionPhase, AgentSessionProvider, AgentSessionServiceFollowupRequest,
    AgentSessionServiceListRequest, AgentSessionServiceProvidersRequest,
    AgentSessionServiceStartRequest, AgentSessionServiceStopRequest, AgentSessionStatus,
};

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

const CALL_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Error)]
pub(super) enum AgentCommandError {
    #[error("agent_action_unsupported")]
    ActionUnsupported,
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error("agent_response_invalid")]
    InvalidResponse,
    #[error("host_id_invalid")]
    InvalidHostId,
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("cli_flag_required:{0}")]
    MissingFlag(&'static str),
    #[error(transparent)]
    Path(#[from] crate::paths::PathResolutionError),
    #[error(transparent)]
    Peer(ProtocolPeerError),
    #[error("daemon_not_ready")]
    RuntimeNotReady,
    #[error("daemon_not_running")]
    RuntimeNotRunning,
    #[error("unknown_agent")]
    UnknownAgent,
}

pub(super) async fn run(args: &[OsString]) -> Result<(), AgentCommandError> {
    let user_data_path = read_flag(args, "--daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(AgentCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(AgentCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(AgentCommandError::RuntimeNotReady)?;
    let expected_runtime_id = read_flag(args, "--runtime")
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty());
    let peer = LocalProtocolClient::connect(
        &bootstrap.endpoint,
        &bootstrap.auth_token,
        protocol_version,
        &bootstrap.runtime_id,
        expected_runtime_id,
    )
    .await
    .map_err(map_peer_error)?;
    let result = run_action(&peer, args).await;
    peer.close().await;
    result
}

async fn run_action(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), AgentCommandError> {
    match args.first().and_then(|value| value.to_str()) {
        Some("providers") => providers(peer, args).await,
        Some("list") => list(peer, args).await,
        Some("start") => start(peer, args).await,
        Some("followup") => followup(peer, args).await,
        Some("stop") => stop(peer, args).await,
        Some(_) | None => Err(AgentCommandError::ActionUnsupported),
    }
}

async fn providers(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), AgentCommandError> {
    let response = unary::<ProvidersMethod>(
        peer,
        &AgentSessionServiceProvidersRequest {
            host_id: optional_host(args)?,
        },
    )
    .await?;
    if has_flag(args, "--json") {
        let output = json!({
            "providers": response.providers.iter().map(provider_json).collect::<Vec<_>>(),
        });
        println!("{}", serde_json::to_string(&output)?);
    } else {
        let lines = response
            .providers
            .iter()
            .map(|provider| {
                format!(
                    "{}\t{}\t{}",
                    if provider.available { "✓" } else { "·" },
                    provider.id,
                    provider.label
                )
            })
            .collect::<Vec<_>>();
        println!("{}", lines.join("\n"));
    }
    Ok(())
}

async fn list(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), AgentCommandError> {
    let response = unary::<ListMethod>(
        peer,
        &AgentSessionServiceListRequest {
            worktree_id: optional_flag(args, "--worktree"),
        },
    )
    .await?;
    if has_flag(args, "--json") {
        let sessions = response
            .sessions
            .iter()
            .map(session_json)
            .collect::<Result<Vec<_>, _>>()?;
        println!(
            "{}",
            serde_json::to_string(&json!({ "sessions": sessions }))?
        );
    } else {
        let lines = response
            .sessions
            .iter()
            .map(|session| {
                Ok(format!(
                    "{}\t{}\t{}\t{}",
                    session.id,
                    session.agent,
                    phase_str(session.phase)?,
                    status_str(session.status)?
                ))
            })
            .collect::<Result<Vec<_>, AgentCommandError>>()?;
        println!(
            "{}",
            if lines.is_empty() {
                "No agent sessions".to_owned()
            } else {
                lines.join("\n")
            }
        );
    }
    Ok(())
}

async fn start(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), AgentCommandError> {
    let agent = required_flag(args, "--agent")?;
    if !crate::settings::is_tui_agent(&agent) {
        return Err(AgentCommandError::UnknownAgent);
    }
    let response = unary::<StartMethod>(
        peer,
        &AgentSessionServiceStartRequest {
            agent,
            worktree_id: required_flag(args, "--worktree")?,
            prompt: optional_flag(args, "--prompt"),
            title: optional_flag(args, "--title"),
        },
    )
    .await?;
    let session = response.session.ok_or(AgentCommandError::InvalidResponse)?;
    let session_id = session.id.clone();
    write_output(
        args,
        json!({ "session": session_json(&session)? }),
        format!("Started agent session {session_id}"),
    )
}

async fn followup(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), AgentCommandError> {
    let response = unary::<FollowupMethod>(
        peer,
        &AgentSessionServiceFollowupRequest {
            session_id: required_flag(args, "--session")?,
            prompt: required_flag(args, "--prompt")?,
        },
    )
    .await?;
    let session = response.session.ok_or(AgentCommandError::InvalidResponse)?;
    let message = if response.accepted {
        "Follow-up sent"
    } else {
        "Follow-up refused"
    };
    write_output(
        args,
        json!({ "accepted": response.accepted, "session": session_json(&session)? }),
        message.to_owned(),
    )
}

async fn stop(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), AgentCommandError> {
    let response = unary::<StopMethod>(
        peer,
        &AgentSessionServiceStopRequest {
            session_id: required_flag(args, "--session")?,
        },
    )
    .await?;
    let session = response.session.ok_or(AgentCommandError::InvalidResponse)?;
    write_output(
        args,
        json!({ "session": session_json(&session)? }),
        "Agent session stopped".to_owned(),
    )
}

fn provider_json(provider: &AgentSessionProvider) -> Value {
    json!({
        "available": provider.available,
        "executable": provider.executable,
        "id": provider.id,
        "label": provider.label,
        "resumable": provider.resumable,
    })
}

fn session_json(session: &AgentSession) -> Result<Value, AgentCommandError> {
    Ok(json!({
        "agent": session.agent,
        "completedAt": session.completed_at,
        "createdAt": session.created_at,
        "id": session.id,
        "phase": phase_str(session.phase)?,
        "status": status_str(session.status)?,
        "terminalHandle": session.terminal_handle,
        "title": session.title,
        "updatedAt": session.updated_at,
        "worktreeId": session.worktree_id,
    }))
}

fn phase_str(value: i32) -> Result<&'static str, AgentCommandError> {
    match AgentSessionPhase::try_from(value) {
        Ok(AgentSessionPhase::Thinking) => Ok("thinking"),
        Ok(AgentSessionPhase::WaitingDecision) => Ok("waiting-decision"),
        Ok(AgentSessionPhase::Complete) => Ok("complete"),
        Ok(AgentSessionPhase::Unspecified) | Err(_) => Err(AgentCommandError::InvalidResponse),
    }
}

fn status_str(value: i32) -> Result<&'static str, AgentCommandError> {
    match AgentSessionStatus::try_from(value) {
        Ok(AgentSessionStatus::Running) => Ok("running"),
        Ok(AgentSessionStatus::Complete) => Ok("complete"),
        Ok(AgentSessionStatus::Interrupted) => Ok("interrupted"),
        Ok(AgentSessionStatus::Unspecified) | Err(_) => Err(AgentCommandError::InvalidResponse),
    }
}

async fn unary<Method>(
    peer: &LocalProtocolClient,
    request: &Method::Request,
) -> Result<Method::Response, AgentCommandError>
where
    Method: UnaryMethod,
{
    peer.unary::<Method>(request, CALL_TIMEOUT)
        .await
        .map_err(map_peer_error)
}

fn write_output(args: &[OsString], output: Value, text: String) -> Result<(), AgentCommandError> {
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!("{text}");
    }
    Ok(())
}

fn map_peer_error(error: ProtocolPeerError) -> AgentCommandError {
    AgentCommandError::Peer(error)
}

fn required_flag(args: &[OsString], name: &'static str) -> Result<String, AgentCommandError> {
    optional_flag(args, name).ok_or(AgentCommandError::MissingFlag(name))
}

fn optional_flag(args: &[OsString], name: &str) -> Option<String> {
    read_flag(args, name)
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

// Why: mirrors entry/repo.rs's optional_host — the same "local | ssh:<id> | wsl:<id>" host-id
// shape agentSession.providers accepts, checked client-side so a malformed --host fails fast.
fn optional_host(args: &[OsString]) -> Result<Option<String>, AgentCommandError> {
    let Some(value) = read_flag(args, "--host").and_then(OsStr::to_str) else {
        return Ok(None);
    };
    if value == "local" || value.starts_with("ssh:") || value.starts_with("wsl:") {
        Ok(Some(value.to_owned()))
    } else {
        Err(AgentCommandError::InvalidHostId)
    }
}

fn read_flag<'a>(args: &'a [OsString], name: &str) -> Option<&'a OsStr> {
    let index = args.iter().position(|argument| argument == name)?;
    let value = args.get(index + 1)?;
    (!value.to_string_lossy().starts_with("--")).then_some(value)
}

fn has_flag(args: &[OsString], name: &str) -> bool {
    args.iter().any(|argument| argument == name)
}

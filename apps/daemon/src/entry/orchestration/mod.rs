mod input;
mod output;
mod request;

use std::ffi::OsString;
use std::path::PathBuf;
use std::time::Duration;

use agentstart_protocol::method_metadata::UnaryMethod;
use agentstart_protocol::method_metadata::methods::AgentStartRuntimeV1TerminalServiceResolvePane as ResolvePaneMethod;
use agentstart_protocol::protocol::v1::StatusCode;
use agentstart_protocol::runtime::v1::TerminalServiceResolvePaneRequest;
use thiserror::Error;

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

use input::Args;

const CALL_TIMEOUT: Duration = Duration::from_secs(30);
/// Why: `check --wait` and `ask` hold the call open server-side for as long as their own
/// `timeout_ms`, so the wire deadline has to clear that rather than race it. Matches the
/// workbench client's `deadlinePadded`.
const BLOCKING_PADDING: Duration = Duration::from_secs(5);

#[derive(Debug, Error)]
pub(super) enum OrchestrationCommandError {
    #[error("orchestration_action_unsupported:{0}")]
    ActionUnsupported(String),
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error("cli_identity_required")]
    IdentityRequired,
    #[error("cli_flag_invalid:{0}")]
    InvalidFlag(&'static str),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("cli_flag_required:{0}")]
    MissingFlag(&'static str),
    #[error(transparent)]
    Path(#[from] crate::paths::PathResolutionError),
    #[error(transparent)]
    Peer(ProtocolPeerError),
    #[error("orchestration_request_failed:{0}")]
    Request(String),
    #[error("daemon_not_ready")]
    RuntimeNotReady,
    #[error("daemon_not_running")]
    RuntimeNotRunning,
    #[error("orchestration_cli_argument_invalid")]
    Unicode,
}

pub(super) async fn run(args: &[OsString]) -> Result<(), OrchestrationCommandError> {
    let args = Args::new(args)?;
    let command = args.command_path();
    if command.is_empty() || args.has("help") {
        output::print_usage();
        return Ok(());
    }
    let peer = connect(&args).await?;
    let result = dispatch(&peer, &args, &command).await;
    peer.close().await;
    result
}

async fn connect(args: &Args) -> Result<LocalProtocolClient, OrchestrationCommandError> {
    let user_data_path = args
        .read("daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(OrchestrationCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(OrchestrationCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(OrchestrationCommandError::RuntimeNotReady)?;
    let expected_runtime_id = args.read("runtime").filter(|value| !value.is_empty());
    LocalProtocolClient::connect(
        &bootstrap.endpoint,
        &bootstrap.auth_token,
        protocol_version,
        &bootstrap.runtime_id,
        expected_runtime_id.as_deref(),
    )
    .await
    .map_err(map_peer_error)
}

async fn dispatch(
    peer: &LocalProtocolClient,
    args: &Args,
    command: &str,
) -> Result<(), OrchestrationCommandError> {
    match command {
        "run create" => request::run_create(peer, args).await,
        "run use" => request::run_use(peer, args).await,
        "run current" => request::run_current(peer, args).await,
        "run list" => request::run_list(peer, args).await,
        "run show" => request::run_show(peer, args).await,
        "task create" => request::task_create(peer, args).await,
        "task list" => request::task_list(peer, args).await,
        "task update" => request::task_update(peer, args).await,
        "dispatch" => request::dispatch(peer, args).await,
        "dispatch show" => request::dispatch_show(peer, args).await,
        "worker start" => request::worker_start(peer, args).await,
        "worker show" => request::worker_show(peer, args).await,
        "worker read" => request::worker_read(peer, args).await,
        "worker stop" => request::worker_stop(peer, args).await,
        "worker abandon" => request::worker_abandon(peer, args).await,
        "send" => request::send(peer, args).await,
        "check" => request::check(peer, args).await,
        "reply" => request::reply(peer, args).await,
        "inbox" => request::inbox(peer, args).await,
        "ask" => request::ask(peer, args).await,
        "gate create" => request::gate_create(peer, args).await,
        "gate resolve" => request::gate_resolve(peer, args).await,
        "gate list" => request::gate_list(peer, args).await,
        other => Err(OrchestrationCommandError::ActionUnsupported(
            other.to_owned(),
        )),
    }
}

async fn unary<Method>(
    peer: &LocalProtocolClient,
    request: &Method::Request,
) -> Result<Method::Response, OrchestrationCommandError>
where
    Method: UnaryMethod,
{
    unary_with_timeout::<Method>(peer, request, CALL_TIMEOUT).await
}

async fn unary_with_timeout<Method>(
    peer: &LocalProtocolClient,
    request: &Method::Request,
    timeout: Duration,
) -> Result<Method::Response, OrchestrationCommandError>
where
    Method: UnaryMethod,
{
    peer.unary::<Method>(request, timeout)
        .await
        .map_err(map_peer_error)
}

/// Why: orchestration identifies a caller by terminal handle, but a terminal only exports its
/// pane key. `TerminalService/ResolvePane` is the daemon's own handle-for-pane lookup, so a
/// command run inside an AgentStart terminal can identify itself without any new env or field.
async fn identity(
    peer: &LocalProtocolClient,
    args: &Args,
) -> Result<String, OrchestrationCommandError> {
    if let Some(handle) = args.read("from").filter(|value| !value.is_empty()) {
        return Ok(handle);
    }
    let pane_key = std::env::var("AGENTSTART_PANE_KEY")
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or(OrchestrationCommandError::IdentityRequired)?;
    let response =
        unary::<ResolvePaneMethod>(peer, &TerminalServiceResolvePaneRequest { pane_key }).await?;
    if response.handle.is_empty() {
        return Err(OrchestrationCommandError::IdentityRequired);
    }
    Ok(response.handle)
}

/// The wire deadline for a call whose server-side handler blocks for `timeout_ms`.
fn blocking_deadline(timeout_ms: i64) -> Duration {
    let clamped = timeout_ms.clamp(0, request::MAX_TIMEOUT_MS);
    let millis = u64::try_from(clamped).unwrap_or(0);
    Duration::from_millis(millis).saturating_add(BLOCKING_PADDING)
}

fn map_peer_error(error: ProtocolPeerError) -> OrchestrationCommandError {
    let Some(status) = error.remote_status() else {
        return OrchestrationCommandError::Peer(error);
    };
    let code = StatusCode::try_from(status.code)
        .map(|value| value.as_str_name())
        .unwrap_or("STATUS_CODE_UNSPECIFIED");
    OrchestrationCommandError::Request(format!("{code}:{}", status.message))
}

mod exec;
mod help;
mod input;
mod output;
mod request;

use std::ffi::OsString;
use std::path::PathBuf;
use std::time::Duration;

use thiserror::Error;
use yiru_protocol::method_metadata::methods::{
    YiruRuntimeV1BrowserHostServiceDownload as DownloadMethod,
    YiruRuntimeV1BrowserHostServiceExecute as ExecuteMethod,
};
use yiru_protocol::runtime::v1::download_response::Event;

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const CLOSE_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Error)]
pub(super) enum BrowserCommandError {
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error("browser_command_unsupported:{0}")]
    CommandUnsupported(String),
    #[error("cli_flag_invalid:{0}")]
    InvalidFlag(String),
    #[error("browser_response_invalid")]
    InvalidResponse,
    #[error("{0}")]
    Exec(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("cli_flag_required:{0}")]
    MissingFlag(String),
    #[error(transparent)]
    Path(#[from] crate::paths::PathResolutionError),
    #[error(transparent)]
    Peer(#[from] ProtocolPeerError),
    #[error("browser_profile_create_rejected")]
    ProfileCreateRejected,
    #[error("daemon_not_ready")]
    RuntimeNotReady,
    #[error("daemon_not_running")]
    RuntimeNotRunning,
    #[error("browser_cli_argument_invalid")]
    Unicode,
}

pub(super) fn is_command(args: &[OsString]) -> bool {
    args.first()
        .and_then(|value| value.to_str())
        .is_some_and(help::is_root)
}

pub(super) async fn run(args: &[OsString]) -> Result<(), BrowserCommandError> {
    let args = input::BrowserArgs::new(args)?;
    let command = args.command_path();
    if args.has("help") || args.has_short_help() {
        help::print(&command)?;
        return Ok(());
    }
    if !help::is_command(&command) {
        return Err(BrowserCommandError::CommandUnsupported(command));
    }
    let peer = connect(&args).await?;
    let result = if command == "download" {
        run_download(&peer, &args).await
    } else {
        run_execute(&peer, &args, &command).await
    };
    let _ = tokio::time::timeout(CLOSE_TIMEOUT, peer.close()).await;
    result
}

async fn connect(args: &input::BrowserArgs) -> Result<LocalProtocolClient, BrowserCommandError> {
    let user_data_path = args
        .read("daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(BrowserCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(BrowserCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(BrowserCommandError::RuntimeNotReady)?;
    LocalProtocolClient::connect(
        &bootstrap.endpoint,
        &bootstrap.auth_token,
        protocol_version,
        &bootstrap.runtime_id,
        args.read("runtime").filter(|value| !value.is_empty()),
    )
    .await
    .map_err(BrowserCommandError::Peer)
}

async fn run_execute(
    peer: &LocalProtocolClient,
    args: &input::BrowserArgs,
    command: &str,
) -> Result<(), BrowserCommandError> {
    let request = request::execute(peer, args, command).await?;
    let response = peer
        .unary::<ExecuteMethod>(&request, COMMAND_TIMEOUT)
        .await?;
    output::write(command, response, args)
}

async fn run_download(
    peer: &LocalProtocolClient,
    args: &input::BrowserArgs,
) -> Result<(), BrowserCommandError> {
    let request = request::download(peer, args).await?;
    let path = request.path.clone();
    let mut stream = peer
        .server_stream::<DownloadMethod>(&request, DOWNLOAD_TIMEOUT)
        .await?;
    let byte_length = match stream.receive().await? {
        Some(response) => match response.event {
            Some(Event::ByteLength(byte_length)) => byte_length,
            Some(Event::Chunk(_)) | None => return Err(BrowserCommandError::InvalidResponse),
        },
        None => return Err(BrowserCommandError::InvalidResponse),
    };
    if stream.receive().await?.is_some() {
        return Err(BrowserCommandError::InvalidResponse);
    }
    output::write_download(&path, byte_length, args)
}

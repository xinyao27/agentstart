use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::time::Duration;

use agentstart_protocol::method_metadata::methods::AgentStartRuntimeV1MobilePairingServiceCreateDevelopmentOffer as CreateDevelopmentOfferMethod;
use agentstart_protocol::runtime::v1::MobilePairingServiceCreateDevelopmentOfferRequest;
use serde::Serialize;
use thiserror::Error;

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

const MOBILE_PAIRING_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Error)]
pub(super) enum MobileCommandError {
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error("mobile_action_unsupported")]
    InvalidAction,
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("cli_flag_required:{0}")]
    MissingFlag(&'static str),
    #[error(transparent)]
    Path(#[from] crate::paths::PathResolutionError),
    #[error(transparent)]
    Peer(#[from] ProtocolPeerError),
    #[error("daemon_not_ready")]
    RuntimeNotReady,
    #[error("daemon_not_running")]
    RuntimeNotRunning,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MobilePairingOutput {
    device_id: String,
    endpoint: String,
    pairing_url: String,
}

pub(super) async fn run(args: &[OsString]) -> Result<(), MobileCommandError> {
    if args.first().and_then(|value| value.to_str()) != Some("pair") {
        return Err(MobileCommandError::InvalidAction);
    }
    let user_data_path = read_flag(args, "--daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(MobileCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(MobileCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(MobileCommandError::RuntimeNotReady)?;
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
    .await?;
    let result = create_pairing_offer(&peer, args).await;
    peer.close().await;
    result
}

async fn create_pairing_offer(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), MobileCommandError> {
    let response = peer
        .unary::<CreateDevelopmentOfferMethod>(
            &MobilePairingServiceCreateDevelopmentOfferRequest {
                address: required_string(args, "--address")?.to_owned(),
                device_name: required_string(args, "--device-name")?.to_owned(),
            },
            MOBILE_PAIRING_TIMEOUT,
        )
        .await?;
    let output = MobilePairingOutput {
        device_id: response.device_id,
        endpoint: response.endpoint,
        pairing_url: response.pairing_url,
    };
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!(
            "Open this pairing link on AgentStart Mobile: {}",
            output.pairing_url
        );
    }
    Ok(())
}

fn required_string<'a>(
    args: &'a [OsString],
    name: &'static str,
) -> Result<&'a str, MobileCommandError> {
    read_flag(args, name)
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .ok_or(MobileCommandError::MissingFlag(name))
}

fn read_flag<'a>(args: &'a [OsString], name: &str) -> Option<&'a OsStr> {
    let index = args.iter().position(|argument| argument == name)?;
    let value = args.get(index + 1)?;
    (!value.to_string_lossy().starts_with("--")).then_some(value)
}

fn has_flag(args: &[OsString], name: &str) -> bool {
    args.iter().any(|argument| argument == name)
}

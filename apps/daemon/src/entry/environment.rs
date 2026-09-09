use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;
use thiserror::Error;
use yiru_protocol::method_metadata::UnaryMethod;
use yiru_protocol::method_metadata::methods::{
    YiruRuntimeV1RuntimeEnvironmentServiceGenerateOffer as GenerateOfferMethod,
    YiruRuntimeV1RuntimeEnvironmentServiceGetStatus as GetStatusMethod,
    YiruRuntimeV1RuntimeEnvironmentServiceImport as ImportMethod,
    YiruRuntimeV1RuntimeEnvironmentServiceList as ListMethod,
    YiruRuntimeV1RuntimeEnvironmentServiceListPeers as ListPeersMethod,
    YiruRuntimeV1RuntimeEnvironmentServiceRemove as RemoveMethod,
    YiruRuntimeV1RuntimeEnvironmentServiceRevokePeer as RevokePeerMethod,
};
use yiru_protocol::runtime::v1::{
    GetStatusResponse, RuntimeAuthorizedPeer, RuntimeDeviceScope, RuntimeEnvironment,
    RuntimeEnvironmentEndpointKind, RuntimeEnvironmentServiceGenerateOfferRequest,
    RuntimeEnvironmentServiceGetStatusRequest, RuntimeEnvironmentServiceImportRequest,
    RuntimeEnvironmentServiceListPeersRequest, RuntimeEnvironmentServiceListRequest,
    RuntimeEnvironmentServiceRemoveRequest, RuntimeEnvironmentServiceRevokePeerRequest,
    RuntimeGraphStatus,
};

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

const LOCAL_CALL_TIMEOUT: Duration = Duration::from_secs(10);
const LOCAL_CLOSE_TIMEOUT: Duration = Duration::from_secs(2);
const DEFAULT_REMOTE_TIMEOUT_MS: u32 = 30_000;
const MAX_REMOTE_TIMEOUT_MS: u32 = 120_000;

#[derive(Debug, Error)]
pub(super) enum EnvironmentCommandError {
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error("environment_action_unsupported")]
    InvalidAction,
    #[error("cli_flag_invalid:{0}")]
    InvalidFlag(&'static str),
    #[error("environment_response_invalid")]
    InvalidResponse,
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
struct EnvironmentOutput {
    created_at_unix_ms: i64,
    endpoints: Vec<EndpointOutput>,
    id: String,
    last_used_at_unix_ms: Option<i64>,
    name: String,
    preferred_endpoint_id: String,
    runtime_id: Option<String>,
    updated_at_unix_ms: i64,
    pairing_required: bool,
}

#[derive(Serialize)]
struct EndpointOutput {
    endpoint: String,
    id: String,
    kind: &'static str,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PeerOutput {
    created_at_unix_ms: i64,
    id: String,
    last_seen_at_unix_ms: Option<i64>,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OfferOutput {
    endpoint: String,
    pairing_offer: String,
    peer_id: String,
}

#[derive(Serialize)]
struct EnvironmentsOutput {
    environments: Vec<EnvironmentOutput>,
}

#[derive(Serialize)]
struct PeersOutput {
    peers: Vec<PeerOutput>,
}

#[derive(Serialize)]
struct StatusOutput {
    environment: EnvironmentOutput,
    status: RemoteStatusOutput,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteStatusOutput {
    app_version: String,
    capabilities: Vec<String>,
    device_scope: &'static str,
    graph_status: &'static str,
    host_platform: String,
    live_leaf_count: u32,
    live_tab_count: u32,
    min_compatible_runtime_client_version: u32,
    renderer_graph_epoch: u64,
    runtime_api_version: u32,
    runtime_id: String,
}

pub(super) async fn run(args: &[OsString]) -> Result<(), EnvironmentCommandError> {
    let user_data_path = read_flag(args, "--daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(EnvironmentCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(EnvironmentCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(EnvironmentCommandError::RuntimeNotReady)?;
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
    let result = run_action(&peer, args).await;
    let _ = tokio::time::timeout(LOCAL_CLOSE_TIMEOUT, peer.close()).await;
    result
}

async fn run_action(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), EnvironmentCommandError> {
    match args.first().and_then(|value| value.to_str()) {
        Some("offer") => generate_offer(peer, args).await,
        Some("import") => import(peer, args).await,
        Some("list") => list(peer, args).await,
        Some("status") => status(peer, args).await,
        Some("remove") => remove(peer, args).await,
        Some("peers") => peers(peer, args).await,
        Some("revoke") => revoke(peer, args).await,
        Some(_) | None => Err(EnvironmentCommandError::InvalidAction),
    }
}

async fn generate_offer(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), EnvironmentCommandError> {
    let endpoint = optional_string(args, "--endpoint")?.map(ToOwned::to_owned);
    let address = optional_string(args, "--address")?.unwrap_or_default();
    if endpoint.is_none() && address.is_empty() {
        return Err(EnvironmentCommandError::MissingFlag("--address"));
    }
    let response = call::<GenerateOfferMethod>(
        peer,
        &RuntimeEnvironmentServiceGenerateOfferRequest {
            name: required_string(args, "--name")?.to_owned(),
            address: address.to_owned(),
            endpoint,
        },
        LOCAL_CALL_TIMEOUT,
    )
    .await?;
    let output = OfferOutput {
        endpoint: response.endpoint,
        pairing_offer: response.pairing_offer,
        peer_id: response.peer_id,
    };
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!(
            "Peer: {}\nEndpoint: {}\n{}",
            output.peer_id, output.endpoint, output.pairing_offer
        );
    }
    Ok(())
}

async fn import(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), EnvironmentCommandError> {
    let response = call::<ImportMethod>(
        peer,
        &RuntimeEnvironmentServiceImportRequest {
            name: required_string(args, "--name")?.to_owned(),
            pairing_offer: required_string(args, "--offer")?.to_owned(),
            replace_environment_id: optional_string(args, "--replace")?.map(str::to_owned),
        },
        LOCAL_CALL_TIMEOUT,
    )
    .await?;
    let environment = environment_output(
        response
            .environment
            .ok_or(EnvironmentCommandError::InvalidResponse)?,
    )?;
    print_environment(&environment, args, "Imported")
}

async fn list(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), EnvironmentCommandError> {
    let response = call::<ListMethod>(
        peer,
        &RuntimeEnvironmentServiceListRequest {},
        LOCAL_CALL_TIMEOUT,
    )
    .await?;
    let output = EnvironmentsOutput {
        environments: response
            .environments
            .into_iter()
            .map(environment_output)
            .collect::<Result<Vec<_>, _>>()?,
    };
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!(
            "{}",
            output
                .environments
                .iter()
                .map(|environment| format!(
                    "{}\t{}\t{}",
                    environment.id,
                    environment.name,
                    if environment.pairing_required {
                        "re-pairing required"
                    } else {
                        environment.runtime_id.as_deref().unwrap_or("unknown")
                    }
                ))
                .collect::<Vec<_>>()
                .join("\n")
        );
    }
    Ok(())
}

async fn status(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), EnvironmentCommandError> {
    let remote_timeout_ms =
        optional_u32(args, "--timeout-ms")?.unwrap_or(DEFAULT_REMOTE_TIMEOUT_MS);
    if remote_timeout_ms == 0 || remote_timeout_ms > MAX_REMOTE_TIMEOUT_MS {
        return Err(EnvironmentCommandError::InvalidFlag("--timeout-ms"));
    }
    let local_timeout = Duration::from_millis(u64::from(remote_timeout_ms) + 10_000);
    let response = call::<GetStatusMethod>(
        peer,
        &RuntimeEnvironmentServiceGetStatusRequest {
            selector: required_string(args, "--environment")?.to_owned(),
            timeout_ms: remote_timeout_ms,
        },
        local_timeout,
    )
    .await?;
    let output = StatusOutput {
        environment: environment_output(
            response
                .environment
                .ok_or(EnvironmentCommandError::InvalidResponse)?,
        )?,
        status: status_output(
            response
                .status
                .ok_or(EnvironmentCommandError::InvalidResponse)?,
        )?,
    };
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!(
            "{}\t{}\t{}\t{}",
            output.environment.name,
            output.status.runtime_id,
            output.status.host_platform,
            output.status.app_version
        );
    }
    Ok(())
}

async fn remove(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), EnvironmentCommandError> {
    let response = call::<RemoveMethod>(
        peer,
        &RuntimeEnvironmentServiceRemoveRequest {
            selector: required_string(args, "--environment")?.to_owned(),
        },
        LOCAL_CALL_TIMEOUT,
    )
    .await?;
    let environment = environment_output(
        response
            .removed
            .ok_or(EnvironmentCommandError::InvalidResponse)?,
    )?;
    print_environment(&environment, args, "Removed")
}

async fn peers(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), EnvironmentCommandError> {
    let response = call::<ListPeersMethod>(
        peer,
        &RuntimeEnvironmentServiceListPeersRequest {},
        LOCAL_CALL_TIMEOUT,
    )
    .await?;
    let output = PeersOutput {
        peers: response.peers.into_iter().map(peer_output).collect(),
    };
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!(
            "{}",
            output
                .peers
                .iter()
                .map(|peer| format!("{}\t{}", peer.id, peer.name))
                .collect::<Vec<_>>()
                .join("\n")
        );
    }
    Ok(())
}

async fn revoke(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), EnvironmentCommandError> {
    let response = call::<RevokePeerMethod>(
        peer,
        &RuntimeEnvironmentServiceRevokePeerRequest {
            peer_id: required_string(args, "--peer")?.to_owned(),
        },
        LOCAL_CALL_TIMEOUT,
    )
    .await?;
    let output = peer_output(
        response
            .revoked
            .ok_or(EnvironmentCommandError::InvalidResponse)?,
    );
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!("Revoked peer {}", output.id);
    }
    Ok(())
}

async fn call<Method>(
    peer: &LocalProtocolClient,
    request: &Method::Request,
    timeout: Duration,
) -> Result<Method::Response, EnvironmentCommandError>
where
    Method: UnaryMethod,
{
    peer.unary::<Method>(request, timeout)
        .await
        .map_err(EnvironmentCommandError::from)
}

fn environment_output(
    environment: RuntimeEnvironment,
) -> Result<EnvironmentOutput, EnvironmentCommandError> {
    let endpoints = environment
        .endpoints
        .into_iter()
        .map(|endpoint| {
            let kind = match RuntimeEnvironmentEndpointKind::try_from(endpoint.kind) {
                Ok(RuntimeEnvironmentEndpointKind::Websocket) => "websocket",
                Ok(RuntimeEnvironmentEndpointKind::Unspecified) | Err(_) => {
                    return Err(EnvironmentCommandError::InvalidResponse);
                }
            };
            Ok(EndpointOutput {
                endpoint: endpoint.endpoint,
                id: endpoint.id,
                kind,
                label: endpoint.label,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    if environment.id.is_empty()
        || environment.name.is_empty()
        || !endpoints
            .iter()
            .any(|endpoint| endpoint.id == environment.preferred_endpoint_id)
    {
        return Err(EnvironmentCommandError::InvalidResponse);
    }
    Ok(EnvironmentOutput {
        created_at_unix_ms: environment.created_at_unix_ms,
        endpoints,
        id: environment.id,
        last_used_at_unix_ms: environment.last_used_at_unix_ms,
        name: environment.name,
        preferred_endpoint_id: environment.preferred_endpoint_id,
        runtime_id: environment.runtime_id,
        updated_at_unix_ms: environment.updated_at_unix_ms,
        pairing_required: environment.pairing_required,
    })
}

fn peer_output(peer: RuntimeAuthorizedPeer) -> PeerOutput {
    PeerOutput {
        created_at_unix_ms: peer.created_at_unix_ms,
        id: peer.id,
        last_seen_at_unix_ms: peer.last_seen_at_unix_ms,
        name: peer.name,
    }
}

fn status_output(status: GetStatusResponse) -> Result<RemoteStatusOutput, EnvironmentCommandError> {
    let graph_status = match RuntimeGraphStatus::try_from(status.graph_status) {
        Ok(RuntimeGraphStatus::Ready) => "ready",
        Ok(RuntimeGraphStatus::Reloading) => "reloading",
        Ok(RuntimeGraphStatus::Unavailable) => "unavailable",
        Ok(RuntimeGraphStatus::Unspecified) | Err(_) => {
            return Err(EnvironmentCommandError::InvalidResponse);
        }
    };
    let device_scope = match RuntimeDeviceScope::try_from(status.device_scope) {
        Ok(RuntimeDeviceScope::Runtime) => "runtime",
        Ok(RuntimeDeviceScope::Mobile) => "mobile",
        Ok(RuntimeDeviceScope::Unspecified) | Err(_) => "unspecified",
    };
    if status.runtime_id.is_empty() {
        return Err(EnvironmentCommandError::InvalidResponse);
    }
    Ok(RemoteStatusOutput {
        app_version: status.app_version,
        capabilities: status.capabilities,
        device_scope,
        graph_status,
        host_platform: status.host_platform,
        live_leaf_count: status.live_leaf_count,
        live_tab_count: status.live_tab_count,
        min_compatible_runtime_client_version: status.min_compatible_runtime_client_version,
        renderer_graph_epoch: status.renderer_graph_epoch,
        runtime_api_version: status.runtime_api_version,
        runtime_id: status.runtime_id,
    })
}

fn print_environment(
    environment: &EnvironmentOutput,
    args: &[OsString],
    action: &str,
) -> Result<(), EnvironmentCommandError> {
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(environment)?);
    } else {
        println!(
            "{action} environment {} ({})",
            environment.name, environment.id
        );
    }
    Ok(())
}

fn required_string<'a>(
    args: &'a [OsString],
    flag: &'static str,
) -> Result<&'a str, EnvironmentCommandError> {
    optional_string(args, flag)?.ok_or(EnvironmentCommandError::MissingFlag(flag))
}

fn optional_string<'a>(
    args: &'a [OsString],
    flag: &'static str,
) -> Result<Option<&'a str>, EnvironmentCommandError> {
    let Some(value) = read_flag(args, flag) else {
        return Ok(None);
    };
    value
        .to_str()
        .filter(|value| !value.is_empty())
        .map(Some)
        .ok_or(EnvironmentCommandError::InvalidFlag(flag))
}

fn optional_u32(
    args: &[OsString],
    flag: &'static str,
) -> Result<Option<u32>, EnvironmentCommandError> {
    optional_string(args, flag)?
        .map(|value| {
            value
                .parse::<u32>()
                .map_err(|_| EnvironmentCommandError::InvalidFlag(flag))
        })
        .transpose()
}

fn read_flag<'a>(args: &'a [OsString], flag: &str) -> Option<&'a OsStr> {
    args.windows(2)
        .find(|pair| pair[0] == OsStr::new(flag))
        .map(|pair| pair[1].as_os_str())
}

fn has_flag(args: &[OsString], flag: &str) -> bool {
    args.iter().any(|argument| argument == OsStr::new(flag))
}

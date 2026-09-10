use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::time::Duration;

use agentstart_protocol::method_metadata::UnaryMethod;
use agentstart_protocol::method_metadata::methods::{
    AgentStartRuntimeV1HostRegistryServiceAdd as AddMethod,
    AgentStartRuntimeV1HostRegistryServiceList as ListMethod,
    AgentStartRuntimeV1HostRegistryServiceProbe as ProbeMethod,
    AgentStartRuntimeV1HostRegistryServiceRemove as RemoveMethod,
};
use agentstart_protocol::protocol::v1::StatusCode;
use agentstart_protocol::runtime::v1::{
    HostCapability, HostCapabilityKind, HostKind, HostPlatform, HostRegistryServiceAddRequest,
    HostRegistryServiceAddResponse, HostRegistryServiceListRequest,
    HostRegistryServiceListResponse, HostRegistryServiceProbeRequest,
    HostRegistryServiceProbeResponse, HostRegistryServiceRemoveRequest,
    HostRegistryServiceRemoveResponse, HostRevisionConflict, RegisteredHost,
};
use agentstart_protocol::transport::decode;
use serde::Serialize;
use thiserror::Error;

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

const REVISION_CONFLICT_TYPE: &str = "agentstart.runtime.v1.HostRevisionConflict";
const HOST_CALL_TIMEOUT: Duration = Duration::from_secs(10);
const HOST_PROBE_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Error)]
pub(super) enum HostCommandError {
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error("cli_flag_invalid:{0}")]
    InvalidFlag(&'static str),
    #[error("host_id_invalid")]
    InvalidHostId,
    #[error("host_kind_invalid")]
    InvalidHostKind,
    #[error("host_response_invalid")]
    InvalidResponse,
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
    #[error("host_action_unsupported")]
    UnsupportedAction,
    #[error(
        "workspaceRevisionConflict:expected_revision={expected_revision}:actual_revision={actual_revision}:scope={scope}"
    )]
    RevisionConflict {
        actual_revision: i64,
        expected_revision: i64,
        scope: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostOutput {
    id: String,
    kind: &'static str,
    label: String,
    platform: &'static str,
    target: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CapabilityOutput {
    available: bool,
    detail: Option<String>,
    name: &'static str,
}

#[derive(Serialize)]
struct ListOutput {
    hosts: Vec<HostOutput>,
    revision: i64,
}

#[derive(Serialize)]
struct AddOutput {
    host: HostOutput,
    revision: i64,
}

#[derive(Serialize)]
struct ProbeOutput {
    capabilities: Vec<CapabilityOutput>,
    host: HostOutput,
}

#[derive(Serialize)]
struct RemoveOutput {
    removed: bool,
    revision: i64,
}

pub(super) async fn run(args: &[OsString]) -> Result<(), HostCommandError> {
    let user_data_path = read_flag(args, "--daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(HostCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(HostCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(HostCommandError::RuntimeNotReady)?;
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

async fn run_action(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), HostCommandError> {
    match args.first().and_then(|value| value.to_str()) {
        Some("list") => list(peer, args).await,
        Some("add") => add(peer, args).await,
        Some("probe") => probe(peer, args).await,
        Some("remove") => remove(peer, args).await,
        Some(_) | None => Err(HostCommandError::UnsupportedAction),
    }
}

async fn list(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), HostCommandError> {
    let response: HostRegistryServiceListResponse =
        unary::<ListMethod>(peer, &HostRegistryServiceListRequest {}, HOST_CALL_TIMEOUT).await?;
    let output = ListOutput {
        hosts: response
            .hosts
            .into_iter()
            .map(host_output)
            .collect::<Result<Vec<_>, _>>()?,
        revision: response.revision,
    };
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!(
            "{}",
            output
                .hosts
                .iter()
                .map(|host| format!("{}\t{}\t{}", host.id, host.kind, host.label))
                .collect::<Vec<_>>()
                .join("\n")
        );
    }
    Ok(())
}

async fn add(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), HostCommandError> {
    let request = HostRegistryServiceAddRequest {
        expected_revision: nonnegative_integer(args, "--expected-revision")?,
        kind: host_kind(required_string(args, "--kind")?)? as i32,
        label: required_string(args, "--label")?.to_owned(),
        target: required_string(args, "--target")?.to_owned(),
    };
    let response: HostRegistryServiceAddResponse =
        unary::<AddMethod>(peer, &request, HOST_CALL_TIMEOUT).await?;
    let output = AddOutput {
        host: host_output(response.host.ok_or(HostCommandError::InvalidResponse)?)?,
        revision: response.revision,
    };
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!("Added host {}", output.host.label);
    }
    Ok(())
}

async fn probe(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), HostCommandError> {
    let request = HostRegistryServiceProbeRequest {
        host_id: host_id(required_string(args, "--host")?)?,
    };
    let response: HostRegistryServiceProbeResponse =
        unary::<ProbeMethod>(peer, &request, HOST_PROBE_TIMEOUT).await?;
    let output = ProbeOutput {
        capabilities: response
            .capabilities
            .into_iter()
            .map(capability_output)
            .collect::<Result<Vec<_>, _>>()?,
        host: host_output(response.host.ok_or(HostCommandError::InvalidResponse)?)?,
    };
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!(
            "{}",
            output
                .capabilities
                .iter()
                .map(|capability| format!(
                    "{}\t{}",
                    if capability.available { "✓" } else { "·" },
                    capability.name
                ))
                .collect::<Vec<_>>()
                .join("\n")
        );
    }
    Ok(())
}

async fn remove(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), HostCommandError> {
    let request = HostRegistryServiceRemoveRequest {
        host_id: host_id(required_string(args, "--host")?)?,
        expected_revision: nonnegative_integer(args, "--expected-revision")?,
    };
    let response: HostRegistryServiceRemoveResponse =
        unary::<RemoveMethod>(peer, &request, HOST_CALL_TIMEOUT).await?;
    let output = RemoveOutput {
        removed: response.removed,
        revision: response.revision,
    };
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!("Host removed");
    }
    Ok(())
}

async fn unary<Method>(
    peer: &LocalProtocolClient,
    request: &Method::Request,
    timeout: Duration,
) -> Result<Method::Response, HostCommandError>
where
    Method: UnaryMethod,
{
    peer.unary::<Method>(request, timeout)
        .await
        .map_err(map_peer_error)
}

fn map_peer_error(error: ProtocolPeerError) -> HostCommandError {
    let Some(status) = error.remote_status() else {
        return HostCommandError::Peer(error);
    };
    if status.code != StatusCode::Aborted as i32 || status.message != "workspaceRevisionConflict" {
        return HostCommandError::Peer(error);
    }
    let Some(detail) = status
        .details
        .iter()
        .find(|detail| detail.type_name == REVISION_CONFLICT_TYPE)
    else {
        return HostCommandError::InvalidResponse;
    };
    let Ok(conflict) = decode::<HostRevisionConflict>(&detail.value) else {
        return HostCommandError::InvalidResponse;
    };
    if conflict.expected_revision < 0 || conflict.actual_revision < 0 || conflict.scope.is_empty() {
        return HostCommandError::InvalidResponse;
    }
    HostCommandError::RevisionConflict {
        actual_revision: conflict.actual_revision,
        expected_revision: conflict.expected_revision,
        scope: conflict.scope,
    }
}

fn host_output(host: RegisteredHost) -> Result<HostOutput, HostCommandError> {
    let kind = match HostKind::try_from(host.kind) {
        Ok(HostKind::Local) => "local",
        Ok(HostKind::Ssh) => "ssh",
        Ok(HostKind::Wsl) => "wsl",
        Ok(HostKind::Unspecified) | Err(_) => return Err(HostCommandError::InvalidResponse),
    };
    let platform = match HostPlatform::try_from(host.platform) {
        Ok(HostPlatform::Darwin) => "darwin",
        Ok(HostPlatform::Linux) => "linux",
        Ok(HostPlatform::Windows) => "win32",
        Ok(HostPlatform::Unknown) => "unknown",
        Ok(HostPlatform::Unspecified) | Err(_) => return Err(HostCommandError::InvalidResponse),
    };
    Ok(HostOutput {
        id: host.id,
        kind,
        label: host.label,
        platform,
        target: host.target,
    })
}

fn capability_output(capability: HostCapability) -> Result<CapabilityOutput, HostCommandError> {
    let name = match HostCapabilityKind::try_from(capability.kind) {
        Ok(HostCapabilityKind::Filesystem) => "fs",
        Ok(HostCapabilityKind::Git) => "git",
        Ok(HostCapabilityKind::Pty) => "pty",
        Ok(HostCapabilityKind::Unspecified) | Err(_) => {
            return Err(HostCommandError::InvalidResponse);
        }
    };
    Ok(CapabilityOutput {
        available: capability.available,
        detail: capability.detail,
        name,
    })
}

fn host_kind(value: &str) -> Result<HostKind, HostCommandError> {
    match value {
        "ssh" => Ok(HostKind::Ssh),
        "wsl" => Ok(HostKind::Wsl),
        _ => Err(HostCommandError::InvalidHostKind),
    }
}

fn host_id(value: &str) -> Result<String, HostCommandError> {
    let value = value.trim();
    if value == "local"
        || ["ssh:", "wsl:"].iter().any(|prefix| {
            value
                .strip_prefix(prefix)
                .is_some_and(|encoded| !encoded.is_empty() && decode_component(encoded).is_some())
        })
    {
        Ok(value.to_owned())
    } else {
        Err(HostCommandError::InvalidHostId)
    }
}

fn decode_component(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = hex(*bytes.get(index + 1)?)?;
            let low = hex(*bytes.get(index + 2)?)?;
            decoded.push(high * 16 + low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded)
        .ok()
        .filter(|decoded| !decoded.is_empty())
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn required_string<'a>(
    args: &'a [OsString],
    name: &'static str,
) -> Result<&'a str, HostCommandError> {
    read_flag(args, name)
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .ok_or(HostCommandError::MissingFlag(name))
}

fn nonnegative_integer(args: &[OsString], name: &'static str) -> Result<i64, HostCommandError> {
    let value = required_string(args, name)?;
    let value = javascript_number(value).ok_or(HostCommandError::InvalidFlag(name))?;
    if value.is_finite() && value.fract() == 0.0 && (0.0..=9_007_199_254_740_991.0).contains(&value)
    {
        Ok(value as i64)
    } else {
        Err(HostCommandError::InvalidFlag(name))
    }
}

fn javascript_number(value: &str) -> Option<f64> {
    let value = value.trim();
    for (prefix, radix) in [
        ("0x", 16),
        ("0X", 16),
        ("0o", 8),
        ("0O", 8),
        ("0b", 2),
        ("0B", 2),
    ] {
        if let Some(digits) = value.strip_prefix(prefix) {
            return u64::from_str_radix(digits, radix)
                .ok()
                .map(|value| value as f64);
        }
    }
    value.parse().ok()
}

fn read_flag<'a>(args: &'a [OsString], name: &str) -> Option<&'a OsStr> {
    let index = args.iter().position(|argument| argument == name)?;
    let value = args.get(index + 1)?;
    (!value.to_string_lossy().starts_with("--")).then_some(value)
}

fn has_flag(args: &[OsString], name: &str) -> bool {
    args.iter().any(|argument| argument == name)
}

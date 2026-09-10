use agentstart_protocol::protocol::v1::{ErrorDetail, Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    HostCapability as ProtocolHostCapability, HostCapabilityKind as ProtocolHostCapabilityKind,
    HostKind as ProtocolHostKind, HostPlatform as ProtocolHostPlatform,
    HostRegistryServiceAddRequest, HostRegistryServiceAddResponse,
    HostRegistryServiceIsGitBashAvailableRequest, HostRegistryServiceIsGitBashAvailableResponse,
    HostRegistryServiceIsPwshAvailableRequest, HostRegistryServiceIsPwshAvailableResponse,
    HostRegistryServiceIsWslAvailableRequest, HostRegistryServiceIsWslAvailableResponse,
    HostRegistryServiceListRequest, HostRegistryServiceListResponse,
    HostRegistryServiceListWslDistrosRequest, HostRegistryServiceListWslDistrosResponse,
    HostRegistryServiceProbeRequest, HostRegistryServiceProbeResponse,
    HostRegistryServiceRemoveRequest, HostRegistryServiceRemoveResponse, HostRevisionConflict,
    RegisteredHost,
};
use agentstart_protocol::transport::{decode, encode};

use crate::host_registry::{
    HostAddInput, HostCapability, HostDescriptor, HostRegistry, HostRegistryError,
    RegistryHostKind, SystemHostCapabilities,
};
use crate::persistence::host_store::HostStoreError;

pub(super) async fn list(registry: &HostRegistry, payload: &[u8]) -> Result<Vec<u8>, Status> {
    decode::<HostRegistryServiceListRequest>(payload)?;
    let result = registry.list().await.map_err(registry_status)?;
    let hosts = result
        .hosts
        .into_iter()
        .map(registered_host)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(encode(&HostRegistryServiceListResponse {
        hosts,
        revision: result.revision,
    }))
}

pub(super) async fn add(registry: &HostRegistry, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<HostRegistryServiceAddRequest>(payload)?;
    let expected_revision = revision(request.expected_revision)?;
    let kind = registry_kind(request.kind)?;
    let label = trimmed(request.label, "label", 128)?;
    let target = trimmed(request.target, "target", 512)?;
    let result = registry
        .add(HostAddInput {
            expected_revision,
            kind,
            label,
            target,
        })
        .await
        .map_err(registry_status)?;
    Ok(encode(&HostRegistryServiceAddResponse {
        host: Some(registered_host(result.host)?),
        revision: result.revision,
    }))
}

pub(super) async fn probe(registry: &HostRegistry, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<HostRegistryServiceProbeRequest>(payload)?;
    let host_id = host_id(request.host_id)?;
    let result = registry.probe(host_id).await.map_err(registry_status)?;
    let capabilities = result
        .capabilities
        .into_iter()
        .map(protocol_capability)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(encode(&HostRegistryServiceProbeResponse {
        capabilities,
        host: Some(registered_host(result.host)?),
    }))
}

pub(super) async fn remove(registry: &HostRegistry, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<HostRegistryServiceRemoveRequest>(payload)?;
    let expected_revision = revision(request.expected_revision)?;
    let host_id = host_id(request.host_id)?;
    let result = registry
        .remove(host_id, expected_revision)
        .await
        .map_err(registry_status)?;
    Ok(encode(&HostRegistryServiceRemoveResponse {
        removed: result.removed,
        revision: result.revision,
    }))
}

pub(super) async fn is_wsl_available(
    system: &SystemHostCapabilities,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<HostRegistryServiceIsWslAvailableRequest>(payload)?;
    Ok(encode(&HostRegistryServiceIsWslAvailableResponse {
        available: system.is_wsl_available().await,
    }))
}

pub(super) async fn list_wsl_distros(
    system: &SystemHostCapabilities,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<HostRegistryServiceListWslDistrosRequest>(payload)?;
    Ok(encode(&HostRegistryServiceListWslDistrosResponse {
        distros: system.list_wsl_distros().await,
    }))
}

pub(super) async fn is_git_bash_available(
    system: &SystemHostCapabilities,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<HostRegistryServiceIsGitBashAvailableRequest>(payload)?;
    Ok(encode(&HostRegistryServiceIsGitBashAvailableResponse {
        available: system.is_git_bash_available(),
    }))
}

pub(super) async fn is_pwsh_available(
    system: &SystemHostCapabilities,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<HostRegistryServiceIsPwshAvailableRequest>(payload)?;
    Ok(encode(&HostRegistryServiceIsPwshAvailableResponse {
        available: system.is_pwsh_available().await,
    }))
}

fn registered_host(host: HostDescriptor) -> Result<RegisteredHost, Status> {
    Ok(RegisteredHost {
        id: host.id,
        kind: protocol_kind(&host.kind)? as i32,
        label: host.label,
        platform: protocol_platform(&host.platform)? as i32,
        target: host.target,
    })
}

fn protocol_capability(capability: HostCapability) -> Result<ProtocolHostCapability, Status> {
    let kind = match capability.name {
        "fs" => ProtocolHostCapabilityKind::Filesystem,
        "git" => ProtocolHostCapabilityKind::Git,
        "pty" => ProtocolHostCapabilityKind::Pty,
        _ => {
            return Err(status(
                StatusCode::DataLoss,
                "Host capability has an unknown kind",
            ));
        }
    };
    Ok(ProtocolHostCapability {
        kind: kind as i32,
        available: capability.available,
        detail: capability.detail,
    })
}

fn registry_kind(kind: i32) -> Result<RegistryHostKind, Status> {
    match ProtocolHostKind::try_from(kind) {
        Ok(ProtocolHostKind::Ssh) => Ok(RegistryHostKind::Ssh),
        Ok(ProtocolHostKind::Wsl) => Ok(RegistryHostKind::Wsl),
        Ok(ProtocolHostKind::Unspecified | ProtocolHostKind::Local) | Err(_) => Err(status(
            StatusCode::InvalidArgument,
            "Host kind must be SSH or WSL",
        )),
    }
}

fn protocol_kind(kind: &str) -> Result<ProtocolHostKind, Status> {
    match kind {
        "local" => Ok(ProtocolHostKind::Local),
        "ssh" => Ok(ProtocolHostKind::Ssh),
        "wsl" => Ok(ProtocolHostKind::Wsl),
        _ => Err(status(StatusCode::DataLoss, "Stored host kind is invalid")),
    }
}

fn protocol_platform(platform: &str) -> Result<ProtocolHostPlatform, Status> {
    match platform {
        "darwin" => Ok(ProtocolHostPlatform::Darwin),
        "linux" => Ok(ProtocolHostPlatform::Linux),
        "win32" => Ok(ProtocolHostPlatform::Windows),
        "unknown" => Ok(ProtocolHostPlatform::Unknown),
        _ => Err(status(
            StatusCode::DataLoss,
            "Stored host platform is invalid",
        )),
    }
}

fn revision(value: i64) -> Result<i64, Status> {
    if value < 0 {
        Err(status(
            StatusCode::InvalidArgument,
            "expected_revision must be non-negative",
        ))
    } else {
        Ok(value)
    }
}

fn trimmed(value: String, field: &'static str, maximum: usize) -> Result<String, Status> {
    let value = value.trim_matches(is_ecmascript_whitespace);
    if value.is_empty() || value.encode_utf16().count() > maximum {
        return Err(status(
            StatusCode::InvalidArgument,
            &format!("{field} is invalid"),
        ));
    }
    Ok(value.to_owned())
}

fn host_id(value: String) -> Result<String, Status> {
    let value = value.trim_matches(is_ecmascript_whitespace);
    if value == "local" {
        return Ok(value.to_owned());
    }
    let encoded = value
        .strip_prefix("ssh:")
        .or_else(|| value.strip_prefix("wsl:"));
    if encoded.is_some_and(|encoded| !encoded.is_empty() && decode_component(encoded).is_some()) {
        Ok(value.to_owned())
    } else {
        Err(status(StatusCode::InvalidArgument, "host_id is invalid"))
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

fn registry_status(error: HostRegistryError) -> Status {
    match error {
        HostRegistryError::LocalRemoveForbidden => status(
            StatusCode::FailedPrecondition,
            "host_remove_local_forbidden",
        ),
        HostRegistryError::Ssh(_) => status(StatusCode::InvalidArgument, "ssh_target_invalid"),
        HostRegistryError::Wsl(_) => {
            status(StatusCode::InvalidArgument, "wsl_distribution_invalid")
        }
        HostRegistryError::Store(error) => store_status(error),
        HostRegistryError::Time(_) => status(StatusCode::Internal, "host_registry_clock_failed"),
    }
}

fn store_status(error: HostStoreError) -> Status {
    match error {
        HostStoreError::HasProjects => status(StatusCode::FailedPrecondition, "host_has_projects"),
        HostStoreError::NotFound => status(StatusCode::NotFound, "host_not_found"),
        HostStoreError::RevisionConflict {
            actual_revision,
            expected_revision,
            scope,
        } => Status {
            code: StatusCode::Aborted as i32,
            message: "workspaceRevisionConflict".to_owned(),
            details: vec![ErrorDetail {
                type_name: "agentstart.runtime.v1.HostRevisionConflict".to_owned(),
                value: encode(&HostRevisionConflict {
                    expected_revision,
                    actual_revision,
                    scope: scope.to_owned(),
                }),
            }],
        },
        HostStoreError::WorkerUnavailable => {
            status(StatusCode::Unavailable, "host_store_unavailable")
        }
        HostStoreError::RevisionUnavailable
        | HostStoreError::Serialization(_)
        | HostStoreError::Sqlite(_)
        | HostStoreError::Clock(_) => status(StatusCode::Internal, "host_store_failed"),
    }
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'..='\u{000d}'
            | '\u{0020}'
            | '\u{00a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}

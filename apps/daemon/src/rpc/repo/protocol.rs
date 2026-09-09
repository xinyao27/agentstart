use yiru_protocol::protocol::v1::{ErrorDetail, Status, StatusCode};
use yiru_protocol::runtime::v1::{
    RepoHooksSource, RepoKind, RepoRevisionConflict, RepoServiceAddRequest, RepoServiceAddResponse,
    RepoServiceGetHooksRequest, RepoServiceGetHooksResponse, RepoServiceListRequest,
    RepoServiceListResponse, RepoSetupRunPolicy, RepoSetupTrust,
};
use yiru_protocol::transport::{decode, encode};

use crate::repositories::RepositoryError;
use crate::repositories::ecmascript;

use super::RepoRpc;
use super::protocol_values::protocol_repo;

const MAX_PROJECT_ID_CODE_UNITS: usize = 4_096;

pub(in crate::rpc) async fn list(rpc: &RepoRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    decode::<RepoServiceListRequest>(payload)?;
    let result = rpc.repositories.list().await.map_err(repository_status)?;
    let repos = result
        .repos
        .into_iter()
        .map(protocol_repo)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(encode(&RepoServiceListResponse {
        repos,
        revision: result.revision,
    }))
}

pub(in crate::rpc) async fn add(rpc: &RepoRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceAddRequest>(payload)?;
    if request.expected_revision < 0 {
        return Err(status(
            StatusCode::InvalidArgument,
            "expected_revision must be non-negative",
        ));
    }
    if request.path.is_empty() {
        return Err(status(StatusCode::InvalidArgument, "Missing repo path"));
    }
    let kind = match RepoKind::try_from(request.kind) {
        Ok(RepoKind::Unspecified | RepoKind::Git) => crate::projects::ProjectKind::Git,
        Ok(RepoKind::Folder) => crate::projects::ProjectKind::Folder,
        Err(_) => return Err(status(StatusCode::InvalidArgument, "Repo kind is invalid")),
    };
    let host_id = request.host_id.map(valid_host_id).transpose()?;
    let result = rpc
        .repositories
        .add(request.expected_revision, request.path, kind, host_id)
        .await
        .map_err(repository_status)?;
    Ok(encode(&RepoServiceAddResponse {
        repo: Some(protocol_repo(result.repo)?),
        revision: result.revision,
    }))
}

fn valid_host_id(value: String) -> Result<String, Status> {
    if value == "local" {
        return Ok(value);
    }
    let encoded = ["runtime:", "ssh:", "wsl:"]
        .iter()
        .find_map(|prefix| value.strip_prefix(prefix));
    if encoded.is_some_and(valid_encoded_host) {
        Ok(value)
    } else {
        Err(status(StatusCode::InvalidArgument, "host_id_invalid"))
    }
}

fn valid_encoded_host(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let Some(high) = bytes.get(index + 1).and_then(|value| hex(*value)) else {
                return false;
            };
            let Some(low) = bytes.get(index + 2).and_then(|value| hex(*value)) else {
                return false;
            };
            decoded.push(high * 16 + low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).is_ok_and(|value| !value.is_empty())
}

fn hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

pub(in crate::rpc) async fn get_hooks(rpc: &RepoRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<RepoServiceGetHooksRequest>(payload)?;
    let project_id = required_project_id(&request.project_id)?;
    let inspection = rpc
        .repositories
        .hooks_by_project_id(project_id)
        .await
        .map_err(hooks_repository_status)?;
    let setup_run_policy = match inspection.setup_run_policy.as_str() {
        "ask" => RepoSetupRunPolicy::Ask,
        "run-by-default" => RepoSetupRunPolicy::RunByDefault,
        "skip-by-default" => RepoSetupRunPolicy::SkipByDefault,
        _ => {
            return Err(status(
                StatusCode::DataLoss,
                "Repository setup policy is invalid",
            ));
        }
    };
    let source = match inspection.source {
        Some("yiru.yaml") => RepoHooksSource::YiruYaml,
        Some("legacy") => RepoHooksSource::Legacy,
        None => RepoHooksSource::Unspecified,
        Some(_) => {
            return Err(status(
                StatusCode::DataLoss,
                "Repository hooks source is invalid",
            ));
        }
    };
    Ok(encode(&RepoServiceGetHooksResponse {
        setup_command: inspection.setup_command,
        setup_run_policy: setup_run_policy as i32,
        source: source as i32,
        setup_trust: inspection.setup_trust.map(|trust| RepoSetupTrust {
            content_hash: trust.content_hash,
            script_content: trust.script_content,
        }),
    }))
}

fn required_project_id(value: &str) -> Result<&str, Status> {
    let value = ecmascript::trim(value);
    if value.is_empty()
        || value.encode_utf16().count() > MAX_PROJECT_ID_CODE_UNITS
        || value.contains('\0')
    {
        return Err(status(
            StatusCode::InvalidArgument,
            "Project identifier must contain 1 through 4096 UTF-16 code units",
        ));
    }
    Ok(value)
}

pub(super) fn repository_status(error: RepositoryError) -> Status {
    match error {
        RepositoryError::Catalog(crate::projects::ProjectCatalogError::RevisionConflict {
            actual_revision,
            expected_revision,
            scope,
        }) => Status {
            code: StatusCode::Aborted as i32,
            message: "workspaceRevisionConflict".to_owned(),
            details: vec![ErrorDetail {
                type_name: "yiru.runtime.v1.RepoRevisionConflict".to_owned(),
                value: encode(&RepoRevisionConflict {
                    expected_revision,
                    actual_revision,
                    scope: scope.to_owned(),
                }),
            }],
        },
        RepositoryError::Catalog(crate::projects::ProjectCatalogError::NotFound) => {
            status(StatusCode::NotFound, "repo_not_found")
        }
        RepositoryError::Catalog(crate::projects::ProjectCatalogError::AmbiguousSelector) => {
            status(StatusCode::FailedPrecondition, "selector_ambiguous")
        }
        RepositoryError::WorkerUnavailable => {
            status(StatusCode::Internal, "repository response channel closed")
        }
        RepositoryError::Runtime(message) => status(StatusCode::Internal, &message),
        RepositoryError::Filesystem(error) => status(StatusCode::Internal, &error.to_string()),
        RepositoryError::Command(error) => status(StatusCode::Internal, &error.to_string()),
        RepositoryError::Host(error) => status(StatusCode::Internal, &error.to_string()),
        RepositoryError::ProjectHostSetup(error) => {
            status(StatusCode::Internal, &error.to_string())
        }
        RepositoryError::Catalog(error) => status(StatusCode::Internal, &error.to_string()),
    }
}

fn hooks_repository_status(error: RepositoryError) -> Status {
    match error {
        RepositoryError::Catalog(crate::projects::ProjectCatalogError::NotFound) => {
            status(StatusCode::NotFound, "Project identifier was not found")
        }
        RepositoryError::Catalog(crate::projects::ProjectCatalogError::AmbiguousSelector) => {
            status(
                StatusCode::FailedPrecondition,
                "Project identifier is not unique in this runtime",
            )
        }
        RepositoryError::WorkerUnavailable => status(
            StatusCode::Unavailable,
            "Repository authority is unavailable",
        ),
        RepositoryError::Filesystem(_) | RepositoryError::Command(_) => status(
            StatusCode::Unavailable,
            "Repository hooks could not be inspected",
        ),
        RepositoryError::Host(_) => {
            status(StatusCode::Unavailable, "Repository host is unavailable")
        }
        _ => status(StatusCode::Internal, "Repository hooks inspection failed"),
    }
}

pub(super) fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

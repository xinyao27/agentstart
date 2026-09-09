use yiru_protocol::protocol::v1::{ErrorDetail, Status, StatusCode};
use yiru_protocol::runtime::v1::{
    ShellRepoHostReorderStatus, ShellRepoHostRevisionConflict,
    ShellRepoHostServiceCloneAbortRequest, ShellRepoHostServiceCloneAbortedResponse,
    ShellRepoHostServiceDefaultCreateProjectParentResponse,
    ShellRepoHostServiceGetDefaultCreateProjectParentRequest, ShellRepoHostServicePickRequest,
    ShellRepoHostServicePickedListResponse, ShellRepoHostServicePickedResponse,
    ShellRepoHostServiceRemoveForHostRequest, ShellRepoHostServiceRemovedForHostResponse,
    ShellRepoHostServiceReorderForHostRequest, ShellRepoHostServiceReorderedForHostResponse,
};
use yiru_protocol::transport::{decode, encode};

use crate::projects::ProjectCatalogError;
use crate::repo_host::RepoHostError;

use super::RepoHostRpc;
use super::input::normalize_host_id;

pub(in crate::rpc) async fn clone_abort(
    rpc: &RepoHostRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellRepoHostServiceCloneAbortRequest>(payload)?;
    rpc.authority.abort_clone();
    Ok(encode(&ShellRepoHostServiceCloneAbortedResponse {}))
}

pub(in crate::rpc) async fn get_default_create_project_parent(
    rpc: &RepoHostRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellRepoHostServiceGetDefaultCreateProjectParentRequest>(payload)?;
    let path = rpc
        .authority
        .default_create_project_parent()
        .map_err(repo_host_status)?;
    Ok(encode(
        &ShellRepoHostServiceDefaultCreateProjectParentResponse { path },
    ))
}

pub(in crate::rpc) async fn pick_directory(
    rpc: &RepoHostRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellRepoHostServicePickRequest>(payload)?;
    let path = rpc
        .authority
        .pick_directories(false)
        .await
        .into_iter()
        .next();
    Ok(encode(&ShellRepoHostServicePickedResponse { path }))
}

pub(in crate::rpc) async fn pick_folder(
    rpc: &RepoHostRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellRepoHostServicePickRequest>(payload)?;
    let path = rpc
        .authority
        .pick_directories(false)
        .await
        .into_iter()
        .next();
    Ok(encode(&ShellRepoHostServicePickedResponse { path }))
}

pub(in crate::rpc) async fn pick_folders(
    rpc: &RepoHostRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellRepoHostServicePickRequest>(payload)?;
    let paths = rpc.authority.pick_directories(true).await;
    Ok(encode(&ShellRepoHostServicePickedListResponse { paths }))
}

pub(in crate::rpc) async fn remove_for_host(
    rpc: &RepoHostRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellRepoHostServiceRemoveForHostRequest>(payload)?;
    if request.expected_revision < 0 {
        return Err(invalid_argument("Expected revision must be non-negative"));
    }
    // Why: remove keeps the legacy strictness where an unparsable host id is a
    // runtime error, while reorder treats one as an in-band rejection.
    let host_id =
        normalize_host_id(&request.host_id).ok_or_else(|| invalid_host(&request.host_id))?;
    let result = rpc
        .authority
        .remove_for_host(crate::repo_host::RemoveForHostInput {
            expected_revision: request.expected_revision,
            host_id,
            repo_id: request.repo_id,
        })
        .await
        .map_err(repo_host_status)?;
    Ok(encode(&ShellRepoHostServiceRemovedForHostResponse {
        removed: result.removed,
        revision: result.revision,
    }))
}

pub(in crate::rpc) async fn reorder_for_host(
    rpc: &RepoHostRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellRepoHostServiceReorderForHostRequest>(payload)?;
    if request.expected_revision < 0 {
        return Err(invalid_argument("Expected revision must be non-negative"));
    }
    // Why: the legacy verb answered an unparsable host id with the same
    // unapplied `rejected` projection instead of an error, so a caller sees a
    // stable ordering outcome regardless of host spelling.
    let input =
        normalize_host_id(&request.host_id).map(|host_id| crate::repo_host::ReorderForHostInput {
            expected_revision: request.expected_revision,
            host_id,
            ordered_ids: request.ordered_ids,
        });
    let result = match input {
        Some(input) => rpc
            .authority
            .reorder_for_host(input)
            .await
            .map_err(repo_host_status)?,
        None => crate::repo_host::ReorderForHostResult {
            revision: None,
            status: crate::repo_host::ReorderStatus::Rejected,
        },
    };
    Ok(encode(&ShellRepoHostServiceReorderedForHostResponse {
        revision: result.revision,
        status: match result.status {
            crate::repo_host::ReorderStatus::Applied => ShellRepoHostReorderStatus::Applied,
            crate::repo_host::ReorderStatus::Rejected => ShellRepoHostReorderStatus::Rejected,
        } as i32,
    }))
}

// Why: the legacy surface answers a stale revision with the
// workspaceRevisionConflict code plus actual/expected/scope data, so the
// protobuf surface carries the same trio as a typed status detail.
fn repo_host_status(error: RepoHostError) -> Status {
    match &error {
        RepoHostError::Catalog(ProjectCatalogError::RevisionConflict {
            actual_revision,
            expected_revision,
            scope,
        }) => Status {
            code: StatusCode::Aborted as i32,
            message: "workspaceRevisionConflict".to_owned(),
            details: vec![ErrorDetail {
                type_name: "yiru.runtime.v1.ShellRepoHostRevisionConflict".to_owned(),
                value: encode(&ShellRepoHostRevisionConflict {
                    expected_revision: *expected_revision,
                    actual_revision: *actual_revision,
                    scope: (*scope).to_owned(),
                }),
            }],
        },
        _ => status(StatusCode::Internal, &error.to_string()),
    }
}

fn invalid_host(host_id: &str) -> Status {
    status(StatusCode::Internal, &format!("Invalid host ID: {host_id}"))
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

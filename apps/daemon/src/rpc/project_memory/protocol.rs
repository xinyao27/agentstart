use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    ProjectMemoryRecord, ProjectMemoryServiceAppendRequest, ProjectMemoryServiceAppendResponse,
    ProjectMemoryServiceListRequest, ProjectMemoryServiceListResponse,
    ProjectMemoryServiceReadRequest, ProjectMemoryServiceReadResponse,
};
use agentstart_protocol::transport::{decode, encode};

use super::ProjectMemoryRpc;
use crate::project_memory::ProjectMemoryError;

pub(in crate::rpc) async fn read(
    rpc: &ProjectMemoryRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectMemoryServiceReadRequest>(payload)?;
    let snapshot = rpc
        .memory
        .read(&request.worktree)
        .await
        .map_err(status_from_error)?;
    Ok(encode(&ProjectMemoryServiceReadResponse {
        project_id: snapshot.project_id,
        display_name: snapshot.display_name,
        path: snapshot.path.to_string_lossy().into_owned(),
        content: snapshot.content,
        revision: snapshot.revision,
    }))
}

pub(in crate::rpc) async fn append(
    rpc: &ProjectMemoryRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectMemoryServiceAppendRequest>(payload)?;
    let result = rpc
        .memory
        .append(&request.worktree, request.section.as_deref(), &request.text)
        .await
        .map_err(status_from_error)?;
    Ok(encode(&ProjectMemoryServiceAppendResponse {
        project_id: result.project_id,
        path: result.path.to_string_lossy().into_owned(),
        revision: result.revision,
        appended: result.appended,
    }))
}

pub(in crate::rpc) async fn list(
    rpc: &ProjectMemoryRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ProjectMemoryServiceListRequest>(payload)?;
    let projects = rpc.memory.list().await.map_err(status_from_error)?;
    Ok(encode(&ProjectMemoryServiceListResponse {
        projects: projects
            .into_iter()
            .map(|project| ProjectMemoryRecord {
                project_id: project.project_id,
                display_name: project.display_name,
                project_path: project.project_path,
                memory_path: project
                    .memory_path
                    .map(|path| path.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                revision: project.revision,
                byte_count: project.byte_count,
            })
            .collect(),
    }))
}

fn status_from_error(error: ProjectMemoryError) -> Status {
    let code = match error.code() {
        "invalid_argument"
        | "project_memory_document_too_large"
        | "project_memory_entry_too_large" => StatusCode::InvalidArgument,
        "project_not_found" => StatusCode::NotFound,
        "project_memory_ambiguous_selector" => StatusCode::FailedPrecondition,
        _ => StatusCode::Internal,
    };
    Status {
        code: code as i32,
        message: error.to_string(),
        details: Vec::new(),
    }
}

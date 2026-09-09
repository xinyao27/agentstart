use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    WorktreeLabelsServiceRegisterRequest, WorktreeLabelsServiceRegisterResponse,
};
use yiru_protocol::transport::{decode, encode};

use crate::worktree_labels::{RegisterRouteRequest, TargetValidationError, WorktreeLabelError};

use super::WorktreeLabelsRpc;

pub(in crate::rpc) async fn register(
    rpc: &WorktreeLabelsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeLabelsServiceRegisterRequest>(payload)?;
    let route = RegisterRouteRequest {
        target_url: request.target_url,
        project_name: request.project_name,
        worktree_name: request.worktree_name,
        worktree_path: request.worktree_path,
        repo_id: request.repo_id,
        worktree_id: request.worktree_id,
    };
    let result = rpc
        .labels
        .register(route)
        .await
        .map_err(worktree_label_status)?;
    Ok(encode(&WorktreeLabelsServiceRegisterResponse {
        url: result.url,
        label: result.label,
    }))
}

fn worktree_label_status(error: WorktreeLabelError) -> Status {
    let code = match &error {
        WorktreeLabelError::InvalidTargetUrl => StatusCode::InvalidArgument,
        WorktreeLabelError::Target(TargetValidationError::NotAllowed) => {
            StatusCode::InvalidArgument
        }
        WorktreeLabelError::Target(_) => StatusCode::Unavailable,
        WorktreeLabelError::NoAvailableLabel => StatusCode::ResourceExhausted,
        WorktreeLabelError::Proxy(_) => StatusCode::Unavailable,
    };
    Status {
        code: code as i32,
        message: error.to_string(),
        details: Vec::new(),
    }
}

// Index and working-tree mutation that does not touch commit history or refs.
// See packages/protocol/proto/yiru/runtime/v1/git_staging.proto (GitStagingService).

use yiru_protocol::protocol::v1::Status;
use yiru_protocol::runtime::v1::{
    GitStagingServiceAppendGitignoreRequest, GitStagingServiceAppendGitignoreResponse,
    GitStagingServiceBulkDiscardRequest, GitStagingServiceBulkDiscardResponse,
    GitStagingServiceBulkStageRequest, GitStagingServiceBulkStageResponse,
    GitStagingServiceBulkUnstageRequest, GitStagingServiceBulkUnstageResponse,
    GitStagingServiceCommitRequest, GitStagingServiceCommitResponse,
    GitStagingServiceDiscardRequest, GitStagingServiceDiscardResponse,
    GitStagingServiceStageRequest, GitStagingServiceStageResponse, GitStagingServiceUnstageRequest,
    GitStagingServiceUnstageResponse,
};
use yiru_protocol::transport::{decode, encode};

use super::super::GitRpc;
use super::support::authority_status;

pub(in crate::rpc) async fn stage(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStagingServiceStageRequest>(payload)?;
    rpc.git
        .stage(&request.worktree, &request.file_path)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitStagingServiceStageResponse { ok: true }))
}

pub(in crate::rpc) async fn unstage(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStagingServiceUnstageRequest>(payload)?;
    rpc.git
        .unstage(&request.worktree, &request.file_path)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitStagingServiceUnstageResponse { ok: true }))
}

pub(in crate::rpc) async fn discard(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStagingServiceDiscardRequest>(payload)?;
    rpc.git
        .discard(&request.worktree, &request.file_path)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitStagingServiceDiscardResponse { ok: true }))
}

pub(in crate::rpc) async fn bulk_stage(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStagingServiceBulkStageRequest>(payload)?;
    rpc.git
        .bulk_stage(&request.worktree, &request.file_paths)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitStagingServiceBulkStageResponse { ok: true }))
}

pub(in crate::rpc) async fn bulk_unstage(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStagingServiceBulkUnstageRequest>(payload)?;
    rpc.git
        .bulk_unstage(&request.worktree, &request.file_paths)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitStagingServiceBulkUnstageResponse { ok: true }))
}

pub(in crate::rpc) async fn bulk_discard(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStagingServiceBulkDiscardRequest>(payload)?;
    rpc.git
        .bulk_discard(&request.worktree, &request.file_paths)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitStagingServiceBulkDiscardResponse { ok: true }))
}

pub(in crate::rpc) async fn commit(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStagingServiceCommitRequest>(payload)?;
    let result = rpc
        .git
        .commit(&request.worktree, &request.message)
        .await
        .map_err(authority_status)?;
    let success = result
        .get("success")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let error = result
        .get("error")
        .and_then(|value| value.as_str())
        .map(str::to_owned);
    Ok(encode(&GitStagingServiceCommitResponse { success, error }))
}

pub(in crate::rpc) async fn append_gitignore(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStagingServiceAppendGitignoreRequest>(payload)?;
    let result = rpc
        .git
        .append_gitignore(&request.worktree, &request.folder_name)
        .await
        .map_err(authority_status)?;
    let appended = result.as_bool().unwrap_or(false);
    Ok(encode(&GitStagingServiceAppendGitignoreResponse {
        appended,
    }))
}

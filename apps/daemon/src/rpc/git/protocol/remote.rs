// Remote synchronization: fetch, pull, fast-forward-only pull, push, and
// upstream-fork sync. See
// packages/protocol/proto/agentstart/runtime/v1/git_remote.proto (GitRemoteService).

use serde_json::Value;

use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    GitForkSyncBlockReason, GitForkSyncStatus, GitRemoteServiceFastForwardRequest,
    GitRemoteServiceFastForwardResponse, GitRemoteServiceFetchRequest,
    GitRemoteServiceFetchResponse, GitRemoteServiceForkSyncRequest,
    GitRemoteServiceForkSyncResponse, GitRemoteServicePullRequest, GitRemoteServicePullResponse,
    GitRemoteServicePushRequest, GitRemoteServicePushResponse,
};
use agentstart_protocol::transport::{decode, encode};

use super::super::GitRpc;
use super::support::{authority_status, push_target, string_field};

pub(in crate::rpc) async fn fetch(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitRemoteServiceFetchRequest>(payload)?;
    let target = push_target(request.push_target);
    rpc.git
        .fetch(&request.worktree, target.as_ref())
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitRemoteServiceFetchResponse { ok: true }))
}

pub(in crate::rpc) async fn pull(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitRemoteServicePullRequest>(payload)?;
    let target = push_target(request.push_target);
    rpc.git
        .pull(&request.worktree, target.as_ref(), false)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitRemoteServicePullResponse { ok: true }))
}

pub(in crate::rpc) async fn fast_forward(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitRemoteServiceFastForwardRequest>(payload)?;
    let target = push_target(request.push_target);
    rpc.git
        .pull(&request.worktree, target.as_ref(), true)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitRemoteServiceFastForwardResponse { ok: true }))
}

pub(in crate::rpc) async fn push(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitRemoteServicePushRequest>(payload)?;
    let target = push_target(request.push_target);
    rpc.git
        .push(
            &request.worktree,
            target.as_ref(),
            request.publish,
            request.force_with_lease,
        )
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitRemoteServicePushResponse { ok: true }))
}

pub(in crate::rpc) async fn fork_sync(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitRemoteServiceForkSyncRequest>(payload)?;
    let result = rpc
        .git
        .fork_sync(
            &request.worktree,
            &request.expected_upstream_owner,
            &request.expected_upstream_repo,
        )
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitRemoteServiceForkSyncResponse {
        origin_remote: string_field(&result, "originRemote").unwrap_or_default(),
        upstream_remote: string_field(&result, "upstreamRemote").unwrap_or_default(),
        ahead: result.get("ahead").and_then(Value::as_u64).unwrap_or(0),
        behind: result.get("behind").and_then(Value::as_u64).unwrap_or(0),
        status: result
            .get("status")
            .and_then(Value::as_str)
            .map_or(GitForkSyncStatus::Unspecified, fork_sync_status) as i32,
        reason: result
            .get("reason")
            .and_then(Value::as_str)
            .map(|reason| fork_sync_block_reason(reason) as i32),
        branch_name: string_field(&result, "branchName"),
    }))
}

fn fork_sync_status(value: &str) -> GitForkSyncStatus {
    match value {
        "blocked" => GitForkSyncStatus::Blocked,
        "up-to-date" => GitForkSyncStatus::UpToDate,
        "synced" => GitForkSyncStatus::Synced,
        _ => GitForkSyncStatus::Unspecified,
    }
}

fn fork_sync_block_reason(value: &str) -> GitForkSyncBlockReason {
    match value {
        "missing-origin" => GitForkSyncBlockReason::MissingOrigin,
        "missing-upstream" => GitForkSyncBlockReason::MissingUpstream,
        "upstream-mismatch" => GitForkSyncBlockReason::UpstreamMismatch,
        "missing-upstream-default-branch" => GitForkSyncBlockReason::MissingUpstreamDefaultBranch,
        "missing-origin-branch" => GitForkSyncBlockReason::MissingOriginBranch,
        "diverged" => GitForkSyncBlockReason::Diverged,
        _ => GitForkSyncBlockReason::Unspecified,
    }
}

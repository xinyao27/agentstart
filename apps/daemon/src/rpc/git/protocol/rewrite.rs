// Commit-graph rewriting and in-progress-operation resolution: cherry-pick,
// revert, drop, reset, rebase, merge, plus reading and aborting whichever of
// those is currently in progress. See
// packages/protocol/proto/yiru/runtime/v1/git_rewrite.proto (GitHistoryRewriteService).

use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    GitHistoryRewriteServiceAbortMergeRequest, GitHistoryRewriteServiceAbortMergeResponse,
    GitHistoryRewriteServiceAbortRebaseRequest, GitHistoryRewriteServiceAbortRebaseResponse,
    GitHistoryRewriteServiceAbortRevertRequest, GitHistoryRewriteServiceAbortRevertResponse,
    GitHistoryRewriteServiceCherryPickRequest, GitHistoryRewriteServiceCherryPickResponse,
    GitHistoryRewriteServiceConflictOperationRequest,
    GitHistoryRewriteServiceConflictOperationResponse, GitHistoryRewriteServiceDropCommitRequest,
    GitHistoryRewriteServiceDropCommitResponse, GitHistoryRewriteServiceMergeCommitRequest,
    GitHistoryRewriteServiceMergeCommitResponse, GitHistoryRewriteServiceRebaseFromBaseRequest,
    GitHistoryRewriteServiceRebaseFromBaseResponse,
    GitHistoryRewriteServiceRebaseOntoCommitRequest,
    GitHistoryRewriteServiceRebaseOntoCommitResponse, GitHistoryRewriteServiceResetToCommitRequest,
    GitHistoryRewriteServiceResetToCommitResponse, GitHistoryRewriteServiceRevertCommitRequest,
    GitHistoryRewriteServiceRevertCommitResponse, GitResetMode,
};
use yiru_protocol::transport::{decode, encode};

use super::super::GitRpc;
use super::support::{authority_status, conflict_operation, status, write_outcome};

pub(in crate::rpc) async fn conflict_operation_call(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryRewriteServiceConflictOperationRequest>(payload)?;
    let result = rpc
        .git
        .conflict_operation(&request.worktree)
        .await
        .map_err(authority_status)?;
    let operation = result
        .as_str()
        .map_or(0, |value| conflict_operation(value) as i32);
    Ok(encode(&GitHistoryRewriteServiceConflictOperationResponse {
        operation,
    }))
}

pub(in crate::rpc) async fn abort_merge(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryRewriteServiceAbortMergeRequest>(payload)?;
    rpc.git
        .abort_operation(&request.worktree, "merge")
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryRewriteServiceAbortMergeResponse {
        ok: true,
    }))
}

pub(in crate::rpc) async fn abort_rebase(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryRewriteServiceAbortRebaseRequest>(payload)?;
    rpc.git
        .abort_operation(&request.worktree, "rebase")
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryRewriteServiceAbortRebaseResponse {
        ok: true,
    }))
}

pub(in crate::rpc) async fn abort_revert(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryRewriteServiceAbortRevertRequest>(payload)?;
    rpc.git
        .abort_operation(&request.worktree, "revert")
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryRewriteServiceAbortRevertResponse {
        ok: true,
    }))
}

pub(in crate::rpc) async fn cherry_pick(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryRewriteServiceCherryPickRequest>(payload)?;
    let mainline = mainline_of(request.mainline)?;
    let result = rpc
        .git
        .cherry_pick(&request.worktree, &request.commit, mainline)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryRewriteServiceCherryPickResponse {
        outcome: Some(write_outcome(&result)),
    }))
}

pub(in crate::rpc) async fn revert_commit(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryRewriteServiceRevertCommitRequest>(payload)?;
    let mainline = mainline_of(request.mainline)?;
    let result = rpc
        .git
        .revert_commit(&request.worktree, &request.commit, mainline)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryRewriteServiceRevertCommitResponse {
        outcome: Some(write_outcome(&result)),
    }))
}

pub(in crate::rpc) async fn drop_commit(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryRewriteServiceDropCommitRequest>(payload)?;
    let result = rpc
        .git
        .drop_commit(&request.worktree, &request.commit)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryRewriteServiceDropCommitResponse {
        outcome: Some(write_outcome(&result)),
    }))
}

pub(in crate::rpc) async fn reset_to_commit(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryRewriteServiceResetToCommitRequest>(payload)?;
    let mode = match GitResetMode::try_from(request.mode) {
        Ok(GitResetMode::Soft) => "soft",
        Ok(GitResetMode::Mixed) => "mixed",
        Ok(GitResetMode::Hard) => "hard",
        _ => return Err(status(StatusCode::InvalidArgument, "mode is required")),
    };
    let result = rpc
        .git
        .reset_to_commit(&request.worktree, &request.commit, mode)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryRewriteServiceResetToCommitResponse {
        outcome: Some(write_outcome(&result)),
    }))
}

pub(in crate::rpc) async fn rebase_from_base(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryRewriteServiceRebaseFromBaseRequest>(payload)?;
    rpc.git
        .rebase_from_base(&request.worktree, &request.base_ref)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryRewriteServiceRebaseFromBaseResponse {
        ok: true,
    }))
}

pub(in crate::rpc) async fn rebase_onto_commit(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryRewriteServiceRebaseOntoCommitRequest>(payload)?;
    let result = rpc
        .git
        .rebase_onto(&request.worktree, &request.commit)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryRewriteServiceRebaseOntoCommitResponse {
        outcome: Some(write_outcome(&result)),
    }))
}

pub(in crate::rpc) async fn merge_commit(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryRewriteServiceMergeCommitRequest>(payload)?;
    let result = rpc
        .git
        .merge_commit(
            &request.worktree,
            &request.commit,
            request.no_ff,
            request.squash,
            request.message.as_deref(),
        )
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryRewriteServiceMergeCommitResponse {
        outcome: Some(write_outcome(&result)),
    }))
}

fn mainline_of(mainline: Option<u32>) -> Result<Option<u8>, Status> {
    mainline
        .map(|value| {
            u8::try_from(value)
                .map_err(|_| status(StatusCode::InvalidArgument, "mainline is out of range"))
        })
        .transpose()
}

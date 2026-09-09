// Branch/tag pointer mutation: switching branches, checking out a detached
// commit, creating a branch, and tagging a commit. See
// packages/protocol/proto/yiru/runtime/v1/git_branch.proto (GitBranchService).

use yiru_protocol::protocol::v1::Status;
use yiru_protocol::runtime::v1::{
    GitBranchServiceAddTagRequest, GitBranchServiceAddTagResponse,
    GitBranchServiceCheckoutCommitRequest, GitBranchServiceCheckoutCommitResponse,
    GitBranchServiceCheckoutRequest, GitBranchServiceCheckoutResponse,
    GitBranchServiceCreateBranchRequest, GitBranchServiceCreateBranchResponse,
};
use yiru_protocol::transport::{decode, encode};

use super::super::GitRpc;
use super::support::{authority_status, string_field, write_outcome};

pub(in crate::rpc) async fn checkout(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitBranchServiceCheckoutRequest>(payload)?;
    let result = rpc
        .git
        .checkout_branch(&request.worktree, &request.branch)
        .await
        .map_err(authority_status)?;
    let branch = string_field(&result, "branch").unwrap_or(request.branch);
    Ok(encode(&GitBranchServiceCheckoutResponse {
        ok: true,
        branch,
    }))
}

pub(in crate::rpc) async fn checkout_commit(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitBranchServiceCheckoutCommitRequest>(payload)?;
    let result = rpc
        .git
        .checkout_commit(&request.worktree, &request.commit)
        .await
        .map_err(authority_status)?;
    let commit = string_field(&result, "commit");
    Ok(encode(&GitBranchServiceCheckoutCommitResponse {
        outcome: Some(write_outcome(&result)),
        commit,
    }))
}

pub(in crate::rpc) async fn create_branch(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitBranchServiceCreateBranchRequest>(payload)?;
    let result = rpc
        .git
        .create_branch(
            &request.worktree,
            &request.commit,
            &request.name,
            request.checkout,
        )
        .await
        .map_err(authority_status)?;
    let branch = string_field(&result, "branch");
    let checked_out = result.get("checkedOut").and_then(|value| value.as_bool());
    Ok(encode(&GitBranchServiceCreateBranchResponse {
        outcome: Some(write_outcome(&result)),
        branch,
        checked_out,
    }))
}

pub(in crate::rpc) async fn add_tag(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitBranchServiceAddTagRequest>(payload)?;
    let result = rpc
        .git
        .add_tag(
            &request.worktree,
            &request.commit,
            &request.name,
            request.message.as_deref(),
            request.force,
        )
        .await
        .map_err(authority_status)?;
    let tag = string_field(&result, "tag");
    Ok(encode(&GitBranchServiceAddTagResponse {
        outcome: Some(write_outcome(&result)),
        tag,
    }))
}

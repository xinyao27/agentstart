// Read-only worktree inspection: working-tree status, blob diffs, submodule
// status, gitignore probing, and upstream/remote lookups. See
// packages/protocol/proto/agentstart/runtime/v1/git_status.proto (GitStatusService).

use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    GitStatusArea, GitStatusServiceCheckIgnoredRequest, GitStatusServiceCheckIgnoredResponse,
    GitStatusServiceDiffRequest, GitStatusServiceDiffResponse,
    GitStatusServiceFindHugeFoldersToIgnoreRequest,
    GitStatusServiceFindHugeFoldersToIgnoreResponse, GitStatusServiceLocalBranchesRequest,
    GitStatusServiceLocalBranchesResponse, GitStatusServiceRemoteCommitUrlRequest,
    GitStatusServiceRemoteCommitUrlResponse, GitStatusServiceStatusRequest,
    GitStatusServiceStatusResponse, GitStatusServiceSubmoduleStatusRequest,
    GitStatusServiceSubmoduleStatusResponse, GitStatusServiceUpstreamStatusRequest,
    GitStatusServiceUpstreamStatusResponse,
};
use agentstart_protocol::transport::{decode, encode};

use super::super::GitRpc;
use super::support::{authority_status, diff_result, push_target, upstream_status, working_status};

pub(in crate::rpc) async fn status(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStatusServiceStatusRequest>(payload)?;
    let result = rpc
        .git
        .working_status(
            &request.worktree,
            request.include_ignored,
            request.bypass_negative_cache,
            request.reuse_line_stats,
        )
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitStatusServiceStatusResponse {
        status: Some(working_status(&result)),
    }))
}

pub(in crate::rpc) async fn diff(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStatusServiceDiffRequest>(payload)?;
    let result = rpc
        .git
        .diff(
            &request.worktree,
            &request.file_path,
            request.staged,
            request.compare_against_head,
        )
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitStatusServiceDiffResponse {
        diff: Some(diff_result(&result)),
    }))
}

pub(in crate::rpc) async fn submodule_status(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStatusServiceSubmoduleStatusRequest>(payload)?;
    let area = match GitStatusArea::try_from(request.area) {
        Ok(GitStatusArea::Staged) => "staged",
        Ok(GitStatusArea::Untracked) => "untracked",
        _ => "unstaged",
    };
    let result = rpc
        .git
        .submodule_status(&request.worktree, &request.submodule_path, area)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitStatusServiceSubmoduleStatusResponse {
        status: Some(working_status(&result)),
    }))
}

pub(in crate::rpc) async fn check_ignored(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStatusServiceCheckIgnoredRequest>(payload)?;
    let result = rpc
        .git
        .check_ignored(&request.worktree, request.paths)
        .await
        .map_err(authority_status)?;
    let ignored_paths = result
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|value| value.as_str())
        .map(str::to_owned)
        .collect();
    Ok(encode(&GitStatusServiceCheckIgnoredResponse {
        ignored_paths,
    }))
}

pub(in crate::rpc) async fn find_huge_folders_to_ignore(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStatusServiceFindHugeFoldersToIgnoreRequest>(payload)?;
    let result = rpc
        .git
        .find_huge_folders(&request.worktree)
        .await
        .map_err(authority_status)?;
    let folders = result
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|value| value.as_str())
        .map(str::to_owned)
        .collect();
    Ok(encode(&GitStatusServiceFindHugeFoldersToIgnoreResponse {
        folders,
    }))
}

pub(in crate::rpc) async fn local_branches(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStatusServiceLocalBranchesRequest>(payload)?;
    let result = rpc
        .git
        .local_branches(&request.worktree)
        .await
        .map_err(authority_status)?;
    let current = result
        .get("current")
        .and_then(|value| value.as_str())
        .map(str::to_owned);
    let branches = result
        .get("branches")
        .and_then(|value| value.as_array())
        .into_iter()
        .flatten()
        .filter_map(|value| value.as_str())
        .map(str::to_owned)
        .collect();
    Ok(encode(&GitStatusServiceLocalBranchesResponse {
        current,
        branches,
    }))
}

pub(in crate::rpc) async fn upstream_status_call(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStatusServiceUpstreamStatusRequest>(payload)?;
    let target = push_target(request.push_target);
    let result = rpc
        .git
        .upstream_status(&request.worktree, target.as_ref())
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitStatusServiceUpstreamStatusResponse {
        upstream_status: Some(upstream_status(&result)),
    }))
}

pub(in crate::rpc) async fn remote_commit_url(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitStatusServiceRemoteCommitUrlRequest>(payload)?;
    let result = rpc
        .git
        .remote_commit_url(&request.worktree, &request.sha)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitStatusServiceRemoteCommitUrlResponse {
        url: result.as_str().map(str::to_owned),
    }))
}

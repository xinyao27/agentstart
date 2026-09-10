use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    GitHubMergeMethod, GitHubMutationResult, GitHubPrOpenState, GitHubServiceMergePrRequest,
    GitHubServiceMergePrResponse, GitHubServiceRemovePrReviewersRequest,
    GitHubServiceRemovePrReviewersResponse, GitHubServiceRequestPrReviewersRequest,
    GitHubServiceRequestPrReviewersResponse, GitHubServiceSetPrAutoMergeRequest,
    GitHubServiceSetPrAutoMergeResponse, GitHubServiceUpdatePrRequest,
    GitHubServiceUpdatePrResponse, GitHubServiceUpdatePrStateRequest,
    GitHubServiceUpdatePrStateResponse, GitHubServiceUpdatePrTitleRequest,
    GitHubServiceUpdatePrTitleResponse,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::Value;

use super::mapping;
use crate::rpc::github::GitHubRpc;

fn merge_method(method: GitHubMergeMethod) -> &'static str {
    match method {
        GitHubMergeMethod::Merge => "merge",
        GitHubMergeMethod::Rebase => "rebase",
        GitHubMergeMethod::Squash | GitHubMergeMethod::Unspecified => "squash",
    }
}

fn open_state(state: GitHubPrOpenState) -> &'static str {
    match state {
        GitHubPrOpenState::Closed => "closed",
        GitHubPrOpenState::Open | GitHubPrOpenState::Unspecified => "open",
    }
}

pub(super) fn mutation_result(raw: &Value) -> GitHubMutationResult {
    GitHubMutationResult {
        ok: raw.get("ok").and_then(Value::as_bool).unwrap_or(false),
        error: raw.get("error").and_then(Value::as_str).map(str::to_owned),
    }
}

pub(in crate::rpc) async fn update_pr_title(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceUpdatePrTitleRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .update_title(
            repo,
            request.pr_number,
            &request.title,
            mapping::repository_from_ref(request.pr_repo),
        )
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceUpdatePrTitleResponse {
        ok: value.as_bool().unwrap_or(false),
    }))
}

pub(in crate::rpc) async fn update_pr(rpc: &GitHubRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceUpdatePrRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .update_pr(
            repo,
            request.pr_number,
            request.title.as_deref(),
            request.body.as_deref(),
            mapping::repository_from_ref(request.pr_repo),
        )
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceUpdatePrResponse {
        result: Some(mutation_result(&value)),
    }))
}

pub(in crate::rpc) async fn update_pr_state(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceUpdatePrStateRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let state = open_state(request.state());
    let value = rpc
        .authority
        .update_state(repo, request.pr_number, state)
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceUpdatePrStateResponse {
        result: Some(mutation_result(&value)),
    }))
}

pub(in crate::rpc) async fn merge_pr(rpc: &GitHubRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceMergePrRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let method = merge_method(request.method());
    let value = rpc
        .authority
        .merge_pr(
            repo,
            request.pr_number,
            method,
            mapping::repository_from_ref(request.pr_repo),
        )
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceMergePrResponse {
        result: Some(mutation_result(&value)),
    }))
}

pub(in crate::rpc) async fn set_pr_auto_merge(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceSetPrAutoMergeRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let method = merge_method(request.method());
    let value = rpc
        .authority
        .set_auto_merge(
            repo,
            request.pr_number,
            request.enabled,
            method,
            mapping::repository_from_ref(request.pr_repo),
        )
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceSetPrAutoMergeResponse {
        result: Some(mutation_result(&value)),
    }))
}

pub(in crate::rpc) async fn request_pr_reviewers(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceRequestPrReviewersRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .reviewers(repo, request.pr_number, &request.reviewers, false)
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceRequestPrReviewersResponse {
        result: Some(mutation_result(&value)),
    }))
}

pub(in crate::rpc) async fn remove_pr_reviewers(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceRemovePrReviewersRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .reviewers(repo, request.pr_number, &request.reviewers, true)
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceRemovePrReviewersResponse {
        result: Some(mutation_result(&value)),
    }))
}

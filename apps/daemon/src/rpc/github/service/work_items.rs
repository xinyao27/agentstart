use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    GitHubPrBranchLookup, GitHubPrSummary, GitHubRefreshNoPr, GitHubRefreshOutcome,
    GitHubRefreshUpstreamError, GitHubServiceGetPrForBranchRequest,
    GitHubServiceGetPrForBranchResponse, GitHubServiceGetRepoSlugRequest,
    GitHubServiceGetRepoSlugResponse, GitHubServiceGetRepoUpstreamRequest,
    GitHubServiceGetRepoUpstreamResponse, GitHubServiceGetWorkItemByOwnerRepoRequest,
    GitHubServiceGetWorkItemByOwnerRepoResponse, GitHubServiceGetWorkItemRequest,
    GitHubServiceGetWorkItemResponse, GitHubServiceListAssignableUsersRequest,
    GitHubServiceListAssignableUsersResponse, GitHubServiceListLabelsRequest,
    GitHubServiceListLabelsResponse, GitHubServiceListWorkItemsRequest,
    GitHubServiceListWorkItemsResponse, GitHubServiceRefreshPrForBranchRequest,
    GitHubServiceRefreshPrForBranchResponse, GitHubWorkItem, git_hub_refresh_outcome,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::Value;

use crate::github::BranchLookup;

use super::mapping;
use crate::rpc::github::GitHubRpc;

pub(in crate::rpc) async fn get_repo_slug(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetRepoSlugRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .repo_slug(repo)
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceGetRepoSlugResponse {
        repo: mapping::repo_ref(Some(&value)),
    }))
}

pub(in crate::rpc) async fn get_repo_upstream(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetRepoUpstreamRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .repo_upstream(repo)
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceGetRepoUpstreamResponse {
        upstream: mapping::repo_ref(Some(&value)),
    }))
}

pub(in crate::rpc) async fn list_work_items(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceListWorkItemsRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .list_work_items(
            repo,
            request.limit,
            request.page.max(1),
            request.query.as_deref(),
        )
        .await
        .map_err(mapping::status_from_error)?;
    let items = value
        .get("items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(work_item)
        .collect();
    Ok(encode(&GitHubServiceListWorkItemsResponse {
        items,
        source: mapping::repo_ref(value.get("source")),
    }))
}

pub(in crate::rpc) async fn list_labels(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceListLabelsRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .list_labels(repo)
        .await
        .map_err(mapping::status_from_error)?;
    let labels = value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect();
    Ok(encode(&GitHubServiceListLabelsResponse { labels }))
}

pub(in crate::rpc) async fn list_assignable_users(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceListAssignableUsersRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .list_assignable_users(repo)
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceListAssignableUsersResponse {
        users: mapping::users(Some(&value)),
    }))
}

pub(in crate::rpc) async fn get_work_item(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetWorkItemRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .work_item(repo, request.number, None)
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceGetWorkItemResponse {
        item: work_item(&value),
    }))
}

pub(in crate::rpc) async fn get_work_item_by_owner_repo(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetWorkItemByOwnerRepoRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let owner_repo = request
        .owner_repo
        .ok_or_else(|| mapping::invalid("ownerRepo is required"))?;
    let value = rpc
        .authority
        .work_item(
            repo,
            request.number,
            mapping::repository_from_ref(Some(owner_repo)),
        )
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceGetWorkItemByOwnerRepoResponse {
        item: work_item(&value),
    }))
}

pub(in crate::rpc) async fn get_pr_for_branch(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetPrForBranchRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let lookup = branch_lookup(request.lookup.as_ref());
    let value = rpc
        .authority
        .pr_for_branch(repo, &request.branch, &lookup)
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceGetPrForBranchResponse {
        pr: pr_summary(&value),
    }))
}

pub(in crate::rpc) async fn refresh_pr_for_branch(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceRefreshPrForBranchRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let lookup = branch_lookup(request.lookup.as_ref());
    let value = rpc
        .authority
        .refresh_pr_for_branch(repo, &request.branch, &lookup)
        .await;
    Ok(encode(&GitHubServiceRefreshPrForBranchResponse {
        outcome: Some(refresh_outcome(&value)),
    }))
}

pub(super) fn branch_lookup(lookup: Option<&GitHubPrBranchLookup>) -> BranchLookup<'_> {
    let Some(lookup) = lookup else {
        return BranchLookup {
            linked: None,
            fallback: None,
            accept_merged_fallback: false,
            current_head_oid: None,
        };
    };
    BranchLookup {
        linked: lookup.linked_pr_number,
        fallback: lookup.fallback_pr_number,
        accept_merged_fallback: lookup.accept_merged_fallback_pr,
        current_head_oid: lookup.current_head_oid.as_deref(),
    }
}

pub(super) fn work_item(raw: &Value) -> Option<GitHubWorkItem> {
    if raw.is_null() {
        return None;
    }
    Some(GitHubWorkItem {
        id: raw
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        number: raw.get("number").and_then(Value::as_u64).unwrap_or(0),
        title: raw
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        state: mapping::pr_state(raw.get("state").and_then(Value::as_str).unwrap_or("open")) as i32,
        url: raw
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        labels: raw
            .get("labels")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        updated_at: raw
            .get("updatedAt")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        author: raw.get("author").and_then(Value::as_str).map(str::to_owned),
        author_avatar_url: raw
            .get("authorAvatarUrl")
            .and_then(Value::as_str)
            .map(str::to_owned),
        branch_name: raw
            .get("branchName")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        base_ref_name: raw
            .get("baseRefName")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        head_sha: raw
            .get("headSha")
            .and_then(Value::as_str)
            .map(str::to_owned),
        merge_state_status: raw
            .get("mergeStateStatus")
            .and_then(Value::as_str)
            .map(str::to_owned),
        additions: raw.get("additions").and_then(Value::as_u64),
        deletions: raw.get("deletions").and_then(Value::as_u64),
        changed_files: raw.get("changedFiles").and_then(Value::as_u64),
        review_decision: mapping::review_decision(raw.get("reviewDecision"))
            .map(|value| value as i32),
        review_requests: mapping::users(raw.get("reviewRequests")),
        latest_reviews: mapping::users(raw.get("latestReviews")),
        assignees: mapping::users(raw.get("assignees")),
        checks_summary: mapping::checks_summary(raw.get("checksSummary")),
        mergeable: raw
            .get("mergeable")
            .and_then(Value::as_str)
            .map(|value| mapping::mergeable(Some(value)) as i32),
        auto_merge_enabled: raw.get("autoMergeEnabled").and_then(Value::as_bool),
        auto_merge_allowed: raw.get("autoMergeAllowed").and_then(Value::as_bool),
        merge_queue_required: raw.get("mergeQueueRequired").and_then(Value::as_bool),
        merge_method_settings: mapping::merge_method_settings(raw.get("mergeMethodSettings")),
        maintainer_can_modify: raw.get("maintainerCanModify").and_then(Value::as_bool),
        pr_repo: mapping::repo_ref(raw.get("prRepo")),
        is_cross_repository: raw.get("isCrossRepository").and_then(Value::as_bool),
    })
}

pub(super) fn pr_summary(raw: &Value) -> Option<GitHubPrSummary> {
    if raw.is_null() {
        return None;
    }
    Some(GitHubPrSummary {
        number: raw.get("number").and_then(Value::as_u64).unwrap_or(0),
        title: raw
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        state: mapping::pr_state(raw.get("state").and_then(Value::as_str).unwrap_or("open")) as i32,
        url: raw
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        updated_at: raw
            .get("updatedAt")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        checks_status: mapping::checks_state(
            raw.get("checksStatus")
                .and_then(Value::as_str)
                .unwrap_or("pending"),
        ) as i32,
        mergeable: mapping::mergeable(raw.get("mergeable").and_then(Value::as_str)) as i32,
        head_ref_name: raw
            .get("headRefName")
            .and_then(Value::as_str)
            .map(str::to_owned),
        review_decision: mapping::review_decision(raw.get("reviewDecision"))
            .map(|value| value as i32),
        auto_merge_enabled: raw.get("autoMergeEnabled").and_then(Value::as_bool),
        auto_merge_allowed: raw.get("autoMergeAllowed").and_then(Value::as_bool),
        merge_queue_required: raw.get("mergeQueueRequired").and_then(Value::as_bool),
        merge_method_settings: mapping::merge_method_settings(raw.get("mergeMethodSettings")),
        merge_state_status: raw
            .get("mergeStateStatus")
            .and_then(Value::as_str)
            .map(str::to_owned),
        head_sha: raw
            .get("headSha")
            .and_then(Value::as_str)
            .map(str::to_owned),
        base_ref_name: raw
            .get("baseRefName")
            .and_then(Value::as_str)
            .map(str::to_owned),
        pr_repo: mapping::repo_ref(raw.get("prRepo")),
        head_repo: mapping::repo_ref(raw.get("headRepo")),
        confirmed_contained_head_oid: raw
            .get("confirmedContainedHeadOid")
            .and_then(Value::as_str)
            .map(str::to_owned),
        head_diverged_from_merged_pr_at_oid: raw
            .get("headDivergedFromMergedPRAtOid")
            .and_then(Value::as_str)
            .map(str::to_owned),
        conflict_summary: mapping::conflict_summary(raw.get("conflictSummary")),
    })
}

pub(super) fn refresh_outcome(raw: &Value) -> GitHubRefreshOutcome {
    let fetched_at_ms = raw.get("fetchedAt").and_then(Value::as_f64).unwrap_or(0.0);
    let result = match raw.get("kind").and_then(Value::as_str) {
        Some("found") => pr_summary(raw.get("pr").unwrap_or(&Value::Null))
            .map(git_hub_refresh_outcome::Result::Found),
        Some("upstream-error") => Some(git_hub_refresh_outcome::Result::UpstreamError(
            GitHubRefreshUpstreamError {
                error_type: raw
                    .get("errorType")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned(),
                message: raw
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned(),
            },
        )),
        _ => Some(git_hub_refresh_outcome::Result::NoPr(GitHubRefreshNoPr {})),
    };
    GitHubRefreshOutcome {
        fetched_at_ms,
        result,
    }
}

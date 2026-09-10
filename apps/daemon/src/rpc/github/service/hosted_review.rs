use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    GitHubCommentDraftKind, GitHubHostedReviewBlockedReason, GitHubHostedReviewNextAction,
    GitHubHostedReviewProvider, GitHubHostedReviewSummary, GitHubServiceCreateCommentDraftRequest,
    GitHubServiceCreateCommentDraftResponse, GitHubServiceCreateHostedReviewRequest,
    GitHubServiceCreateHostedReviewResponse,
    GitHubServiceGetHostedReviewCreationEligibilityRequest,
    GitHubServiceGetHostedReviewCreationEligibilityResponse,
    GitHubServiceGetHostedReviewForBranchRequest, GitHubServiceGetHostedReviewForBranchResponse,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::Value;

use crate::github::{CreateHostedReview, HostedReviewEligibility};

use super::mapping;
use super::work_items::{branch_lookup, pr_summary};
use crate::rpc::github::GitHubRpc;

fn comment_draft_kind(kind: GitHubCommentDraftKind) -> &'static str {
    match kind {
        GitHubCommentDraftKind::Issue | GitHubCommentDraftKind::Unspecified => "issue",
        GitHubCommentDraftKind::PullRequest => "pull-request",
    }
}

pub(in crate::rpc) async fn create_comment_draft(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceCreateCommentDraftRequest>(payload)?;
    if request.project_id.is_empty() {
        return Err(mapping::invalid("projectId is required"));
    }
    let kind = comment_draft_kind(request.kind());
    let value = rpc
        .authority
        .comment_draft(
            &request.project_id,
            kind,
            request.number,
            &request.page_url,
            &request.page_context,
        )
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceCreateCommentDraftResponse {
        draft: value
            .get("draft")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        generated_at_ms: value
            .get("generatedAt")
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
    }))
}

pub(in crate::rpc) async fn get_hosted_review_for_branch(
    rpc: &GitHubRpc,
    payload: &[u8],
    record_stats: bool,
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetHostedReviewForBranchRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let lookup = branch_lookup(request.lookup.as_ref());
    let value = rpc
        .authority
        .hosted_review_for_branch(repo, &request.branch, &lookup, record_stats)
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceGetHostedReviewForBranchResponse {
        review: pr_summary(&value),
    }))
}

pub(in crate::rpc) async fn get_hosted_review_creation_eligibility(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetHostedReviewCreationEligibilityRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .hosted_review_eligibility(&HostedReviewEligibility {
            repo,
            worktree: request.worktree.as_deref(),
            branch: &request.branch,
            base: request.base.as_deref(),
            dirty: request.has_uncommitted_changes,
            has_upstream: request.has_upstream,
            ahead: request.ahead,
            behind: request.behind,
            linked: request.linked_github_pr,
            fallback: request.fallback_github_pr,
        })
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(
        &GitHubServiceGetHostedReviewCreationEligibilityResponse {
            provider: provider(value.get("provider").and_then(Value::as_str)) as i32,
            review: value.get("review").and_then(review_summary),
            default_base_ref: value
                .get("defaultBaseRef")
                .and_then(Value::as_str)
                .map(str::to_owned),
            head: value.get("head").and_then(Value::as_str).map(str::to_owned),
            can_create: value
                .get("canCreate")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            blocked_reason: blocked_reason(value.get("blockedReason").and_then(Value::as_str))
                as i32,
            next_action: next_action(value.get("nextAction").and_then(Value::as_str)) as i32,
        },
    ))
}

pub(in crate::rpc) async fn create_hosted_review(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceCreateHostedReviewRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let provider_str = match request.provider() {
        GitHubHostedReviewProvider::Github => "github",
        GitHubHostedReviewProvider::Unsupported | GitHubHostedReviewProvider::Unspecified => {
            "unsupported"
        }
    };
    let value = rpc
        .authority
        .create_hosted_review(&CreateHostedReview {
            repo,
            worktree: request.worktree.as_deref(),
            provider: provider_str,
            base: &request.base,
            head: request.head.as_deref(),
            title: &request.title,
            body: request.body.as_deref(),
            draft: request.draft,
            use_template: request.use_template,
        })
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceCreateHostedReviewResponse {
        ok: value.get("ok").and_then(Value::as_bool).unwrap_or(false),
        code: value.get("code").and_then(Value::as_str).map(str::to_owned),
        error: value
            .get("error")
            .and_then(Value::as_str)
            .map(str::to_owned),
        number: value.get("number").and_then(Value::as_u64),
        url: value.get("url").and_then(Value::as_str).map(str::to_owned),
        existing_review: value.get("existingReview").and_then(review_summary),
    }))
}

fn review_summary(raw: &Value) -> Option<GitHubHostedReviewSummary> {
    if raw.is_null() {
        return None;
    }
    Some(GitHubHostedReviewSummary {
        number: raw.get("number").and_then(Value::as_u64).unwrap_or(0),
        url: raw
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
    })
}

fn provider(raw: Option<&str>) -> GitHubHostedReviewProvider {
    match raw {
        Some("github") => GitHubHostedReviewProvider::Github,
        Some("unsupported") => GitHubHostedReviewProvider::Unsupported,
        _ => GitHubHostedReviewProvider::Unspecified,
    }
}

fn blocked_reason(raw: Option<&str>) -> GitHubHostedReviewBlockedReason {
    match raw {
        Some("detached_head") => GitHubHostedReviewBlockedReason::DetachedHead,
        Some("existing_review") => GitHubHostedReviewBlockedReason::ExistingReview,
        Some("unsupported_provider") => GitHubHostedReviewBlockedReason::UnsupportedProvider,
        Some("default_branch") => GitHubHostedReviewBlockedReason::DefaultBranch,
        Some("dirty") => GitHubHostedReviewBlockedReason::Dirty,
        Some("no_upstream") => GitHubHostedReviewBlockedReason::NoUpstream,
        Some("needs_sync") => GitHubHostedReviewBlockedReason::NeedsSync,
        Some("auth_required") => GitHubHostedReviewBlockedReason::AuthRequired,
        Some("needs_push") => GitHubHostedReviewBlockedReason::NeedsPush,
        _ => GitHubHostedReviewBlockedReason::Unspecified,
    }
}

fn next_action(raw: Option<&str>) -> GitHubHostedReviewNextAction {
    match raw {
        Some("open_existing_review") => GitHubHostedReviewNextAction::OpenExistingReview,
        Some("commit") => GitHubHostedReviewNextAction::Commit,
        Some("publish") => GitHubHostedReviewNextAction::Publish,
        Some("sync") => GitHubHostedReviewNextAction::Sync,
        Some("authenticate") => GitHubHostedReviewNextAction::Authenticate,
        Some("push") => GitHubHostedReviewNextAction::Push,
        _ => GitHubHostedReviewNextAction::Unspecified,
    }
}

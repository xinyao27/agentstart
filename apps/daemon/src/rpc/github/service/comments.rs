use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    GitHubComment, GitHubCommentReaction, GitHubCommentResult, GitHubFileStatus,
    GitHubReactionContent, GitHubServiceAddPrCommentRequest, GitHubServiceAddPrCommentResponse,
    GitHubServiceAddPrReviewCommentReplyRequest, GitHubServiceAddPrReviewCommentReplyResponse,
    GitHubServiceAddPrReviewCommentRequest, GitHubServiceAddPrReviewCommentResponse,
    GitHubServiceGetPrCommentsRequest, GitHubServiceGetPrCommentsResponse,
    GitHubServiceGetPrFileContentsRequest, GitHubServiceGetPrFileContentsResponse,
    GitHubServiceResolveReviewThreadRequest, GitHubServiceResolveReviewThreadResponse,
    GitHubServiceSetPrFileViewedRequest, GitHubServiceSetPrFileViewedResponse,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::Value;

use crate::github::{ReviewComment, ReviewReply};

use super::mapping;
use crate::rpc::github::GitHubRpc;

pub(in crate::rpc) async fn get_pr_comments(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetPrCommentsRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .pr_comments(
            repo,
            request.pr_number,
            mapping::repository_from_ref(request.pr_repo),
            request.no_cache,
        )
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceGetPrCommentsResponse {
        comments: comments(&value),
    }))
}

pub(in crate::rpc) async fn add_pr_comment(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceAddPrCommentRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .add_pr_comment(
            repo,
            request.number,
            &request.body,
            mapping::repository_from_ref(request.pr_repo),
        )
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceAddPrCommentResponse {
        result: Some(comment_result(&value)),
    }))
}

pub(in crate::rpc) async fn add_pr_review_comment(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceAddPrReviewCommentRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .add_review_comment(&ReviewComment {
            repo,
            number: request.pr_number,
            commit_id: &request.commit_id,
            path: &request.path,
            line: request.line,
            start_line: request.start_line,
            body: &request.body,
        })
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceAddPrReviewCommentResponse {
        result: Some(comment_result(&value)),
    }))
}

pub(in crate::rpc) async fn add_pr_review_comment_reply(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceAddPrReviewCommentReplyRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .add_review_reply(&ReviewReply {
            repo,
            number: request.pr_number,
            comment_id: request.comment_id,
            body: &request.body,
            thread_id: request.thread_id.as_deref(),
            path: request.path.as_deref(),
            line: request.line,
            repository: mapping::repository_from_ref(request.pr_repo),
        })
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceAddPrReviewCommentReplyResponse {
        result: Some(comment_result(&value)),
    }))
}

pub(in crate::rpc) async fn resolve_review_thread(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceResolveReviewThreadRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .resolve_thread(repo, &request.thread_id, request.resolve)
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceResolveReviewThreadResponse {
        ok: value.as_bool().unwrap_or(false),
    }))
}

pub(in crate::rpc) async fn set_pr_file_viewed(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceSetPrFileViewedRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .set_file_viewed(
            repo,
            &request.pull_request_id,
            &request.path,
            request.viewed,
        )
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceSetPrFileViewedResponse {
        ok: value.as_bool().unwrap_or(false),
    }))
}

pub(in crate::rpc) async fn get_pr_file_contents(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetPrFileContentsRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let status = file_status_str(request.status());
    let value = rpc
        .authority
        .pr_file_contents(
            repo,
            &request.path,
            request.old_path.as_deref(),
            status,
            &request.head_sha,
            &request.base_sha,
        )
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceGetPrFileContentsResponse {
        original: value
            .get("original")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        modified: value
            .get("modified")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        original_is_binary: value
            .get("originalIsBinary")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        modified_is_binary: value
            .get("modifiedIsBinary")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        original_too_large: value
            .get("originalTooLarge")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        modified_too_large: value
            .get("modifiedTooLarge")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }))
}

fn file_status_str(status: GitHubFileStatus) -> &'static str {
    match status {
        GitHubFileStatus::Added => "added",
        GitHubFileStatus::Removed => "removed",
        GitHubFileStatus::Renamed => "renamed",
        GitHubFileStatus::Copied => "copied",
        GitHubFileStatus::Changed => "changed",
        GitHubFileStatus::Unchanged => "unchanged",
        GitHubFileStatus::Modified | GitHubFileStatus::Unspecified => "modified",
    }
}

fn reaction_content(raw: &str) -> Option<GitHubReactionContent> {
    Some(match raw {
        "+1" => GitHubReactionContent::ThumbsUp,
        "-1" => GitHubReactionContent::ThumbsDown,
        "laugh" => GitHubReactionContent::Laugh,
        "confused" => GitHubReactionContent::Confused,
        "heart" => GitHubReactionContent::Heart,
        "hooray" => GitHubReactionContent::Hooray,
        "rocket" => GitHubReactionContent::Rocket,
        "eyes" => GitHubReactionContent::Eyes,
        _ => return None,
    })
}

pub(super) fn comment(raw: &Value) -> GitHubComment {
    GitHubComment {
        id: raw.get("id").and_then(Value::as_u64).unwrap_or(0),
        author: raw
            .get("author")
            .and_then(Value::as_str)
            .unwrap_or("ghost")
            .to_owned(),
        author_avatar_url: raw
            .get("authorAvatarUrl")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        body: raw
            .get("body")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        created_at: raw
            .get("createdAt")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        url: raw
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        is_bot: raw.get("isBot").and_then(Value::as_bool).unwrap_or(false),
        path: raw.get("path").and_then(Value::as_str).map(str::to_owned),
        line: raw.get("line").and_then(Value::as_u64),
        start_line: raw.get("startLine").and_then(Value::as_u64),
        is_outdated: raw.get("isOutdated").and_then(Value::as_bool),
        thread_id: raw
            .get("threadId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        is_resolved: raw.get("isResolved").and_then(Value::as_bool),
        reactions: raw
            .get("reactions")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|value| {
                let content = reaction_content(value.get("content").and_then(Value::as_str)?)?;
                Some(GitHubCommentReaction {
                    content: content as i32,
                    count: value.get("count").and_then(Value::as_u64).unwrap_or(0),
                })
            })
            .collect(),
    }
}

pub(super) fn comments(raw: &Value) -> Vec<GitHubComment> {
    raw.as_array().into_iter().flatten().map(comment).collect()
}

pub(super) fn comment_result(raw: &Value) -> GitHubCommentResult {
    GitHubCommentResult {
        ok: raw.get("ok").and_then(Value::as_bool).unwrap_or(false),
        error: raw.get("error").and_then(Value::as_str).map(str::to_owned),
        comment: raw.get("comment").map(comment),
    }
}

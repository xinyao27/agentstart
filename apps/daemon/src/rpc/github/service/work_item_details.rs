use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    GitHubFileEntry, GitHubFileStatus, GitHubFileViewedState,
    GitHubServiceGetWorkItemDetailsRequest, GitHubServiceGetWorkItemDetailsResponse,
    GitHubWorkItemDetails,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::Value;

use super::checks::check_entry;
use super::comments::comments;
use super::mapping;
use super::work_items::work_item;
use crate::rpc::github::GitHubRpc;

pub(in crate::rpc) async fn get_work_item_details(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetWorkItemDetailsRequest>(payload)?;
    let repo = mapping::required_repo(&request.repo)?;
    let value = rpc
        .authority
        .work_item_details(repo, request.number)
        .await
        .map_err(mapping::status_from_error)?;
    Ok(encode(&GitHubServiceGetWorkItemDetailsResponse {
        details: details(&value),
    }))
}

fn file_status(raw: Option<&str>) -> GitHubFileStatus {
    match raw {
        Some("added") => GitHubFileStatus::Added,
        Some("removed") => GitHubFileStatus::Removed,
        Some("renamed") => GitHubFileStatus::Renamed,
        Some("copied") => GitHubFileStatus::Copied,
        Some("changed") => GitHubFileStatus::Changed,
        Some("unchanged") => GitHubFileStatus::Unchanged,
        _ => GitHubFileStatus::Modified,
    }
}

fn viewed_state(raw: Option<&str>) -> GitHubFileViewedState {
    match raw {
        Some("VIEWED") => GitHubFileViewedState::Viewed,
        Some("DISMISSED") => GitHubFileViewedState::Dismissed,
        _ => GitHubFileViewedState::Unviewed,
    }
}

fn file_entry(raw: &Value) -> GitHubFileEntry {
    GitHubFileEntry {
        path: raw
            .get("path")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        old_path: raw
            .get("oldPath")
            .and_then(Value::as_str)
            .map(str::to_owned),
        status: file_status(raw.get("status").and_then(Value::as_str)) as i32,
        additions: raw.get("additions").and_then(Value::as_u64).unwrap_or(0),
        deletions: raw.get("deletions").and_then(Value::as_u64).unwrap_or(0),
        is_binary: raw
            .get("isBinary")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        review_comment_line_numbers: raw
            .get("reviewCommentLineNumbers")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_u64)
            .collect(),
        viewed_state: viewed_state(raw.get("viewerViewedState").and_then(Value::as_str)) as i32,
    }
}

fn details(raw: &Value) -> Option<GitHubWorkItemDetails> {
    if raw.is_null() {
        return None;
    }
    Some(GitHubWorkItemDetails {
        item: work_item(raw.get("item").unwrap_or(&Value::Null)),
        body: raw
            .get("body")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        comments: comments(raw.get("comments").unwrap_or(&Value::Null)),
        head_sha: raw
            .get("headSha")
            .and_then(Value::as_str)
            .map(str::to_owned),
        base_sha: raw
            .get("baseSha")
            .and_then(Value::as_str)
            .map(str::to_owned),
        pull_request_id: raw
            .get("pullRequestId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        checks: raw
            .get("checks")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(check_entry)
            .collect(),
        files: raw
            .get("files")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(file_entry)
            .collect(),
        files_unavailable: raw
            .get("filesUnavailable")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        participants: mapping::users(raw.get("participants")),
        assignees: raw
            .get("assignees")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
    })
}

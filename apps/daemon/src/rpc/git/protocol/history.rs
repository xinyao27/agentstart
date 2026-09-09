// Read-only commit history and ref-to-ref / commit-to-parent comparison. See
// packages/protocol/proto/yiru/runtime/v1/git_history.proto (GitHistoryService).

use serde_json::Value;

use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    GitChangeEntry, GitChangeStatus, GitCommitHistoryItem, GitCompareResult, GitCompareStatus,
    GitCompareSummary, GitHistoryRefScope, GitHistoryServiceBranchCompareRequest,
    GitHistoryServiceBranchCompareResponse, GitHistoryServiceBranchDiffRequest,
    GitHistoryServiceBranchDiffResponse, GitHistoryServiceCommitCompareRequest,
    GitHistoryServiceCommitCompareResponse, GitHistoryServiceCommitDiffRequest,
    GitHistoryServiceCommitDiffResponse, GitHistoryServiceHistoryRequest,
    GitHistoryServiceHistoryResponse, GitRefCategory, GitRefEntry,
};
use yiru_protocol::transport::{decode, encode};

use super::super::GitRpc;
use super::support::{authority_status, diff_result, status, string_field};

const HISTORY_LIMIT_DEFAULT: u32 = 50;
const HISTORY_LIMIT_MIN: u32 = 1;
const HISTORY_LIMIT_MAX: u32 = 200;

// git.rs's mobile-only truncation of branchCompare entries: not part of
// GitAuthority::branch_compare, applied at the protocol boundary the same
// way the legacy dispatch applied it for mobile callers.
const BRANCH_COMPARE_MOBILE_LIMIT: usize = 20_000;

pub(in crate::rpc) async fn history(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryServiceHistoryRequest>(payload)?;
    let limit = match request.limit {
        Some(limit) if (HISTORY_LIMIT_MIN..=HISTORY_LIMIT_MAX).contains(&limit) => limit,
        Some(_) => {
            return Err(status(
                StatusCode::InvalidArgument,
                "limit must be between 1 and 200",
            ));
        }
        None => HISTORY_LIMIT_DEFAULT,
    };
    let ref_scope = match GitHistoryRefScope::try_from(request.ref_scope) {
        Ok(GitHistoryRefScope::All) => "all",
        _ => "head",
    };
    let result = rpc
        .git
        .history(
            &request.worktree,
            limit as usize,
            request.skip.unwrap_or(0) as usize,
            request.base_ref.as_deref(),
            ref_scope,
            request.include_remote_branches.unwrap_or(true),
        )
        .await
        .map_err(authority_status)?;
    let items = result
        .get("items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(commit_history_item)
        .collect();
    Ok(encode(&GitHistoryServiceHistoryResponse {
        items,
        current_ref: result.get("currentRef").map(ref_entry),
        remote_ref: result.get("remoteRef").map(ref_entry),
        base_ref: result.get("baseRef").map(ref_entry),
        merge_base: string_field(&result, "mergeBase"),
        has_incoming_changes: bool_field(&result, "hasIncomingChanges"),
        has_outgoing_changes: bool_field(&result, "hasOutgoingChanges"),
        has_more: bool_field(&result, "hasMore"),
        limit: result.get("limit").and_then(Value::as_u64).unwrap_or(0) as u32,
    }))
}

pub(in crate::rpc) async fn branch_compare(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryServiceBranchCompareRequest>(payload)?;
    let result = rpc
        .git
        .branch_compare(&request.worktree, &request.base_ref)
        .await
        .map_err(authority_status)?;
    let mut compare = compare_result(&result);
    let did_hit_limit = compare.entries.len() > BRANCH_COMPARE_MOBILE_LIMIT;
    if did_hit_limit {
        compare.entries.truncate(BRANCH_COMPARE_MOBILE_LIMIT);
    }
    Ok(encode(&GitHistoryServiceBranchCompareResponse {
        compare: Some(compare),
        did_hit_limit,
    }))
}

pub(in crate::rpc) async fn branch_diff(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryServiceBranchDiffRequest>(payload)?;
    let result = rpc
        .git
        .branch_diff(
            &request.worktree,
            &request.merge_base,
            &request.head_oid,
            &request.file_path,
            request.old_path.as_deref(),
        )
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryServiceBranchDiffResponse {
        diff: Some(diff_result(&result)),
    }))
}

pub(in crate::rpc) async fn commit_compare(
    rpc: &GitRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryServiceCommitCompareRequest>(payload)?;
    let result = rpc
        .git
        .commit_compare(&request.worktree, &request.commit_id)
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryServiceCommitCompareResponse {
        compare: Some(compare_result(&result)),
    }))
}

pub(in crate::rpc) async fn commit_diff(rpc: &GitRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHistoryServiceCommitDiffRequest>(payload)?;
    let result = rpc
        .git
        .commit_diff(
            &request.worktree,
            &request.commit_oid,
            request.parent_oid.as_deref(),
            &request.file_path,
            request.old_path.as_deref(),
        )
        .await
        .map_err(authority_status)?;
    Ok(encode(&GitHistoryServiceCommitDiffResponse {
        diff: Some(diff_result(&result)),
    }))
}

fn commit_history_item(value: &Value) -> GitCommitHistoryItem {
    GitCommitHistoryItem {
        id: string_field(value, "id").unwrap_or_default(),
        parent_ids: value
            .get("parentIds")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        subject: string_field(value, "subject").unwrap_or_default(),
        message: string_field(value, "message").unwrap_or_default(),
        display_id: string_field(value, "displayId").unwrap_or_default(),
        author: string_field(value, "author"),
        author_email: string_field(value, "authorEmail"),
        timestamp_ms: value.get("timestamp").and_then(Value::as_i64),
        references: value
            .get("references")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(ref_entry)
            .collect(),
    }
}

fn ref_entry(value: &Value) -> GitRefEntry {
    GitRefEntry {
        id: string_field(value, "id").unwrap_or_default(),
        name: string_field(value, "name").unwrap_or_default(),
        revision: string_field(value, "revision").unwrap_or_default(),
        category: value
            .get("category")
            .and_then(Value::as_str)
            .map_or(GitRefCategory::Unspecified, ref_category) as i32,
        remote_name: string_field(value, "remoteName"),
        is_checked_out: value.get("isCheckedOut").and_then(Value::as_bool),
    }
}

fn ref_category(value: &str) -> GitRefCategory {
    match value {
        "branches" => GitRefCategory::Branch,
        "remote branches" => GitRefCategory::RemoteBranch,
        "tags" => GitRefCategory::Tag,
        "head" => GitRefCategory::Head,
        _ => GitRefCategory::Commit,
    }
}

fn compare_result(value: &Value) -> GitCompareResult {
    GitCompareResult {
        summary: value.get("summary").map(compare_summary),
        entries: value
            .get("entries")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(change_entry)
            .collect(),
    }
}

fn compare_summary(value: &Value) -> GitCompareSummary {
    GitCompareSummary {
        base_ref: string_field(value, "baseRef").unwrap_or_default(),
        base_oid: string_field(value, "baseOid"),
        compare_ref: string_field(value, "compareRef").unwrap_or_default(),
        head_oid: string_field(value, "headOid"),
        merge_base: string_field(value, "mergeBase"),
        changed_files: value
            .get("changedFiles")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        status: value
            .get("status")
            .and_then(Value::as_str)
            .map_or(GitCompareStatus::Unspecified, compare_status) as i32,
        error_message: string_field(value, "errorMessage"),
        commits_ahead: value.get("commitsAhead").and_then(Value::as_u64),
        commit_oid: string_field(value, "commitOid"),
        parent_oid: string_field(value, "parentOid"),
    }
}

fn compare_status(value: &str) -> GitCompareStatus {
    match value {
        "ready" => GitCompareStatus::Ready,
        "error" => GitCompareStatus::Error,
        "unborn-head" => GitCompareStatus::UnbornHead,
        "invalid-base" => GitCompareStatus::InvalidBase,
        "no-merge-base" => GitCompareStatus::NoMergeBase,
        "invalid-commit" => GitCompareStatus::InvalidCommit,
        _ => GitCompareStatus::Unspecified,
    }
}

fn change_entry(value: &Value) -> GitChangeEntry {
    GitChangeEntry {
        path: string_field(value, "path").unwrap_or_default(),
        status: value
            .get("status")
            .and_then(Value::as_str)
            .map_or(GitChangeStatus::Unspecified, change_status) as i32,
        old_path: string_field(value, "oldPath"),
        added: value.get("added").and_then(Value::as_u64),
        removed: value.get("removed").and_then(Value::as_u64),
    }
}

fn change_status(value: &str) -> GitChangeStatus {
    match value {
        "added" => GitChangeStatus::Added,
        "deleted" => GitChangeStatus::Deleted,
        "renamed" => GitChangeStatus::Renamed,
        "copied" => GitChangeStatus::Copied,
        "untracked" => GitChangeStatus::Untracked,
        _ => GitChangeStatus::Modified,
    }
}

fn bool_field(value: &Value, field: &str) -> bool {
    value.get(field).and_then(Value::as_bool).unwrap_or(false)
}

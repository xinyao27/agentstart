// Shared conversions between GitAuthority's serde_json::Value results and the
// typed git_common.proto messages, so every git/protocol/*.rs handler builds
// the same wire shapes from the same JSON fields instead of drifting apart.

use serde_json::Value;

use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    GitBlockedReason, GitChangeStatus, GitConflictKind, GitConflictOperation, GitDiffKind,
    GitDiffLimitReason, GitDiffLineCounts, GitDiffLineCountsAreMinimum, GitDiffRenderLimit,
    GitDiffRenderLimits, GitDiffResult, GitPushTarget as ProtoGitPushTarget, GitStatusArea,
    GitStatusEntry, GitSubmoduleChange, GitUpstreamStatus, GitWorkingStatus, GitWriteOutcome,
    GitWriteStatus,
};

use crate::git::{GitAuthorityError, GitPushTarget};

pub(super) fn status(code: StatusCode, message: impl Into<String>) -> Status {
    Status {
        code: code as i32,
        message: message.into(),
        details: Vec::new(),
    }
}

// Mirrors the legacy dispatch's mapping in src/rpc/git.rs before this
// namespace moved to protobuf: InvalidInput is the caller's fault, every
// other authority error is a runtime failure.
pub(super) fn authority_status(error: GitAuthorityError) -> Status {
    match error {
        GitAuthorityError::InvalidInput(message) => status(StatusCode::InvalidArgument, message),
        other => status(StatusCode::Internal, other.to_string()),
    }
}

pub(super) fn push_target(target: Option<ProtoGitPushTarget>) -> Option<GitPushTarget> {
    target.map(|target| GitPushTarget {
        branch_name: target.branch_name,
        remote_name: target.remote_name,
        remote_url: target.remote_url,
    })
}

pub(super) fn conflict_operation(value: &str) -> GitConflictOperation {
    match value {
        "merge" => GitConflictOperation::Merge,
        "rebase" => GitConflictOperation::Rebase,
        "cherry-pick" => GitConflictOperation::CherryPick,
        "revert" => GitConflictOperation::Revert,
        _ => GitConflictOperation::Unspecified,
    }
}

pub(super) fn working_status(value: &Value) -> GitWorkingStatus {
    GitWorkingStatus {
        entries: value
            .get("entries")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(status_entry)
            .collect(),
        conflict_operation: value
            .get("conflictOperation")
            .and_then(Value::as_str)
            .map_or(GitConflictOperation::Unspecified, conflict_operation)
            as i32,
        upstream_status: value.get("upstreamStatus").map(upstream_status),
        head: string_field(value, "head"),
        branch: string_field(value, "branch"),
        ignored_paths: value
            .get("ignoredPaths")
            .and_then(Value::as_array)
            .map(|entries| {
                entries
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        did_hit_limit: value.get("didHitLimit").and_then(Value::as_bool),
        status_length: value.get("statusLength").and_then(Value::as_u64),
    }
}

fn status_entry(value: &Value) -> GitStatusEntry {
    GitStatusEntry {
        path: string_field(value, "path").unwrap_or_default(),
        status: value
            .get("status")
            .and_then(Value::as_str)
            .map_or(GitChangeStatus::Unspecified, change_status) as i32,
        area: value
            .get("area")
            .and_then(Value::as_str)
            .map_or(GitStatusArea::Unspecified, status_area) as i32,
        old_path: string_field(value, "oldPath"),
        submodule: value.get("submodule").map(|value| GitSubmoduleChange {
            commit_changed: bool_field(value, "commitChanged"),
            tracked_changes: bool_field(value, "trackedChanges"),
            untracked_changes: bool_field(value, "untrackedChanges"),
        }),
        conflict_kind: value
            .get("conflictKind")
            .and_then(Value::as_str)
            .map(conflict_kind)
            .map(|kind| kind as i32),
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

fn status_area(value: &str) -> GitStatusArea {
    match value {
        "staged" => GitStatusArea::Staged,
        "untracked" => GitStatusArea::Untracked,
        _ => GitStatusArea::Unstaged,
    }
}

fn conflict_kind(value: &str) -> GitConflictKind {
    match value {
        "both_modified" => GitConflictKind::BothModified,
        "both_added" => GitConflictKind::BothAdded,
        "both_deleted" => GitConflictKind::BothDeleted,
        "added_by_us" => GitConflictKind::AddedByUs,
        "added_by_them" => GitConflictKind::AddedByThem,
        "deleted_by_us" => GitConflictKind::DeletedByUs,
        "deleted_by_them" => GitConflictKind::DeletedByThem,
        _ => GitConflictKind::Unspecified,
    }
}

pub(super) fn upstream_status(value: &Value) -> GitUpstreamStatus {
    GitUpstreamStatus {
        has_upstream: bool_field(value, "hasUpstream"),
        upstream_name: string_field(value, "upstreamName"),
        ahead: value.get("ahead").and_then(Value::as_u64).unwrap_or(0),
        behind: value.get("behind").and_then(Value::as_u64).unwrap_or(0),
        has_configured_push_target: value
            .get("hasConfiguredPushTarget")
            .and_then(Value::as_bool),
        behind_commits_are_patch_equivalent: value
            .get("behindCommitsArePatchEquivalent")
            .and_then(Value::as_bool),
    }
}

pub(super) fn diff_result(value: &Value) -> GitDiffResult {
    let kind = value.get("kind").and_then(Value::as_str);
    GitDiffResult {
        kind: match kind {
            Some("binary") => GitDiffKind::Binary,
            _ => GitDiffKind::Text,
        } as i32,
        original_content: string_field(value, "originalContent").unwrap_or_default(),
        modified_content: string_field(value, "modifiedContent").unwrap_or_default(),
        original_is_binary: bool_field(value, "originalIsBinary"),
        modified_is_binary: bool_field(value, "modifiedIsBinary"),
        is_image: value.get("isImage").and_then(Value::as_bool),
        mime_type: string_field(value, "mimeType"),
        modified_deleted: value.get("modifiedDeleted").and_then(Value::as_bool),
        large_diff_render_limit: value.get("largeDiffRenderLimit").map(diff_render_limit),
    }
}

fn diff_render_limit(value: &Value) -> GitDiffRenderLimit {
    let reason = value.get("reason").and_then(Value::as_str);
    GitDiffRenderLimit {
        reason: match reason {
            Some("line-count") => GitDiffLimitReason::LineCount,
            _ => GitDiffLimitReason::CharacterCount,
        } as i32,
        line_counts: value
            .get("lineCounts")
            .filter(|value| !value.is_null())
            .map(|value| GitDiffLineCounts {
                original: value.get("original").and_then(Value::as_u64).unwrap_or(0),
                modified: value.get("modified").and_then(Value::as_u64).unwrap_or(0),
            }),
        line_counts_are_minimum: value.get("lineCountsAreMinimum").map(|value| {
            GitDiffLineCountsAreMinimum {
                original: bool_field(value, "original"),
                modified: bool_field(value, "modified"),
            }
        }),
        character_count: value
            .get("characterCount")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        limits: value.get("limits").map(|value| GitDiffRenderLimits {
            max_lines_per_side: value
                .get("maxLinesPerSide")
                .and_then(Value::as_u64)
                .unwrap_or(0),
            max_combined_characters: value
                .get("maxCombinedCharacters")
                .and_then(Value::as_u64)
                .unwrap_or(0),
        }),
    }
}

// write.rs's status/blocked/conflicts/error union, shared by every
// history-mutation and branch-mutation RPC (see git_common.proto's
// GitWriteOutcome doc comment).
pub(super) fn write_outcome(value: &Value) -> GitWriteOutcome {
    match value.get("status").and_then(Value::as_str) {
        Some("ok") => GitWriteOutcome {
            status: GitWriteStatus::Ok as i32,
            blocked_reason: None,
            message: None,
            conflict_paths: Vec::new(),
        },
        Some("blocked") => GitWriteOutcome {
            status: GitWriteStatus::Blocked as i32,
            blocked_reason: value
                .get("reason")
                .and_then(Value::as_str)
                .map(|reason| blocked_reason(reason) as i32),
            message: string_field(value, "message"),
            conflict_paths: Vec::new(),
        },
        Some("conflicts") => GitWriteOutcome {
            status: GitWriteStatus::Conflicts as i32,
            blocked_reason: None,
            message: None,
            conflict_paths: value
                .get("paths")
                .and_then(Value::as_array)
                .map(|paths| {
                    paths
                        .iter()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default(),
        },
        _ => GitWriteOutcome {
            status: GitWriteStatus::Error as i32,
            blocked_reason: None,
            message: Some(
                string_field(value, "message").unwrap_or_else(|| "git operation failed".to_owned()),
            ),
            conflict_paths: Vec::new(),
        },
    }
}

fn blocked_reason(value: &str) -> GitBlockedReason {
    match value {
        "invalid_name" => GitBlockedReason::InvalidName,
        "name_exists" => GitBlockedReason::NameExists,
        "dirty_working_tree" => GitBlockedReason::DirtyWorkingTree,
        "operation_in_progress" => GitBlockedReason::OperationInProgress,
        "invalid_commit" => GitBlockedReason::InvalidCommit,
        "merge_commit_not_droppable" => GitBlockedReason::MergeCommitNotDroppable,
        "unborn_head" => GitBlockedReason::UnbornHead,
        "detached_head" => GitBlockedReason::DetachedHead,
        "merge_commit_requires_mainline" => GitBlockedReason::MergeCommitRequiresMainline,
        "not_a_merge_commit" => GitBlockedReason::NotAMergeCommit,
        _ => GitBlockedReason::Unspecified,
    }
}

pub(super) fn string_field(value: &Value, field: &str) -> Option<String> {
    value.get(field).and_then(Value::as_str).map(str::to_owned)
}

fn bool_field(value: &Value, field: &str) -> bool {
    value.get(field).and_then(Value::as_bool).unwrap_or(false)
}

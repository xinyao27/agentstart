use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    GitHubChecksState, GitHubChecksSummary, GitHubConflictSummary, GitHubMergeMethodSettings,
    GitHubPrMergeable, GitHubPrState, GitHubRepoRef, GitHubReviewDecision, GitHubUser,
};
use serde_json::Value;

use crate::github::{GitHubError, GitHubRepository};

// Why: mirrors `crate::github::mapping::state` so the typed and legacy readers agree on how a
// `gh` JSON state/mergedAt shape collapses into the PR lifecycle.
pub(super) fn pr_state(raw: &str) -> GitHubPrState {
    match raw {
        "closed" => GitHubPrState::Closed,
        "merged" => GitHubPrState::Merged,
        "draft" => GitHubPrState::Draft,
        _ => GitHubPrState::Open,
    }
}

pub(super) fn mergeable(raw: Option<&str>) -> GitHubPrMergeable {
    match raw {
        Some("CONFLICTING") => GitHubPrMergeable::Conflicting,
        Some("MERGEABLE") => GitHubPrMergeable::Mergeable,
        _ => GitHubPrMergeable::Unknown,
    }
}

pub(super) fn checks_state(raw: &str) -> GitHubChecksState {
    match raw {
        "success" => GitHubChecksState::Success,
        "failure" => GitHubChecksState::Failure,
        "none" => GitHubChecksState::None,
        _ => GitHubChecksState::Pending,
    }
}

pub(super) fn review_decision(raw: Option<&Value>) -> Option<GitHubReviewDecision> {
    match raw?.as_str()? {
        "APPROVED" => Some(GitHubReviewDecision::Approved),
        "CHANGES_REQUESTED" => Some(GitHubReviewDecision::ChangesRequested),
        "REVIEW_REQUIRED" => Some(GitHubReviewDecision::ReviewRequired),
        _ => None,
    }
}

pub(super) fn repo_ref(raw: Option<&Value>) -> Option<GitHubRepoRef> {
    let raw = raw?;
    Some(GitHubRepoRef {
        owner: raw.get("owner")?.as_str()?.to_owned(),
        repo: raw.get("repo")?.as_str()?.to_owned(),
    })
}

pub(super) fn repository_from_ref(reference: Option<GitHubRepoRef>) -> Option<GitHubRepository> {
    reference.map(|reference| GitHubRepository {
        owner: reference.owner,
        repo: reference.repo,
        host: None,
    })
}

pub(super) fn checks_summary(raw: Option<&Value>) -> Option<GitHubChecksSummary> {
    let raw = raw?;
    Some(GitHubChecksSummary {
        state: checks_state(raw.get("state")?.as_str()?) as i32,
        total: as_u32(raw.get("total")),
        passed: as_u32(raw.get("passed")),
        failed: as_u32(raw.get("failed")),
        pending: as_u32(raw.get("pending")),
    })
}

pub(super) fn merge_method_settings(raw: Option<&Value>) -> Option<GitHubMergeMethodSettings> {
    let raw = raw?;
    let default_method = raw.get("defaultMethod")?.as_str()?.to_owned();
    let allowed = raw.get("allowedMethods")?;
    Some(GitHubMergeMethodSettings {
        default_method,
        merge_allowed: allowed
            .get("merge")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        squash_allowed: allowed
            .get("squash")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        rebase_allowed: allowed
            .get("rebase")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

pub(super) fn conflict_summary(raw: Option<&Value>) -> Option<GitHubConflictSummary> {
    let raw = raw?;
    Some(GitHubConflictSummary {
        base_ref: raw.get("baseRef")?.as_str()?.to_owned(),
        base_commit: raw.get("baseCommit")?.as_str()?.to_owned(),
        commits_behind: raw
            .get("commitsBehind")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        files: raw
            .get("files")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|value| value.as_str())
            .map(str::to_owned)
            .collect(),
        merge_clean: raw
            .get("localMergeState")
            .and_then(Value::as_str)
            .map(|value| value == "clean"),
    })
}

pub(super) fn user(raw: &Value) -> Option<GitHubUser> {
    Some(GitHubUser {
        login: raw.get("login").and_then(Value::as_str)?.to_owned(),
        name: raw.get("name").and_then(Value::as_str).map(str::to_owned),
        avatar_url: raw
            .get("avatarUrl")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned(),
        review_state: raw.get("state").and_then(Value::as_str).map(str::to_owned),
    })
}

pub(super) fn users(raw: Option<&Value>) -> Vec<GitHubUser> {
    raw.and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(user)
        .collect()
}

fn as_u32(raw: Option<&Value>) -> u32 {
    raw.and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or(0)
}

// Why: shared with the already-migrated `shell.gh.*` slice's error shape so both surfaces report
// the same NOT_FOUND/runtime-error split the legacy JSON dispatcher used.
pub(super) fn status_from_error(error: GitHubError) -> Status {
    match error {
        GitHubError::Project(_) | GitHubError::Worktree(_) => Status {
            code: StatusCode::NotFound as i32,
            message: error.to_string(),
            details: Vec::new(),
        },
        GitHubError::Command(message) => Status {
            code: StatusCode::Internal as i32,
            message,
            details: Vec::new(),
        },
        other => {
            eprintln!("[daemon] GitHub request failed: {other}");
            Status {
                code: StatusCode::Internal as i32,
                message: "GitHub request failed".to_owned(),
                details: Vec::new(),
            }
        }
    }
}

pub(super) fn invalid(message: &str) -> Status {
    Status {
        code: StatusCode::InvalidArgument as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

pub(super) fn required_repo(repo: &str) -> Result<&str, Status> {
    (!repo.is_empty())
        .then_some(repo)
        .ok_or_else(|| invalid("repo is required"))
}

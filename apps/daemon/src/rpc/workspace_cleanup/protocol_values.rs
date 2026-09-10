// Why: the cleanup authority answers scan and dismissal queries as
// `serde_json::Value` trees; this is the single place that reads those trees
// into the typed protobuf wire messages.
use std::collections::BTreeMap;

use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    WorkspaceCleanupCandidate, WorkspaceCleanupCandidateTier, WorkspaceCleanupDismissal,
    WorkspaceCleanupGitEvidence, WorkspaceCleanupLocalContext, WorkspaceCleanupScanError,
    WorkspaceCleanupScanProgress, WorkspaceCleanupServiceDismissalsResponse,
    WorkspaceCleanupServiceScanResponse,
};
use serde_json::Value;

pub(super) fn scan_value(result: &Value) -> Result<WorkspaceCleanupServiceScanResponse, Status> {
    let candidates = list(result.get("candidates"))
        .iter()
        .map(candidate)
        .collect::<Result<Vec<_>, Status>>()?;
    let errors = list(result.get("errors"))
        .iter()
        .map(scan_error)
        .collect::<Result<Vec<_>, Status>>()?;
    Ok(WorkspaceCleanupServiceScanResponse {
        scanned_at: integer(result.get("scannedAt")),
        candidates,
        errors,
    })
}

pub(super) fn dismissals_value(
    result: &Value,
) -> Result<WorkspaceCleanupServiceDismissalsResponse, Status> {
    let dismissals = result
        .get("dismissals")
        .and_then(Value::as_object)
        .ok_or_else(|| data_loss("Dismissal result answered without a dismissal map"))?;
    // Why: the authority stores dismissals in a hash map with no meaningful
    // order, so the wire sorts by worktree id to keep responses deterministic.
    let ordered = dismissals.iter().collect::<BTreeMap<_, _>>();
    let entries = ordered
        .values()
        .map(|entry| dismissal(entry))
        .collect::<Result<Vec<_>, Status>>()?;
    Ok(WorkspaceCleanupServiceDismissalsResponse {
        dismissals: entries,
    })
}

pub(super) fn progress_event(event: &Value) -> Option<WorkspaceCleanupScanProgress> {
    if event.get("type").and_then(Value::as_str) != Some("workspaceCleanupScanProgress") {
        return None;
    }
    let progress = event.get("progress")?;
    let candidates = list(progress.get("candidates"))
        .iter()
        .filter_map(|entry| candidate(entry).ok())
        .collect();
    let errors = list(progress.get("errors"))
        .iter()
        .filter_map(|entry| scan_error(entry).ok())
        .collect();
    Some(WorkspaceCleanupScanProgress {
        scan_id: text(progress.get("scanId")),
        scanned_at: integer(progress.get("scannedAt")),
        candidates,
        errors,
        scanned_worktree_count: bounded_count(progress.get("scannedWorktreeCount")),
        total_worktree_count: bounded_count(progress.get("totalWorktreeCount")),
        // Why: the authority only ever emits the "append" candidate mode, so
        // the wire keeps the string rather than an enum with one live value.
        candidate_mode: text(progress.get("candidateMode")),
    })
}

fn candidate(candidate: &Value) -> Result<WorkspaceCleanupCandidate, Status> {
    let git = candidate.get("git");
    let local_context = candidate.get("localContext");
    Ok(WorkspaceCleanupCandidate {
        worktree_id: text(candidate.get("worktreeId")),
        repo_id: text(candidate.get("repoId")),
        repo_name: text(candidate.get("repoName")),
        connection_id: candidate
            .get("connectionId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        display_name: text(candidate.get("displayName")),
        branch: text(candidate.get("branch")),
        path: text(candidate.get("path")),
        tier: match candidate.get("tier").and_then(Value::as_str) {
            Some("ready") => WorkspaceCleanupCandidateTier::Ready,
            Some("review") => WorkspaceCleanupCandidateTier::Review,
            Some("protected") => WorkspaceCleanupCandidateTier::Protected,
            _ => WorkspaceCleanupCandidateTier::Unspecified,
        } as i32,
        selected_by_default: candidate
            .get("selectedByDefault")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        reasons: strings(candidate.get("reasons")),
        blockers: strings(candidate.get("blockers")),
        last_activity_at: integer(candidate.get("lastActivityAt")),
        local_context: Some(WorkspaceCleanupLocalContext {
            terminal_tab_count: bounded_count(
                local_context.and_then(|context| context.get("terminalTabCount")),
            ),
            clean_editor_tab_count: bounded_count(
                local_context.and_then(|context| context.get("cleanEditorTabCount")),
            ),
            browser_tab_count: bounded_count(
                local_context.and_then(|context| context.get("browserTabCount")),
            ),
            diff_comment_count: bounded_count(
                local_context.and_then(|context| context.get("diffCommentCount")),
            ),
            newest_diff_comment_at: optional_integer(
                local_context.and_then(|context| context.get("newestDiffCommentAt")),
            ),
            retained_done_agent_count: bounded_count(
                local_context.and_then(|context| context.get("retainedDoneAgentCount")),
            ),
        }),
        git: Some(WorkspaceCleanupGitEvidence {
            clean: git
                .and_then(|git| git.get("clean"))
                .and_then(Value::as_bool),
            upstream_ahead: optional_integer(git.and_then(|git| git.get("upstreamAhead"))),
            upstream_behind: optional_integer(git.and_then(|git| git.get("upstreamBehind"))),
            checked_at: optional_integer(git.and_then(|git| git.get("checkedAt"))),
        }),
        fingerprint: text(candidate.get("fingerprint")),
        created_at: optional_integer(candidate.get("createdAt")),
    })
}

fn dismissal(dismissal: &Value) -> Result<WorkspaceCleanupDismissal, Status> {
    Ok(WorkspaceCleanupDismissal {
        worktree_id: text(dismissal.get("worktreeId")),
        fingerprint: text(dismissal.get("fingerprint")),
        dismissed_at: dismissal
            .get("dismissedAt")
            .and_then(Value::as_f64)
            .unwrap_or_default(),
        classifier_version: dismissal
            .get("classifierVersion")
            .and_then(Value::as_f64)
            .unwrap_or_default(),
    })
}

fn scan_error(error: &Value) -> Result<WorkspaceCleanupScanError, Status> {
    Ok(WorkspaceCleanupScanError {
        repo_id: text(error.get("repoId")),
        repo_name: text(error.get("repoName")),
        message: text(error.get("message")),
    })
}

fn list(value: Option<&Value>) -> Vec<Value> {
    value.and_then(Value::as_array).cloned().unwrap_or_default()
}

fn strings(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

fn text(value: Option<&Value>) -> String {
    value.and_then(Value::as_str).unwrap_or_default().to_owned()
}

fn integer(value: Option<&Value>) -> i64 {
    optional_integer(value).unwrap_or_default()
}

fn optional_integer(value: Option<&Value>) -> Option<i64> {
    value.and_then(Value::as_i64).or_else(|| {
        value
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite())
            .map(|value| value as i64)
    })
}

fn bounded_count(value: Option<&Value>) -> u32 {
    u32::try_from(integer(value).clamp(0, u32::MAX as i64)).unwrap_or_default()
}

fn data_loss(message: &str) -> Status {
    Status {
        code: StatusCode::DataLoss as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

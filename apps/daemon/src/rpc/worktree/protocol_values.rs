use std::collections::HashMap;

use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    WorktreeAgentRow, WorktreeArchive, WorktreeBaseStatusEvent, WorktreeBaseStatusKind,
    WorktreeDefaultTab, WorktreeDefaultTabs, WorktreeDetectedRecord, WorktreeDetectedSource,
    WorktreeDiffComment, WorktreeGitInfo, WorktreeLineage, WorktreeLineageCapture,
    WorktreeLinkedPullRequest, WorktreeMobileDiffReview, WorktreeMobileDiffReviewFile,
    WorktreeNullableInt64, WorktreeNullableString, WorktreeOwnership, WorktreePrBaseSuccess,
    WorktreePreservedBranch, WorktreePsSummary as ProtocolWorktreePsSummary, WorktreePushTarget,
    WorktreeRecord, WorktreeServiceActivateResponse, WorktreeServiceCreateResponse,
    WorktreeServiceDetectedListResponse, WorktreeServiceLineageListResponse,
    WorktreeServicePersistSortOrderResponse, WorktreeServicePsResponse,
    WorktreeServiceRemoveResponse, WorktreeServiceResolvePrBaseResponse,
    WorktreeServiceSetResponse, WorktreeServiceShowResponse, WorktreeSleepingAgentWake,
    WorktreeStartupTerminal, WorktreeWorkspaceLineage, worktree_nullable_int64,
    worktree_nullable_string, worktree_service_resolve_pr_base_response,
};
use serde::Deserialize;
use serde_json::Value;

use crate::worktrees::{LinkedPullRequest, WorktreePsResult, WorktreePsSummary};

pub(super) struct ListResult {
    pub(super) worktrees: Vec<WorktreeRecord>,
    pub(super) total_count: u32,
    pub(super) truncated: bool,
    pub(super) revision: Option<i64>,
}

pub(super) fn list_result(value: Value) -> Result<ListResult, Status> {
    let value: ListJson = parse(value, "worktree list")?;
    Ok(ListResult {
        worktrees: value
            .worktrees
            .into_iter()
            .map(record)
            .collect::<Result<Vec<_>, _>>()?,
        total_count: u32::try_from(value.total_count)
            .map_err(|_| data_loss("Worktree result count exceeds uint32"))?,
        truncated: value.truncated,
        revision: value.revision,
    })
}

pub(super) fn create_result(value: Value) -> Result<WorktreeServiceCreateResponse, Status> {
    let value: CreateJson = parse(value, "worktree create")?;
    Ok(WorktreeServiceCreateResponse {
        revision: value.revision,
        worktree: Some(record(value.worktree)?),
        lineage: None,
        workspace_lineage: None,
        warnings: Vec::new(),
        setup: None,
        setup_receipt: None,
        default_tabs: value.default_tabs.map(default_tabs),
        warning: value.warning,
        initial_base_status: None,
        local_base_ref_refresh: None,
        local_base_ref_update_suggestion: None,
        startup_terminal: value.startup_terminal.map(startup_terminal),
        timing: None,
        agent_terminal_handle: value.agent_terminal_handle,
    })
}

pub(super) fn archive_result(value: Value) -> Result<(WorktreeArchive, i64), Status> {
    let value: ArchiveResultJson = parse(value, "worktree archive")?;
    Ok((archive(value.archive), value.revision))
}

pub(super) fn archives_result(value: Value) -> Result<Vec<WorktreeArchive>, Status> {
    let value: ArchivesJson = parse(value, "worktree archives")?;
    Ok(value.archives.into_iter().map(archive).collect())
}

pub(super) fn ps_result(value: WorktreePsResult) -> Result<WorktreeServicePsResponse, Status> {
    let total_count = u32::try_from(value.total_count)
        .map_err(|_| data_loss("Worktree ps result count exceeds uint32"))?;
    Ok(WorktreeServicePsResponse {
        worktrees: value
            .worktrees
            .into_iter()
            .map(ps_summary)
            .collect::<Result<Vec<_>, _>>()?,
        total_count,
        truncated: value.truncated,
    })
}

fn ps_summary(value: WorktreePsSummary) -> Result<ProtocolWorktreePsSummary, Status> {
    let live_terminal_count = u32::try_from(value.live_terminal_count)
        .map_err(|_| data_loss("Worktree ps live terminal count exceeds uint32"))?;
    Ok(ProtocolWorktreePsSummary {
        workspace_kind: value.workspace_kind.to_owned(),
        worktree_id: value.worktree_id,
        repo_id: value.repo_id,
        host_id: value.host_id,
        resume_target_status: value.resume_target_status.to_owned(),
        terminal_platform: value.terminal_platform.to_owned(),
        prior_worktree_ids: value.prior_worktree_ids.unwrap_or_default(),
        repo: value.repo,
        path: value.path,
        branch: value.branch,
        display_name: value.display_name,
        workspace_status: value.workspace_status,
        is_archived: value.is_archived,
        is_main_worktree: value.is_main_worktree,
        has_host_sidebar_activity: value.has_host_sidebar_activity,
        worktree_instance_id: value.worktree_instance_id,
        lineage_worktree_instance_id: value.lineage_worktree_instance_id,
        parent_worktree_instance_id: value.parent_worktree_instance_id,
        parent_worktree_id: value.parent_worktree_id,
        child_worktree_ids: value.child_worktree_ids,
        sort_order: value.sort_order,
        manual_order: value.manual_order,
        last_activity_at: value.last_activity_at,
        created_at: value.created_at,
        linked_pr: value.linked_pr.map(linked_pull_request),
        comment: value.comment,
        is_pinned: value.is_pinned,
        is_active: value.is_active,
        unread: value.unread,
        live_terminal_count,
        has_attached_pty: value.has_attached_pty,
        last_output_at: value.last_output_at,
        preview: value.preview,
        status: value.status.to_owned(),
        agents: value
            .agents
            .into_iter()
            .map(agent_row)
            .collect::<Result<_, _>>()?,
    })
}

fn linked_pull_request(value: LinkedPullRequest) -> WorktreeLinkedPullRequest {
    WorktreeLinkedPullRequest {
        number: value.number,
        state: value.state,
    }
}

pub(super) fn show_result(value: Value) -> Result<WorktreeServiceShowResponse, Status> {
    let value: ShowJson = parse(value, "worktree show")?;
    Ok(WorktreeServiceShowResponse {
        worktree: Some(record(value.worktree)?),
        revision: Some(value.revision),
    })
}

pub(super) fn sleep_result(value: Value) -> Result<String, Status> {
    let value: SleepJson = parse(value, "worktree sleep")?;
    Ok(value.worktree_id)
}

pub(super) fn activate_result(value: Value) -> Result<WorktreeServiceActivateResponse, Status> {
    let value: ActivateJson = parse(value, "worktree activate")?;
    Ok(WorktreeServiceActivateResponse {
        repo_id: value.repo_id,
        worktree_id: value.worktree_id,
        activated: value.activated,
        sleeping_agent_wake: sleeping_agent_wake(&value.sleeping_agent_wake)? as i32,
    })
}

fn sleeping_agent_wake(value: &str) -> Result<WorktreeSleepingAgentWake, Status> {
    match value {
        "requested" => Ok(WorktreeSleepingAgentWake::Requested),
        "unsupported-headless" => Ok(WorktreeSleepingAgentWake::UnsupportedHeadless),
        "not-applicable" => Ok(WorktreeSleepingAgentWake::NotApplicable),
        _ => Err(data_loss(
            "Worktree activate result has an unknown sleeping agent wake value",
        )),
    }
}

pub(super) fn remove_result(value: Value) -> Result<WorktreeServiceRemoveResponse, Status> {
    let value: RemoveJson = parse(value, "worktree remove")?;
    Ok(WorktreeServiceRemoveResponse {
        removed: value.removed,
        preserved_branch: value
            .preserved_branch
            .map(|branch| WorktreePreservedBranch {
                branch_name: branch.branch_name,
                head: branch.head,
            }),
        revision: Some(value.revision),
    })
}

pub(super) fn force_delete_branch_result(value: Value) -> Result<bool, Status> {
    let value: ForceDeleteBranchJson = parse(value, "worktree force delete branch")?;
    Ok(value.deleted)
}

pub(super) fn set_result(value: Value) -> Result<WorktreeServiceSetResponse, Status> {
    let value: SetJson = parse(value, "worktree set")?;
    Ok(WorktreeServiceSetResponse {
        worktree: Some(record(value.worktree)?),
        revision: value.revision,
    })
}

pub(super) fn persist_sort_order_result(
    value: Value,
) -> Result<WorktreeServicePersistSortOrderResponse, Status> {
    let value: PersistSortOrderJson = parse(value, "worktree persist sort order")?;
    Ok(WorktreeServicePersistSortOrderResponse {
        updated: u32::try_from(value.updated)
            .map_err(|_| data_loss("Worktree sort order update count exceeds uint32"))?,
    })
}

pub(super) fn detected_list_result(
    value: Value,
) -> Result<WorktreeServiceDetectedListResponse, Status> {
    let value: DetectedListJson = parse(value, "worktree detected list")?;
    Ok(WorktreeServiceDetectedListResponse {
        repo_id: value.repo_id,
        revision: Some(value.revision),
        authoritative: value.authoritative,
        source: detected_source(&value.source)? as i32,
        worktrees: value
            .worktrees
            .into_iter()
            .map(detected_record)
            .collect::<Result<Vec<_>, _>>()?,
    })
}

fn detected_record(value: DetectedRecordJson) -> Result<WorktreeDetectedRecord, Status> {
    Ok(WorktreeDetectedRecord {
        record: Some(record(value.record)?),
        ownership: ownership(&value.ownership)? as i32,
        selected_checkout: value.selected_checkout,
        visible: value.visible,
    })
}

fn detected_source(value: &str) -> Result<WorktreeDetectedSource, Status> {
    match value {
        "git" => Ok(WorktreeDetectedSource::Git),
        "metadata-fallback" => Ok(WorktreeDetectedSource::MetadataFallback),
        "session-fallback" => Ok(WorktreeDetectedSource::SessionFallback),
        _ => Err(data_loss(
            "Worktree detected list has an unknown source value",
        )),
    }
}

fn ownership(value: &str) -> Result<WorktreeOwnership, Status> {
    match value {
        "agentstart-managed" => Ok(WorktreeOwnership::AgentStartManaged),
        "external" => Ok(WorktreeOwnership::External),
        "unknown-legacy" => Ok(WorktreeOwnership::UnknownLegacy),
        _ => Err(data_loss(
            "Worktree detected record has an unknown ownership value",
        )),
    }
}

pub(super) fn lineage_list_result(
    value: Value,
) -> Result<WorktreeServiceLineageListResponse, Status> {
    let value: LineageListJson = parse(value, "worktree lineage list")?;
    Ok(WorktreeServiceLineageListResponse {
        lineage: value
            .lineage
            .into_iter()
            .map(|(id, entry)| (id, lineage(entry)))
            .collect(),
        workspace_lineage: value
            .workspace_lineage
            .into_iter()
            .map(|(id, entry)| (id, workspace_lineage(entry)))
            .collect(),
    })
}

pub(super) fn resolve_pr_base_result(
    value: Value,
) -> Result<WorktreeServiceResolvePrBaseResponse, Status> {
    let value: ResolvePrBaseJson = parse(value, "worktree resolve pr base")?;
    let result = match value {
        ResolvePrBaseJson::Error { error } => {
            worktree_service_resolve_pr_base_response::Result::Error(error)
        }
        ResolvePrBaseJson::Success {
            base_branch,
            head_sha,
            branch_name_override,
            compare_base_ref,
            push_target: push_target_field,
        } => worktree_service_resolve_pr_base_response::Result::Success(WorktreePrBaseSuccess {
            base_branch,
            head_sha,
            branch_name_override,
            compare_base_ref,
            push_target: push_target_field.map(push_target),
        }),
    };
    Ok(WorktreeServiceResolvePrBaseResponse {
        result: Some(result),
    })
}

pub(super) fn branch_rename_failure_output_result(value: Value) -> Result<Option<String>, Status> {
    parse(value, "worktree branch rename failure output")
}

pub(super) fn base_status_event(value: Value) -> Result<WorktreeBaseStatusEvent, Status> {
    let value: BaseStatusEventJson = parse(value, "worktree base status event")?;
    Ok(WorktreeBaseStatusEvent {
        repo_id: value.repo_id,
        worktree_id: value.worktree_id,
        status: base_status_kind(&value.status)? as i32,
        base: value.base,
        behind: value.behind,
    })
}

fn base_status_kind(value: &str) -> Result<WorktreeBaseStatusKind, Status> {
    match value {
        "checking" => Ok(WorktreeBaseStatusKind::Checking),
        "current" => Ok(WorktreeBaseStatusKind::Current),
        "drift" => Ok(WorktreeBaseStatusKind::Drift),
        "base_changed" => Ok(WorktreeBaseStatusKind::BaseChanged),
        "unknown" => Ok(WorktreeBaseStatusKind::Unknown),
        _ => Err(data_loss(
            "Worktree base status event has an unknown status value",
        )),
    }
}

fn record(value: RecordJson) -> Result<WorktreeRecord, Status> {
    let linked_pr = Some(nullable_i64(value.linked_pr));
    let parent_worktree_id = Some(nullable_string(value.parent_worktree_id));
    Ok(WorktreeRecord {
        id: value.id,
        instance_id: value.instance_id,
        repo_id: value.repo_id,
        project_id: value.project_id,
        host_id: value.host_id,
        project_host_setup_id: value.project_host_setup_id,
        path: value.path,
        head: value.head,
        branch: value.branch,
        is_bare: value.is_bare,
        is_sparse: value.is_sparse,
        locked: value.locked,
        lock_reason: value.lock_reason,
        prunable: value.prunable,
        prunable_reason: value.prunable_reason,
        is_main_worktree: value.is_main_worktree,
        display_name: value.display_name,
        comment: value.comment,
        linked_pr,
        is_archived: value.is_archived,
        is_unread: value.is_unread,
        is_pinned: value.is_pinned,
        sort_order: value.sort_order,
        manual_order: value.manual_order,
        last_activity_at: value.last_activity_at,
        created_at: value.created_at,
        created_with_agent: value.created_with_agent,
        pending_first_agent_message_rename: value.pending_first_agent_message_rename,
        first_agent_message_rename_error: value
            .first_agent_message_rename_error
            .map(|value| nullable_string(Some(value))),
        sparse_directories: value.sparse_directories,
        sparse_base_ref: value.sparse_base_ref,
        sparse_preset_id: value.sparse_preset_id,
        base_ref: value.base_ref,
        push_target: value.push_target.map(push_target),
        prior_worktree_ids: value.prior_worktree_ids,
        workspace_status: value.workspace_status,
        diff_comments: value.diff_comments.into_iter().map(diff_comment).collect(),
        mobile_diff_review: value.mobile_diff_review.map(mobile_review),
        parent_worktree_id,
        child_worktree_ids: value.child_worktree_ids,
        lineage: value.lineage.map(lineage),
        workspace_lineage: value.workspace_lineage.map(workspace_lineage),
        git: Some(git(value.git)),
    })
}

fn git(value: GitJson) -> WorktreeGitInfo {
    WorktreeGitInfo {
        path: value.path,
        head: value.head,
        branch: value.branch,
        is_bare: value.is_bare,
        is_sparse: value.is_sparse,
        locked: value.locked,
        lock_reason: value.lock_reason,
        prunable: value.prunable,
        prunable_reason: value.prunable_reason,
        is_main_worktree: value.is_main_worktree,
    }
}

fn push_target(value: PushTargetJson) -> WorktreePushTarget {
    WorktreePushTarget {
        remote_name: value.remote_name,
        branch_name: value.branch_name,
        remote_url: value.remote_url,
        remote_created: value.remote_created,
    }
}

fn lineage(value: LineageJson) -> WorktreeLineage {
    WorktreeLineage {
        worktree_id: value.worktree_id,
        worktree_instance_id: value.worktree_instance_id,
        parent_worktree_id: value.parent_worktree_id,
        parent_worktree_instance_id: value.parent_worktree_instance_id,
        origin: value.origin,
        capture: Some(capture(value.capture)),
        orchestration_run_id: value.orchestration_run_id,
        task_id: value.task_id,
        coordinator_handle: value.coordinator_handle,
        created_by_terminal_handle: value.created_by_terminal_handle,
        created_at: value.created_at,
    }
}

fn workspace_lineage(value: WorkspaceLineageJson) -> WorktreeWorkspaceLineage {
    WorktreeWorkspaceLineage {
        child_workspace_key: value.child_workspace_key,
        child_instance_id: value.child_instance_id.map(nullable_string),
        parent_workspace_key: value.parent_workspace_key,
        parent_instance_id: value.parent_instance_id.map(nullable_string),
        origin: value.origin,
        capture: Some(capture(value.capture)),
        task_id: value.task_id,
        orchestration_run_id: value.orchestration_run_id,
        coordinator_handle: value.coordinator_handle,
        created_by_terminal_handle: value.created_by_terminal_handle,
        created_at: value.created_at,
    }
}

fn capture(value: CaptureJson) -> WorktreeLineageCapture {
    WorktreeLineageCapture {
        source: value.source,
        confidence: value.confidence,
    }
}

fn diff_comment(value: DiffCommentJson) -> WorktreeDiffComment {
    WorktreeDiffComment {
        id: value.id,
        worktree_id: value.worktree_id,
        file_path: value.file_path,
        source: value.source,
        selected_text: value.selected_text,
        start_line: value.start_line,
        line_number: value.line_number,
        body: value.body,
        created_at: value.created_at,
        updated_at: value.updated_at,
        sent_at: value.sent_at,
        scope: value.scope,
        old_path: value.old_path,
        diff_identity: value.diff_identity,
        side: value.side,
    }
}

fn mobile_review(value: MobileReviewJson) -> WorktreeMobileDiffReview {
    WorktreeMobileDiffReview {
        version: value.version,
        updated_at: value.updated_at,
        completed_at: value.completed_at,
        files: value
            .files
            .into_iter()
            .map(|(key, value)| (key, mobile_review_file(value)))
            .collect(),
    }
}

fn mobile_review_file(value: MobileReviewFileJson) -> WorktreeMobileDiffReviewFile {
    WorktreeMobileDiffReviewFile {
        key: value.key,
        file_path: value.file_path,
        old_path: value.old_path,
        scope: value.scope,
        last_opened_at: value.last_opened_at,
        last_seen_diff_identity: value.last_seen_diff_identity,
        reviewed_at: value.reviewed_at,
        review_diff_identity: value.review_diff_identity,
    }
}

fn default_tabs(value: DefaultTabsJson) -> WorktreeDefaultTabs {
    WorktreeDefaultTabs {
        tabs: value
            .tabs
            .into_iter()
            .map(|tab| WorktreeDefaultTab {
                title: tab.title,
                color: tab.color,
                command: tab.command,
            })
            .collect(),
        run_commands: value.run_commands,
    }
}

fn startup_terminal(value: StartupTerminalJson) -> WorktreeStartupTerminal {
    WorktreeStartupTerminal {
        spawned: true,
        handle: Some(value.handle),
        tab_id: Some(value.tab_id),
        pane_key: Some(nullable_string(Some(value.pane_key))),
        pty_id: Some(nullable_string(Some(value.pty_id))),
        surface: Some(value.surface),
    }
}

fn archive(value: ArchiveJson) -> WorktreeArchive {
    WorktreeArchive {
        branch: value.branch,
        created_at: value.created_at,
        failure_detail: Some(nullable_string(value.failure_detail)),
        head: value.head,
        id: value.id,
        original_worktree_id: value.original_worktree_id,
        path: value.path,
        repo_id: value.repo_id,
        restored_at: value.restored_at,
        stash_oid: value.stash_oid,
        status: value.status,
    }
}

fn nullable_i64(value: Option<i64>) -> WorktreeNullableInt64 {
    WorktreeNullableInt64 {
        value: Some(match value {
            Some(value) => worktree_nullable_int64::Value::Number(value),
            None => worktree_nullable_int64::Value::Null(true),
        }),
    }
}

fn nullable_string(value: Option<String>) -> WorktreeNullableString {
    WorktreeNullableString {
        value: Some(match value {
            Some(value) => worktree_nullable_string::Value::Text(value),
            None => worktree_nullable_string::Value::Null(true),
        }),
    }
}

fn parse<T: for<'de> Deserialize<'de>>(value: Value, label: &str) -> Result<T, Status> {
    serde_json::from_value(value)
        .map_err(|error| data_loss(&format!("Invalid {label} result: {error}")))
}

fn data_loss(message: &str) -> Status {
    Status {
        code: StatusCode::DataLoss as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListJson {
    worktrees: Vec<RecordJson>,
    total_count: usize,
    truncated: bool,
    revision: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateJson {
    revision: Option<i64>,
    worktree: RecordJson,
    default_tabs: Option<DefaultTabsJson>,
    warning: Option<String>,
    startup_terminal: Option<StartupTerminalJson>,
    agent_terminal_handle: Option<String>,
}

#[derive(Deserialize)]
struct ArchiveResultJson {
    archive: ArchiveJson,
    revision: i64,
}

#[derive(Deserialize)]
struct ArchivesJson {
    archives: Vec<ArchiveJson>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveJson {
    branch: String,
    created_at: i64,
    failure_detail: Option<String>,
    head: String,
    id: String,
    original_worktree_id: String,
    path: String,
    repo_id: String,
    restored_at: Option<i64>,
    stash_oid: Option<String>,
    status: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordJson {
    id: String,
    instance_id: Option<String>,
    repo_id: String,
    project_id: Option<String>,
    host_id: Option<String>,
    project_host_setup_id: Option<String>,
    path: String,
    head: String,
    branch: String,
    is_bare: bool,
    is_sparse: Option<bool>,
    locked: Option<bool>,
    lock_reason: Option<String>,
    prunable: Option<bool>,
    prunable_reason: Option<String>,
    is_main_worktree: bool,
    display_name: String,
    comment: String,
    linked_pr: Option<i64>,
    is_archived: bool,
    is_unread: bool,
    is_pinned: bool,
    sort_order: f64,
    manual_order: Option<f64>,
    last_activity_at: f64,
    created_at: Option<f64>,
    created_with_agent: Option<String>,
    pending_first_agent_message_rename: Option<bool>,
    first_agent_message_rename_error: Option<String>,
    #[serde(default)]
    sparse_directories: Vec<String>,
    sparse_base_ref: Option<String>,
    sparse_preset_id: Option<String>,
    base_ref: Option<String>,
    push_target: Option<PushTargetJson>,
    #[serde(default)]
    prior_worktree_ids: Vec<String>,
    workspace_status: Option<String>,
    #[serde(default)]
    diff_comments: Vec<DiffCommentJson>,
    mobile_diff_review: Option<MobileReviewJson>,
    parent_worktree_id: Option<String>,
    #[serde(default)]
    child_worktree_ids: Vec<String>,
    lineage: Option<LineageJson>,
    workspace_lineage: Option<WorkspaceLineageJson>,
    git: GitJson,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitJson {
    path: String,
    head: String,
    branch: String,
    is_bare: bool,
    is_sparse: Option<bool>,
    locked: Option<bool>,
    lock_reason: Option<String>,
    prunable: Option<bool>,
    prunable_reason: Option<String>,
    is_main_worktree: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushTargetJson {
    remote_name: String,
    branch_name: String,
    remote_url: Option<String>,
    remote_created: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptureJson {
    source: String,
    confidence: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LineageJson {
    worktree_id: String,
    worktree_instance_id: String,
    parent_worktree_id: String,
    parent_worktree_instance_id: String,
    origin: String,
    capture: CaptureJson,
    orchestration_run_id: Option<String>,
    task_id: Option<String>,
    coordinator_handle: Option<String>,
    created_by_terminal_handle: Option<String>,
    created_at: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceLineageJson {
    child_workspace_key: String,
    child_instance_id: Option<Option<String>>,
    parent_workspace_key: String,
    parent_instance_id: Option<Option<String>>,
    origin: String,
    capture: CaptureJson,
    task_id: Option<String>,
    orchestration_run_id: Option<String>,
    coordinator_handle: Option<String>,
    created_by_terminal_handle: Option<String>,
    created_at: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiffCommentJson {
    id: String,
    worktree_id: String,
    file_path: String,
    source: Option<String>,
    selected_text: Option<String>,
    start_line: Option<f64>,
    line_number: Option<f64>,
    body: String,
    created_at: f64,
    updated_at: Option<f64>,
    sent_at: Option<f64>,
    scope: Option<String>,
    old_path: Option<String>,
    diff_identity: Option<String>,
    side: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MobileReviewJson {
    version: f64,
    updated_at: Option<f64>,
    completed_at: Option<f64>,
    files: HashMap<String, MobileReviewFileJson>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MobileReviewFileJson {
    key: String,
    file_path: String,
    old_path: Option<String>,
    scope: String,
    last_opened_at: Option<f64>,
    last_seen_diff_identity: Option<String>,
    reviewed_at: Option<f64>,
    review_diff_identity: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DefaultTabsJson {
    tabs: Vec<DefaultTabJson>,
    run_commands: bool,
}

#[derive(Deserialize)]
struct DefaultTabJson {
    title: Option<String>,
    color: Option<String>,
    command: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartupTerminalJson {
    handle: String,
    pane_key: String,
    pty_id: String,
    surface: String,
    tab_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShowJson {
    worktree: RecordJson,
    revision: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SleepJson {
    worktree_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivateJson {
    repo_id: String,
    worktree_id: String,
    activated: bool,
    sleeping_agent_wake: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreservedBranchJson {
    branch_name: String,
    head: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveJson {
    removed: bool,
    preserved_branch: Option<PreservedBranchJson>,
    revision: i64,
}

#[derive(Deserialize)]
struct ForceDeleteBranchJson {
    deleted: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetJson {
    worktree: RecordJson,
    revision: i64,
}

#[derive(Deserialize)]
struct PersistSortOrderJson {
    updated: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetectedListJson {
    repo_id: String,
    revision: i64,
    authoritative: bool,
    source: String,
    worktrees: Vec<DetectedRecordJson>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetectedRecordJson {
    #[serde(flatten)]
    record: RecordJson,
    ownership: String,
    selected_checkout: bool,
    visible: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LineageListJson {
    lineage: HashMap<String, LineageJson>,
    workspace_lineage: HashMap<String, WorkspaceLineageJson>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", untagged)]
enum ResolvePrBaseJson {
    Error {
        error: String,
    },
    Success {
        base_branch: String,
        head_sha: String,
        branch_name_override: Option<String>,
        compare_base_ref: Option<String>,
        push_target: Option<PushTargetJson>,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BaseStatusEventJson {
    repo_id: String,
    worktree_id: String,
    status: String,
    base: String,
    behind: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentRowJson {
    pane_key: String,
    parent_pane_key: Option<String>,
    state: String,
    agent_type: Option<String>,
    prompt: String,
    task_title: Option<String>,
    display_name: Option<String>,
    last_assistant_message: Option<String>,
    tool_name: Option<String>,
    tool_input: Option<String>,
    interrupted: bool,
    state_started_at: i64,
    updated_at: i64,
}

fn agent_row(value: Value) -> Result<WorktreeAgentRow, Status> {
    let row: AgentRowJson = parse(value, "worktree agent row")?;
    Ok(WorktreeAgentRow {
        pane_key: row.pane_key,
        parent_pane_key: row.parent_pane_key,
        state: row.state,
        agent_type: row.agent_type,
        prompt: row.prompt,
        task_title: row.task_title,
        display_name: row.display_name,
        last_assistant_message: row.last_assistant_message,
        tool_name: row.tool_name,
        tool_input: row.tool_input,
        interrupted: row.interrupted,
        state_started_at: row.state_started_at,
        updated_at: row.updated_at,
    })
}

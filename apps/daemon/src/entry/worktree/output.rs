use agentstart_protocol::runtime::v1::{
    WorktreeArchive, WorktreeDiffComment, WorktreeLineage, WorktreeMobileDiffReview,
    WorktreeNullableInt64, WorktreeNullableString, WorktreeRecord, WorktreeServiceCreateResponse,
    WorktreeServiceListArchivesResponse, WorktreeServiceListResponse, WorktreeWorkspaceLineage,
    worktree_nullable_int64, worktree_nullable_string,
};
use serde_json::{Map, Value, json};

pub(super) fn archive_response(archive: WorktreeArchive, revision: i64) -> Value {
    json!({ "archive": archive_value(archive), "revision": revision })
}

pub(super) fn archives_response(response: WorktreeServiceListArchivesResponse) -> Value {
    json!({
        "archives": response.archives.into_iter().map(archive_value).collect::<Vec<_>>()
    })
}

pub(super) fn list_response(response: WorktreeServiceListResponse) -> Value {
    json!({
        "worktrees": response.worktrees.into_iter().map(record_value).collect::<Vec<_>>(),
        "totalCount": response.total_count,
        "truncated": response.truncated,
        "revision": response.revision
    })
}

pub(super) fn create_response(response: WorktreeServiceCreateResponse) -> Value {
    let mut value = Map::new();
    insert(&mut value, "revision", response.revision.map(Value::from));
    insert(&mut value, "worktree", response.worktree.map(record_value));
    insert(&mut value, "lineage", response.lineage.map(lineage_value));
    insert(
        &mut value,
        "workspaceLineage",
        response.workspace_lineage.map(workspace_lineage_value),
    );
    if !response.warnings.is_empty() {
        value.insert(
            "warnings".to_owned(),
            Value::Array(
                response
                    .warnings
                    .into_iter()
                    .map(|warning| {
                        json!({
                            "code": warning.code,
                            "message": warning.message,
                            "details": warning.details
                        })
                    })
                    .collect(),
            ),
        );
    }
    insert(
        &mut value,
        "setup",
        response.setup.map(|setup| {
            let mut value = Map::from_iter([
                (
                    "runnerScriptPath".to_owned(),
                    Value::String(setup.runner_script_path),
                ),
                (
                    "envVars".to_owned(),
                    Value::Object(string_map(setup.env_vars)),
                ),
            ]);
            insert(&mut value, "command", setup.command.map(Value::String));
            insert(
                &mut value,
                "waitForAgentStartup",
                setup.wait_for_agent_startup.map(Value::Bool),
            );
            Value::Object(value)
        }),
    );
    insert(
        &mut value,
        "setupReceipt",
        response.setup_receipt.map(|receipt| {
            let mut value = Map::from_iter([
                ("requested".to_owned(), Value::String(receipt.requested)),
                ("hookFound".to_owned(), Value::Bool(receipt.hook_found)),
                (
                    "startupPolicy".to_owned(),
                    Value::String(receipt.startup_policy),
                ),
                ("state".to_owned(), Value::String(receipt.state)),
            ]);
            insert(
                &mut value,
                "terminalHandle",
                receipt.terminal_handle.map(Value::String),
            );
            Value::Object(value)
        }),
    );
    insert(
        &mut value,
        "defaultTabs",
        response.default_tabs.map(|tabs| {
            json!({
                "tabs": tabs.tabs.into_iter().map(|tab| {
                    let mut value = Map::new();
                    insert(&mut value, "title", tab.title.map(Value::String));
                    insert(&mut value, "color", tab.color.map(Value::String));
                    insert(&mut value, "command", tab.command.map(Value::String));
                    Value::Object(value)
                }).collect::<Vec<_>>(),
                "runCommands": tabs.run_commands
            })
        }),
    );
    insert(&mut value, "warning", response.warning.map(Value::String));
    insert(
        &mut value,
        "initialBaseStatus",
        response.initial_base_status.map(|status| {
            let mut value = Map::from_iter([
                ("repoId".to_owned(), Value::String(status.repo_id)),
                ("worktreeId".to_owned(), Value::String(status.worktree_id)),
                ("status".to_owned(), Value::String(status.status)),
                ("base".to_owned(), Value::String(status.base)),
            ]);
            insert(&mut value, "remote", status.remote.map(Value::String));
            insert(&mut value, "behind", status.behind.map(Value::from));
            if !status.recent_subjects.is_empty() {
                value.insert(
                    "recentSubjects".to_owned(),
                    Value::Array(
                        status
                            .recent_subjects
                            .into_iter()
                            .map(Value::String)
                            .collect(),
                    ),
                );
            }
            Value::Object(value)
        }),
    );
    insert(
        &mut value,
        "localBaseRefRefresh",
        response.local_base_ref_refresh.map(|refresh| {
            let mut value = Map::from_iter([
                ("status".to_owned(), Value::String(refresh.status)),
                ("baseRef".to_owned(), Value::String(refresh.base_ref)),
                (
                    "localBranch".to_owned(),
                    Value::String(refresh.local_branch),
                ),
            ]);
            insert(
                &mut value,
                "ownerWorktreePath",
                refresh.owner_worktree_path.map(Value::String),
            );
            Value::Object(value)
        }),
    );
    insert(
        &mut value,
        "localBaseRefUpdateSuggestion",
        response.local_base_ref_update_suggestion.map(|suggestion| {
            json!({
                "baseRef": suggestion.base_ref,
                "localBranch": suggestion.local_branch,
                "behind": suggestion.behind
            })
        }),
    );
    insert(
        &mut value,
        "startupTerminal",
        response.startup_terminal.map(|terminal| {
            let mut value = Map::from_iter([("spawned".to_owned(), Value::Bool(terminal.spawned))]);
            insert(&mut value, "handle", terminal.handle.map(Value::String));
            insert(&mut value, "tabId", terminal.tab_id.map(Value::String));
            insert(
                &mut value,
                "paneKey",
                terminal.pane_key.map(nullable_string),
            );
            insert(&mut value, "ptyId", terminal.pty_id.map(nullable_string));
            insert(&mut value, "surface", terminal.surface.map(Value::String));
            Value::Object(value)
        }),
    );
    insert(
        &mut value,
        "timing",
        response.timing.map(|timing| {
            json!({
                "totalDurationMs": timing.total_duration_ms,
                "phases": timing.phases.into_iter().map(|phase| json!({
                    "phase": phase.phase,
                    "startedAtMs": phase.started_at_ms,
                    "durationMs": phase.duration_ms
                })).collect::<Vec<_>>()
            })
        }),
    );
    insert(
        &mut value,
        "agentTerminalHandle",
        response.agent_terminal_handle.map(Value::String),
    );
    Value::Object(value)
}

fn record_value(record: WorktreeRecord) -> Value {
    let mut value = Map::from_iter([
        ("id".to_owned(), Value::String(record.id)),
        ("repoId".to_owned(), Value::String(record.repo_id)),
        ("path".to_owned(), Value::String(record.path)),
        ("head".to_owned(), Value::String(record.head)),
        ("branch".to_owned(), Value::String(record.branch)),
        ("isBare".to_owned(), Value::Bool(record.is_bare)),
        (
            "isMainWorktree".to_owned(),
            Value::Bool(record.is_main_worktree),
        ),
        ("displayName".to_owned(), Value::String(record.display_name)),
        ("comment".to_owned(), Value::String(record.comment)),
        (
            "linkedPR".to_owned(),
            record.linked_pr.map(nullable_i64).unwrap_or(Value::Null),
        ),
        ("isArchived".to_owned(), Value::Bool(record.is_archived)),
        ("isUnread".to_owned(), Value::Bool(record.is_unread)),
        ("isPinned".to_owned(), Value::Bool(record.is_pinned)),
        ("sortOrder".to_owned(), Value::from(record.sort_order)),
        (
            "lastActivityAt".to_owned(),
            Value::from(record.last_activity_at),
        ),
        (
            "parentWorktreeId".to_owned(),
            record
                .parent_worktree_id
                .map(nullable_string)
                .unwrap_or(Value::Null),
        ),
        (
            "childWorktreeIds".to_owned(),
            strings(record.child_worktree_ids),
        ),
        (
            "lineage".to_owned(),
            record.lineage.map(lineage_value).unwrap_or(Value::Null),
        ),
        (
            "workspaceLineage".to_owned(),
            record
                .workspace_lineage
                .map(workspace_lineage_value)
                .unwrap_or(Value::Null),
        ),
    ]);
    insert(
        &mut value,
        "instanceId",
        record.instance_id.map(Value::String),
    );
    insert(
        &mut value,
        "projectId",
        record.project_id.map(Value::String),
    );
    insert(&mut value, "hostId", record.host_id.map(Value::String));
    insert(
        &mut value,
        "projectHostSetupId",
        record.project_host_setup_id.map(Value::String),
    );
    insert(&mut value, "isSparse", record.is_sparse.map(Value::Bool));
    insert(&mut value, "locked", record.locked.map(Value::Bool));
    insert(
        &mut value,
        "lockReason",
        record.lock_reason.map(Value::String),
    );
    insert(&mut value, "prunable", record.prunable.map(Value::Bool));
    insert(
        &mut value,
        "prunableReason",
        record.prunable_reason.map(Value::String),
    );
    insert(
        &mut value,
        "manualOrder",
        record.manual_order.map(Value::from),
    );
    insert(&mut value, "createdAt", record.created_at.map(Value::from));
    insert(
        &mut value,
        "createdWithAgent",
        record.created_with_agent.map(Value::String),
    );
    insert(
        &mut value,
        "pendingFirstAgentMessageRename",
        record.pending_first_agent_message_rename.map(Value::Bool),
    );
    insert(
        &mut value,
        "firstAgentMessageRenameError",
        record.first_agent_message_rename_error.map(nullable_string),
    );
    if !record.sparse_directories.is_empty() {
        value.insert(
            "sparseDirectories".to_owned(),
            strings(record.sparse_directories),
        );
    }
    insert(
        &mut value,
        "sparseBaseRef",
        record.sparse_base_ref.map(Value::String),
    );
    insert(
        &mut value,
        "sparsePresetId",
        record.sparse_preset_id.map(Value::String),
    );
    insert(&mut value, "baseRef", record.base_ref.map(Value::String));
    insert(
        &mut value,
        "pushTarget",
        record.push_target.map(|target| {
            let mut value = Map::from_iter([
                ("remoteName".to_owned(), Value::String(target.remote_name)),
                ("branchName".to_owned(), Value::String(target.branch_name)),
            ]);
            insert(
                &mut value,
                "remoteUrl",
                target.remote_url.map(Value::String),
            );
            insert(
                &mut value,
                "remoteCreated",
                target.remote_created.map(Value::Bool),
            );
            Value::Object(value)
        }),
    );
    if !record.prior_worktree_ids.is_empty() {
        value.insert(
            "priorWorktreeIds".to_owned(),
            strings(record.prior_worktree_ids),
        );
    }
    insert(
        &mut value,
        "workspaceStatus",
        record.workspace_status.map(Value::String),
    );
    if !record.diff_comments.is_empty() {
        value.insert(
            "diffComments".to_owned(),
            Value::Array(
                record
                    .diff_comments
                    .into_iter()
                    .map(diff_comment_value)
                    .collect(),
            ),
        );
    }
    insert(
        &mut value,
        "mobileDiffReview",
        record.mobile_diff_review.map(mobile_review_value),
    );
    insert(&mut value, "git", record.git.map(git_value));
    Value::Object(value)
}

fn git_value(git: agentstart_protocol::runtime::v1::WorktreeGitInfo) -> Value {
    let mut value = Map::from_iter([
        ("path".to_owned(), Value::String(git.path)),
        ("head".to_owned(), Value::String(git.head)),
        ("branch".to_owned(), Value::String(git.branch)),
        ("isBare".to_owned(), Value::Bool(git.is_bare)),
        (
            "isMainWorktree".to_owned(),
            Value::Bool(git.is_main_worktree),
        ),
    ]);
    insert(&mut value, "isSparse", git.is_sparse.map(Value::Bool));
    insert(&mut value, "locked", git.locked.map(Value::Bool));
    insert(&mut value, "lockReason", git.lock_reason.map(Value::String));
    insert(&mut value, "prunable", git.prunable.map(Value::Bool));
    insert(
        &mut value,
        "prunableReason",
        git.prunable_reason.map(Value::String),
    );
    Value::Object(value)
}

fn lineage_value(lineage: WorktreeLineage) -> Value {
    let mut value = Map::from_iter([
        ("worktreeId".to_owned(), Value::String(lineage.worktree_id)),
        (
            "worktreeInstanceId".to_owned(),
            Value::String(lineage.worktree_instance_id),
        ),
        (
            "parentWorktreeId".to_owned(),
            Value::String(lineage.parent_worktree_id),
        ),
        (
            "parentWorktreeInstanceId".to_owned(),
            Value::String(lineage.parent_worktree_instance_id),
        ),
        ("origin".to_owned(), Value::String(lineage.origin)),
        ("createdAt".to_owned(), Value::from(lineage.created_at)),
    ]);
    insert(
        &mut value,
        "capture",
        lineage
            .capture
            .map(|capture| json!({ "source": capture.source, "confidence": capture.confidence })),
    );
    insert(
        &mut value,
        "orchestrationRunId",
        lineage.orchestration_run_id.map(Value::String),
    );
    insert(&mut value, "taskId", lineage.task_id.map(Value::String));
    insert(
        &mut value,
        "coordinatorHandle",
        lineage.coordinator_handle.map(Value::String),
    );
    insert(
        &mut value,
        "createdByTerminalHandle",
        lineage.created_by_terminal_handle.map(Value::String),
    );
    Value::Object(value)
}

fn workspace_lineage_value(lineage: WorktreeWorkspaceLineage) -> Value {
    let mut value = Map::from_iter([
        (
            "childWorkspaceKey".to_owned(),
            Value::String(lineage.child_workspace_key),
        ),
        (
            "parentWorkspaceKey".to_owned(),
            Value::String(lineage.parent_workspace_key),
        ),
        ("origin".to_owned(), Value::String(lineage.origin)),
        ("createdAt".to_owned(), Value::from(lineage.created_at)),
    ]);
    insert(
        &mut value,
        "childInstanceId",
        lineage.child_instance_id.map(nullable_string),
    );
    insert(
        &mut value,
        "parentInstanceId",
        lineage.parent_instance_id.map(nullable_string),
    );
    insert(
        &mut value,
        "capture",
        lineage
            .capture
            .map(|capture| json!({ "source": capture.source, "confidence": capture.confidence })),
    );
    insert(&mut value, "taskId", lineage.task_id.map(Value::String));
    insert(
        &mut value,
        "orchestrationRunId",
        lineage.orchestration_run_id.map(Value::String),
    );
    insert(
        &mut value,
        "coordinatorHandle",
        lineage.coordinator_handle.map(Value::String),
    );
    insert(
        &mut value,
        "createdByTerminalHandle",
        lineage.created_by_terminal_handle.map(Value::String),
    );
    Value::Object(value)
}

fn diff_comment_value(comment: WorktreeDiffComment) -> Value {
    let mut value = Map::from_iter([
        ("id".to_owned(), Value::String(comment.id)),
        ("worktreeId".to_owned(), Value::String(comment.worktree_id)),
        ("filePath".to_owned(), Value::String(comment.file_path)),
        ("body".to_owned(), Value::String(comment.body)),
        ("createdAt".to_owned(), Value::from(comment.created_at)),
        ("side".to_owned(), Value::String(comment.side)),
    ]);
    insert(&mut value, "source", comment.source.map(Value::String));
    insert(
        &mut value,
        "selectedText",
        comment.selected_text.map(Value::String),
    );
    insert(&mut value, "startLine", comment.start_line.map(Value::from));
    insert(
        &mut value,
        "lineNumber",
        comment.line_number.map(Value::from),
    );
    insert(&mut value, "updatedAt", comment.updated_at.map(Value::from));
    insert(&mut value, "sentAt", comment.sent_at.map(Value::from));
    insert(&mut value, "scope", comment.scope.map(Value::String));
    insert(&mut value, "oldPath", comment.old_path.map(Value::String));
    insert(
        &mut value,
        "diffIdentity",
        comment.diff_identity.map(Value::String),
    );
    Value::Object(value)
}

fn mobile_review_value(review: WorktreeMobileDiffReview) -> Value {
    let mut value = Map::from_iter([
        ("version".to_owned(), Value::from(review.version)),
        (
            "files".to_owned(),
            Value::Object(
                review
                    .files
                    .into_iter()
                    .map(|(key, file)| {
                        let mut value = Map::from_iter([
                            ("key".to_owned(), Value::String(file.key)),
                            ("filePath".to_owned(), Value::String(file.file_path)),
                            ("scope".to_owned(), Value::String(file.scope)),
                        ]);
                        insert(&mut value, "oldPath", file.old_path.map(Value::String));
                        insert(
                            &mut value,
                            "lastOpenedAt",
                            file.last_opened_at.map(Value::from),
                        );
                        insert(
                            &mut value,
                            "lastSeenDiffIdentity",
                            file.last_seen_diff_identity.map(Value::String),
                        );
                        insert(&mut value, "reviewedAt", file.reviewed_at.map(Value::from));
                        insert(
                            &mut value,
                            "reviewDiffIdentity",
                            file.review_diff_identity.map(Value::String),
                        );
                        (key, Value::Object(value))
                    })
                    .collect(),
            ),
        ),
    ]);
    insert(&mut value, "updatedAt", review.updated_at.map(Value::from));
    insert(
        &mut value,
        "completedAt",
        review.completed_at.map(Value::from),
    );
    Value::Object(value)
}

fn archive_value(archive: WorktreeArchive) -> Value {
    json!({
        "branch": archive.branch,
        "createdAt": archive.created_at,
        "failureDetail": archive.failure_detail.map(nullable_string).unwrap_or(Value::Null),
        "head": archive.head,
        "id": archive.id,
        "originalWorktreeId": archive.original_worktree_id,
        "path": archive.path,
        "repoId": archive.repo_id,
        "restoredAt": archive.restored_at,
        "stashOid": archive.stash_oid,
        "status": archive.status
    })
}

fn nullable_i64(value: WorktreeNullableInt64) -> Value {
    match value.value {
        Some(worktree_nullable_int64::Value::Number(value)) => Value::from(value),
        Some(worktree_nullable_int64::Value::Null(_)) | None => Value::Null,
    }
}

fn nullable_string(value: WorktreeNullableString) -> Value {
    match value.value {
        Some(worktree_nullable_string::Value::Text(value)) => Value::String(value),
        Some(worktree_nullable_string::Value::Null(_)) | None => Value::Null,
    }
}

fn strings(values: Vec<String>) -> Value {
    Value::Array(values.into_iter().map(Value::String).collect())
}

fn string_map(values: std::collections::HashMap<String, String>) -> Map<String, Value> {
    values
        .into_iter()
        .map(|(key, value)| (key, Value::String(value)))
        .collect()
}

fn insert(target: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        target.insert(key.to_owned(), value);
    }
}

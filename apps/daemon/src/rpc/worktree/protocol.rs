use serde_json::{Map, Value};
use yiru_protocol::protocol::v1::{ErrorDetail, Status, StatusCode};
use yiru_protocol::runtime::v1::{
    WorktreeDiffComment, WorktreeMobileDiffReview, WorktreeMobileDiffReviewFile,
    WorktreePushTarget, WorktreeRevisionConflict, WorktreeServiceActivateRequest,
    WorktreeServiceArchiveRequest, WorktreeServiceArchiveResponse,
    WorktreeServiceBranchRenameFailureOutputRequest,
    WorktreeServiceBranchRenameFailureOutputResponse, WorktreeServiceCreateRequest,
    WorktreeServiceDetectedListRequest, WorktreeServiceForceDeleteBranchRequest,
    WorktreeServiceForceDeleteBranchResponse, WorktreeServiceLineageListRequest,
    WorktreeServiceListArchivesRequest, WorktreeServiceListArchivesResponse,
    WorktreeServiceListRequest, WorktreeServiceListResponse,
    WorktreeServicePersistSortOrderRequest, WorktreeServicePrefetchCreateBaseRequest,
    WorktreeServicePrefetchCreateBaseResponse, WorktreeServicePsRequest,
    WorktreeServiceRemoveRequest, WorktreeServiceResolvePrBaseRequest,
    WorktreeServiceRestoreRequest, WorktreeServiceRestoreResponse, WorktreeServiceSetRequest,
    WorktreeServiceShowRequest, WorktreeServiceSleepRequest, WorktreeServiceSleepResponse,
    WorktreeServiceSubscribeStateEventsRequest, WorktreeServiceSubscribeStateEventsResponse,
    WorktreeSetPatch, WorktreeStateEventsReady, worktree_nullable_int64,
    worktree_nullable_push_target, worktree_service_subscribe_state_events_response,
};
use yiru_protocol::transport::{decode, encode};

use crate::projects::ProjectCatalogError;
use crate::worktrees::WorktreeAuthorityError;

use super::super::protocol_call::ProtocolCallContext;
use super::protocol_values::{
    activate_result, archive_result, archives_result, base_status_event,
    branch_rename_failure_output_result, create_result, detected_list_result,
    force_delete_branch_result, lineage_list_result, list_result, persist_sort_order_result,
    ps_result, remove_result, resolve_pr_base_result, set_result, show_result, sleep_result,
};
use super::{
    WorktreeRpc, WorktreeRpcError, parse_activate, parse_archive, parse_archive_list,
    parse_archive_restore, parse_create, parse_force_delete_branch, parse_list, parse_order,
    parse_prefetch_create_base, parse_ps, parse_remove, parse_repo_selector, parse_resolve_pr_base,
    parse_selector, parse_set,
};

pub(in crate::rpc) async fn archive(rpc: &WorktreeRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceArchiveRequest>(payload)?;
    let raw = object([
        ("worktree", Value::String(request.worktree)),
        ("expectedRevision", Value::from(request.expected_revision)),
        ("deleteBranch", Value::Bool(request.delete_branch)),
    ]);
    let input = parse_archive(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .archives
        .archive(
            &input.worktree,
            input.expected_revision,
            input.delete_branch,
        )
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Archive(error)))?;
    let (archive, revision) = archive_result(result)?;
    Ok(encode(&WorktreeServiceArchiveResponse {
        archive: Some(archive),
        revision,
    }))
}

pub(in crate::rpc) async fn list(rpc: &WorktreeRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceListRequest>(payload)?;
    let mut raw = Map::new();
    insert_option(&mut raw, "repo", request.repo.map(Value::String));
    insert_option(&mut raw, "limit", request.limit.map(Value::from));
    let raw = Value::Object(raw);
    let input = parse_list(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .authority
        .list(input.repo.as_deref(), input.limit)
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    let result = list_result(result)?;
    Ok(encode(&WorktreeServiceListResponse {
        worktrees: result.worktrees,
        total_count: result.total_count,
        truncated: result.truncated,
    }))
}

pub(in crate::rpc) async fn create(
    rpc: &WorktreeRpc,
    payload: &[u8],
    mobile: bool,
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceCreateRequest>(payload)?;
    let raw = create_value(request);
    let input = parse_create(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .authority
        .create(&input, mobile)
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&create_result(result)?))
}

pub(in crate::rpc) async fn list_archives(
    rpc: &WorktreeRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceListArchivesRequest>(payload)?;
    let mut raw = Map::new();
    insert_option(&mut raw, "repo", request.repo.map(Value::String));
    let raw = Value::Object(raw);
    let input = parse_archive_list(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .archives
        .list(input.repo.as_deref())
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Archive(error)))?;
    Ok(encode(&WorktreeServiceListArchivesResponse {
        archives: archives_result(result)?,
    }))
}

pub(in crate::rpc) async fn restore(rpc: &WorktreeRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceRestoreRequest>(payload)?;
    let raw = object([
        ("archiveId", Value::String(request.archive)),
        ("expectedRevision", Value::from(request.expected_revision)),
    ]);
    let input = parse_archive_restore(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .archives
        .restore(&input.archive_id, input.expected_revision)
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Archive(error)))?;
    let (archive, revision) = archive_result(result)?;
    Ok(encode(&WorktreeServiceRestoreResponse {
        archive: Some(archive),
        revision,
    }))
}

pub(in crate::rpc) async fn ps(
    rpc: &WorktreeRpc,
    payload: &[u8],
    mobile: bool,
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServicePsRequest>(payload)?;
    let mut raw = Map::new();
    insert_option(&mut raw, "limit", request.limit.map(Value::from));
    let raw = Value::Object(raw);
    let input = parse_ps(Some(&raw)).map_err(invalid_input)?;
    let (mut rows, bindings) = rpc.agent_status.worktree_rows();
    let contexts = rpc
        .orchestration
        .agent_contexts(bindings)
        .await
        .map_err(|error| status(StatusCode::Internal, &error.to_string()))?;
    for row in &mut rows {
        if let Some(context) = row
            .get("paneKey")
            .and_then(Value::as_str)
            .and_then(|pane| contexts.get(pane))
            .and_then(Value::as_object)
        {
            if context.get("dispatchStatus").and_then(Value::as_str) == Some("completed")
                && row.get("state").and_then(Value::as_str) != Some("done")
            {
                continue;
            }
            let context = context.clone();
            if let Some(row) = row.as_object_mut() {
                row.extend(context);
            }
        }
    }
    let result = rpc
        .authority
        .ps(input.limit, mobile, rows)
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&ps_result(result)?))
}

pub(in crate::rpc) async fn show(rpc: &WorktreeRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceShowRequest>(payload)?;
    let raw = object([("worktree", Value::String(request.worktree))]);
    let input = parse_selector(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .authority
        .show(&input.worktree)
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&show_result(result)?))
}

pub(in crate::rpc) async fn sleep(rpc: &WorktreeRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceSleepRequest>(payload)?;
    let raw = object([("worktree", Value::String(request.worktree))]);
    let input = parse_selector(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .authority
        .sleep(&input.worktree, || rpc.agent_status.worktree_rows().0)
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&WorktreeServiceSleepResponse {
        worktree_id: sleep_result(result)?,
    }))
}

pub(in crate::rpc) async fn activate(rpc: &WorktreeRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceActivateRequest>(payload)?;
    let raw = object([
        ("worktree", Value::String(request.worktree)),
        ("notifyClients", Value::Bool(request.notify_clients)),
    ]);
    let input = parse_activate(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .authority
        .activate(&input.worktree, input.notify_clients)
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&activate_result(result)?))
}

pub(in crate::rpc) async fn prefetch_create_base(
    rpc: &WorktreeRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServicePrefetchCreateBaseRequest>(payload)?;
    let mut raw = Map::from_iter([("repo".to_owned(), Value::String(request.repo))]);
    insert_string(&mut raw, "baseBranch", request.base_branch);
    let raw = Value::Object(raw);
    let input = parse_prefetch_create_base(Some(&raw)).map_err(invalid_input)?;
    rpc.authority
        .prefetch_create_base(&input.repo, input.base_branch.as_deref())
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&WorktreeServicePrefetchCreateBaseResponse {}))
}

pub(in crate::rpc) async fn resolve_pr_base(
    rpc: &WorktreeRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceResolvePrBaseRequest>(payload)?;
    let mut raw = Map::from_iter([
        ("repo".to_owned(), Value::String(request.repo)),
        ("prNumber".to_owned(), Value::from(request.pr_number)),
        (
            "isCrossRepository".to_owned(),
            Value::Bool(request.is_cross_repository),
        ),
    ]);
    insert_string(&mut raw, "headRefName", request.head_ref_name);
    insert_string(&mut raw, "baseRefName", request.base_ref_name);
    let raw = Value::Object(raw);
    let input = parse_resolve_pr_base(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .authority
        .resolve_pr_base(
            &input.repo,
            input.pr_number,
            input.head_ref_name.as_deref(),
            input.base_ref_name.as_deref(),
            input.is_cross_repository,
        )
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&resolve_pr_base_result(result)?))
}

pub(in crate::rpc) async fn remove(rpc: &WorktreeRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceRemoveRequest>(payload)?;
    let raw = object([
        ("worktree", Value::String(request.worktree)),
        ("expectedRevision", Value::from(request.expected_revision)),
        ("force", Value::Bool(request.force)),
        ("runHooks", Value::Bool(request.run_hooks)),
    ]);
    let input = parse_remove(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .authority
        .remove(
            &input.worktree,
            input.expected_revision,
            input.force,
            input.run_hooks,
        )
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&remove_result(result)?))
}

pub(in crate::rpc) async fn force_delete_branch(
    rpc: &WorktreeRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceForceDeleteBranchRequest>(payload)?;
    let raw = object([
        ("worktree", Value::String(request.worktree)),
        ("branchName", Value::String(request.branch_name)),
        ("expectedHead", Value::String(request.expected_head)),
    ]);
    let input = parse_force_delete_branch(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .authority
        .force_delete_branch(&input.worktree, &input.branch_name, &input.expected_head)
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&WorktreeServiceForceDeleteBranchResponse {
        deleted: force_delete_branch_result(result)?,
    }))
}

pub(in crate::rpc) async fn set(rpc: &WorktreeRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceSetRequest>(payload)?;
    let mut raw = Map::from_iter([
        ("worktree".to_owned(), Value::String(request.worktree)),
        (
            "expectedRevision".to_owned(),
            Value::from(request.expected_revision),
        ),
    ]);
    if let Value::Object(patch) = set_patch_value(request.patch.unwrap_or_default()) {
        raw.extend(patch);
    }
    let raw = Value::Object(raw);
    let input = parse_set(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .authority
        .set(&input.worktree, input.expected_revision, input.patch)
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&set_result(result)?))
}

pub(in crate::rpc) async fn persist_sort_order(
    rpc: &WorktreeRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServicePersistSortOrderRequest>(payload)?;
    let raw = object([(
        "orderedIds",
        Value::Array(request.ordered_ids.into_iter().map(Value::String).collect()),
    )]);
    let ordered_ids = parse_order(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .authority
        .persist_sort_order(ordered_ids)
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&persist_sort_order_result(result)?))
}

pub(in crate::rpc) async fn detected_list(
    rpc: &WorktreeRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceDetectedListRequest>(payload)?;
    let raw = object([("repo", Value::String(request.repo))]);
    let repo = parse_repo_selector(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .authority
        .detected_list(&repo)
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&detected_list_result(result)?))
}

pub(in crate::rpc) async fn lineage_list(
    rpc: &WorktreeRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let _request = decode::<WorktreeServiceLineageListRequest>(payload)?;
    let result = rpc
        .authority
        .lineage_list()
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&lineage_list_result(result)?))
}

pub(in crate::rpc) async fn branch_rename_failure_output(
    rpc: &WorktreeRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorktreeServiceBranchRenameFailureOutputRequest>(payload)?;
    let raw = object([("worktree", Value::String(request.worktree))]);
    let input = parse_selector(Some(&raw)).map_err(invalid_input)?;
    let result = rpc
        .authority
        .branch_rename_failure_output(&input.worktree)
        .await
        .map_err(|error| rpc_status(WorktreeRpcError::Authority(error)))?;
    Ok(encode(&WorktreeServiceBranchRenameFailureOutputResponse {
        output: branch_rename_failure_output_result(result)?,
    }))
}

/// Tail base-drift signals for every repo on the host. Cancellation drops this
/// future (and the broadcast receiver with it), matching the workspace events
/// and notifications subscribe handlers.
pub(in crate::rpc) async fn subscribe_state_events(
    rpc: &WorktreeRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let _request = decode::<WorktreeServiceSubscribeStateEventsRequest>(payload)?;
    let mut events = rpc.authority.subscribe_state_events();
    context
        .send_stream_payload(encode(&WorktreeServiceSubscribeStateEventsResponse {
            event: Some(
                worktree_service_subscribe_state_events_response::Event::Ready(
                    WorktreeStateEventsReady {
                        subscription_id: format!("worktree-state-events-{}", context.call_id()),
                    },
                ),
            ),
        }))
        .await?;
    loop {
        match events.recv().await {
            Ok(event) => {
                context
                    .send_stream_payload(encode(&WorktreeServiceSubscribeStateEventsResponse {
                        event: Some(
                            worktree_service_subscribe_state_events_response::Event::BaseStatus(
                                base_status_event(event)?,
                            ),
                        ),
                    }))
                    .await?;
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
        }
    }
    Ok(())
}

fn set_patch_value(patch: WorktreeSetPatch) -> Value {
    let mut raw = Map::new();
    insert_string(&mut raw, "displayName", patch.display_name);
    insert_string(&mut raw, "sparseBaseRef", patch.sparse_base_ref);
    insert_string(&mut raw, "sparsePresetId", patch.sparse_preset_id);
    insert_string(&mut raw, "baseRef", patch.base_ref);
    insert_string(&mut raw, "workspaceStatus", patch.workspace_status);
    insert_string(&mut raw, "comment", patch.comment);
    insert_option(&mut raw, "isArchived", patch.is_archived.map(Value::Bool));
    insert_option(&mut raw, "isUnread", patch.is_unread.map(Value::Bool));
    insert_option(&mut raw, "isPinned", patch.is_pinned.map(Value::Bool));
    insert_option(
        &mut raw,
        "pendingFirstAgentMessageRename",
        patch.pending_first_agent_message_rename.map(Value::Bool),
    );
    insert_option(&mut raw, "sortOrder", patch.sort_order.map(Value::from));
    insert_option(&mut raw, "manualOrder", patch.manual_order.map(Value::from));
    insert_option(
        &mut raw,
        "lastActivityAt",
        patch.last_activity_at.map(Value::from),
    );
    insert_option(&mut raw, "createdAt", patch.created_at.map(Value::from));
    if let Some(linked_pr) = patch.linked_pr.and_then(|value| value.value) {
        raw.insert(
            "linkedPR".to_owned(),
            match linked_pr {
                worktree_nullable_int64::Value::Number(value) => Value::from(value),
                worktree_nullable_int64::Value::Null(_) => Value::Null,
            },
        );
    }
    if let Some(directories) = patch.sparse_directories {
        raw.insert(
            "sparseDirectories".to_owned(),
            Value::Array(directories.values.into_iter().map(Value::String).collect()),
        );
    }
    if let Some(push_target) = patch.push_target.and_then(|value| value.value) {
        raw.insert(
            "pushTarget".to_owned(),
            match push_target {
                worktree_nullable_push_target::Value::Target(target) => {
                    push_target_input_value(target)
                }
                worktree_nullable_push_target::Value::Null(_) => Value::Null,
            },
        );
    }
    if let Some(diff_comments) = patch.diff_comments {
        raw.insert(
            "diffComments".to_owned(),
            Value::Array(
                diff_comments
                    .values
                    .into_iter()
                    .map(diff_comment_input_value)
                    .collect(),
            ),
        );
    }
    if let Some(review) = patch.mobile_diff_review {
        raw.insert(
            "mobileDiffReview".to_owned(),
            mobile_diff_review_input_value(review),
        );
    }
    Value::Object(raw)
}

fn push_target_input_value(target: WorktreePushTarget) -> Value {
    let mut value = Map::from_iter([
        ("remoteName".to_owned(), Value::String(target.remote_name)),
        ("branchName".to_owned(), Value::String(target.branch_name)),
    ]);
    insert_string(&mut value, "remoteUrl", target.remote_url);
    insert_option(
        &mut value,
        "remoteCreated",
        target.remote_created.map(Value::Bool),
    );
    Value::Object(value)
}

fn diff_comment_input_value(comment: WorktreeDiffComment) -> Value {
    let mut value = Map::from_iter([
        ("id".to_owned(), Value::String(comment.id)),
        ("worktreeId".to_owned(), Value::String(comment.worktree_id)),
        ("filePath".to_owned(), Value::String(comment.file_path)),
        ("body".to_owned(), Value::String(comment.body)),
        ("createdAt".to_owned(), Value::from(comment.created_at)),
        ("side".to_owned(), Value::String(comment.side)),
    ]);
    insert_string(&mut value, "source", comment.source);
    insert_string(&mut value, "selectedText", comment.selected_text);
    insert_option(&mut value, "startLine", comment.start_line.map(Value::from));
    insert_option(
        &mut value,
        "lineNumber",
        comment.line_number.map(Value::from),
    );
    insert_option(&mut value, "updatedAt", comment.updated_at.map(Value::from));
    insert_option(&mut value, "sentAt", comment.sent_at.map(Value::from));
    insert_string(&mut value, "scope", comment.scope);
    insert_string(&mut value, "oldPath", comment.old_path);
    insert_string(&mut value, "diffIdentity", comment.diff_identity);
    Value::Object(value)
}

fn mobile_diff_review_input_value(review: WorktreeMobileDiffReview) -> Value {
    let mut value = Map::from_iter([
        ("version".to_owned(), Value::from(review.version)),
        (
            "files".to_owned(),
            Value::Object(
                review
                    .files
                    .into_iter()
                    .map(|(key, file)| (key, mobile_diff_review_file_input_value(file)))
                    .collect(),
            ),
        ),
    ]);
    insert_option(&mut value, "updatedAt", review.updated_at.map(Value::from));
    insert_option(
        &mut value,
        "completedAt",
        review.completed_at.map(Value::from),
    );
    Value::Object(value)
}

fn mobile_diff_review_file_input_value(file: WorktreeMobileDiffReviewFile) -> Value {
    let mut value = Map::from_iter([
        ("key".to_owned(), Value::String(file.key)),
        ("filePath".to_owned(), Value::String(file.file_path)),
        ("scope".to_owned(), Value::String(file.scope)),
    ]);
    insert_string(&mut value, "oldPath", file.old_path);
    insert_option(
        &mut value,
        "lastOpenedAt",
        file.last_opened_at.map(Value::from),
    );
    insert_string(
        &mut value,
        "lastSeenDiffIdentity",
        file.last_seen_diff_identity,
    );
    insert_option(&mut value, "reviewedAt", file.reviewed_at.map(Value::from));
    insert_string(&mut value, "reviewDiffIdentity", file.review_diff_identity);
    Value::Object(value)
}

fn create_value(request: WorktreeServiceCreateRequest) -> Value {
    let mut raw = Map::from_iter([
        ("repo".to_owned(), Value::String(request.repo)),
        (
            "expectedRevision".to_owned(),
            Value::from(request.expected_revision),
        ),
    ]);
    insert_string(&mut raw, "operationId", request.operation_id);
    insert_string(&mut raw, "name", request.name);
    insert_string(&mut raw, "baseBranch", request.base_branch);
    insert_string(&mut raw, "compareBaseRef", request.compare_base_ref);
    insert_string(&mut raw, "branchNameOverride", request.branch_name_override);
    if let Some(linked_pr) = request.linked_pr.and_then(|value| value.value) {
        raw.insert(
            "linkedPR".to_owned(),
            match linked_pr {
                worktree_nullable_int64::Value::Number(value) => Value::from(value),
                worktree_nullable_int64::Value::Null(_) => Value::Null,
            },
        );
    }
    insert_string(&mut raw, "comment", request.comment);
    insert_string(&mut raw, "displayName", request.display_name);
    insert_string(&mut raw, "telemetrySource", request.telemetry_source);
    insert_string(&mut raw, "workspaceStatus", request.workspace_status);
    insert_option(
        &mut raw,
        "manualOrder",
        request.manual_order.map(Value::from),
    );
    if let Some(sparse) = request.sparse_checkout {
        let mut value = Map::from_iter([(
            "directories".to_owned(),
            Value::Array(sparse.directories.into_iter().map(Value::String).collect()),
        )]);
        insert_string(&mut value, "presetId", sparse.preset_id);
        raw.insert("sparseCheckout".to_owned(), Value::Object(value));
    }
    if let Some(target) = request.push_target {
        let mut value = Map::from_iter([
            ("remoteName".to_owned(), Value::String(target.remote_name)),
            ("branchName".to_owned(), Value::String(target.branch_name)),
        ]);
        insert_string(&mut value, "remoteUrl", target.remote_url);
        insert_option(
            &mut value,
            "remoteCreated",
            target.remote_created.map(Value::Bool),
        );
        raw.insert("pushTarget".to_owned(), Value::Object(value));
    }
    insert_option(&mut raw, "runHooks", request.run_hooks.map(Value::Bool));
    insert_option(&mut raw, "activate", request.activate.map(Value::Bool));
    insert_string(&mut raw, "parentWorkspace", request.parent_workspace);
    insert_string(&mut raw, "envParentWorkspace", request.env_parent_workspace);
    insert_string(&mut raw, "parentWorktree", request.parent_worktree);
    insert_string(&mut raw, "cwdParentWorktree", request.cwd_parent_worktree);
    insert_option(&mut raw, "noParent", request.no_parent.map(Value::Bool));
    insert_string(
        &mut raw,
        "callerTerminalHandle",
        request.caller_terminal_handle,
    );
    if let Some(context) = request.orchestration_context {
        let mut value = Map::new();
        insert_string(&mut value, "parentWorktreeId", context.parent_worktree_id);
        insert_string(
            &mut value,
            "orchestrationRunId",
            context.orchestration_run_id,
        );
        insert_string(&mut value, "taskId", context.task_id);
        insert_string(&mut value, "coordinatorHandle", context.coordinator_handle);
        raw.insert("orchestrationContext".to_owned(), Value::Object(value));
    }
    insert_string(&mut raw, "setupDecision", request.setup_decision);
    insert_string(&mut raw, "startupCommand", request.startup_command);
    if !request.startup_env.is_empty() {
        raw.insert("startupEnv".to_owned(), string_map(request.startup_env));
    }
    if let Some(config) = request.startup_launch_config {
        let mut value = Map::from_iter([
            ("agentArgs".to_owned(), Value::String(config.agent_args)),
            ("agentEnv".to_owned(), string_map(config.agent_env)),
        ]);
        insert_string(&mut value, "agentCommand", config.agent_command);
        insert_string(&mut value, "ompResumeFilePath", config.omp_resume_file_path);
        raw.insert("startupLaunchConfig".to_owned(), Value::Object(value));
    }
    insert_string(
        &mut raw,
        "startupCommandDelivery",
        request.startup_command_delivery,
    );
    insert_string(&mut raw, "startupAgent", request.startup_agent);
    insert_string(&mut raw, "startupPrompt", request.startup_prompt);
    insert_string(&mut raw, "startupDraft", request.startup_draft);
    insert_string(&mut raw, "createdWithAgent", request.created_with_agent);
    insert_option(
        &mut raw,
        "pendingFirstAgentMessageRename",
        request.pending_first_agent_message_rename.map(Value::Bool),
    );
    Value::Object(raw)
}

fn string_map(values: std::collections::HashMap<String, String>) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(key, value)| (key, Value::String(value)))
            .collect(),
    )
}

fn object<const N: usize>(values: [(&str, Value); N]) -> Value {
    Value::Object(
        values
            .into_iter()
            .map(|(key, value)| (key.to_owned(), value))
            .collect(),
    )
}

fn insert_string(target: &mut Map<String, Value>, key: &str, value: Option<String>) {
    insert_option(target, key, value.map(Value::String));
}

fn insert_option(target: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    if let Some(value) = value {
        target.insert(key.to_owned(), value);
    }
}

fn invalid_input(error: super::WorktreeInputFailure) -> Status {
    status(
        StatusCode::InvalidArgument,
        &format!("Input validation failed: {}", error.data),
    )
}

fn rpc_status(error: WorktreeRpcError) -> Status {
    match error {
        WorktreeRpcError::Authority(WorktreeAuthorityError::InvalidLimit) => {
            status(StatusCode::Internal, "invalid_limit")
        }
        WorktreeRpcError::Authority(WorktreeAuthorityError::Project(
            ProjectCatalogError::RevisionConflict {
                actual_revision,
                expected_revision,
                scope,
            },
        )) => revision_conflict(actual_revision, expected_revision, scope),
        WorktreeRpcError::Archive(crate::worktrees::WorktreeArchiveAuthorityError::Project(
            ProjectCatalogError::RevisionConflict {
                actual_revision,
                expected_revision,
                scope,
            },
        )) => revision_conflict(actual_revision, expected_revision, scope),
        WorktreeRpcError::Authority(error) => status(StatusCode::Internal, &error.to_string()),
        WorktreeRpcError::Archive(error) => status(StatusCode::Internal, &error.to_string()),
    }
}

fn revision_conflict(actual_revision: i64, expected_revision: i64, scope: &str) -> Status {
    Status {
        code: StatusCode::Aborted as i32,
        message: "workspaceRevisionConflict".to_owned(),
        details: vec![ErrorDetail {
            type_name: "yiru.runtime.v1.WorktreeRevisionConflict".to_owned(),
            value: encode(&WorktreeRevisionConflict {
                expected_revision,
                actual_revision,
                scope: scope.to_owned(),
            }),
        }],
    }
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

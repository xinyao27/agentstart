use super::{
    CallerClass, ProtocolCallContext, ProtocolHandlerOutcome, ProtocolHandlerResponse,
    ProtocolRequest, ProtocolRouter, ritual_protocol, shell_runtime_protocol,
    workspace_cleanup_protocol, workspace_events_protocol, workspace_ports_protocol,
    workspace_session_protocol, workspace_space_protocol, worktree_labels_protocol,
    worktree_protocol,
};

pub(super) enum Method {
    WorktreeLabelsServiceRegister,
    WorktreeServicePs,
    WorktreeServiceShow,
    WorktreeServiceSleep,
    WorktreeServiceActivate,
    WorktreeServicePrefetchCreateBase,
    WorktreeServiceResolvePrBase,
    WorktreeServiceRemove,
    WorktreeServiceForceDeleteBranch,
    WorktreeServiceSet,
    WorktreeServicePersistSortOrder,
    WorktreeServiceDetectedList,
    WorktreeServiceLineageList,
    WorktreeServiceBranchRenameFailureOutput,
    WorktreeServiceSubscribeStateEvents,
    WorkspaceEventsServiceAppendConsole,
    WorkspaceEventsServiceAppendPerformance,
    WorkspaceEventsServiceList,
    WorkspaceEventsServiceWatch,
    WorkspaceEventsServiceGetProjectRevision,
    WorktreeServiceArchive,
    WorktreeServiceList,
    WorktreeServiceCreate,
    WorktreeServiceListArchives,
    WorktreeServiceRestore,
    WorkspaceCleanupServiceScan,
    WorkspaceCleanupServiceDismiss,
    WorkspaceCleanupServiceClearDismissals,
    WorkspaceCleanupServiceSubscribeEvents,
    ShellSessionServiceGet,
    ShellSessionServiceWatch,
    ShellSessionServiceSet,
    ShellSessionServicePatch,
    ShellSessionServiceFlush,
    RitualServiceGetSchedule,
    RitualServiceSetSchedule,
    RitualServiceRun,
    WorkspacePortsServiceScan,
    WorkspacePortsServiceKill,
    WorkspacePortsServiceSubscribeEvents,
    WorkspaceSpaceServiceAnalyze,
    WorkspaceSpaceServiceCancel,
    ShellRuntimeServiceSyncWindowGraph,
}

impl ProtocolRouter {
    pub(super) async fn handle_workspaces(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::WorktreeLabelsServiceRegister => {
                worktree_labels_protocol::register(&self.worktree_labels, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServicePs => worktree_protocol::ps(
                &self.worktree,
                request.payload,
                matches!(context.access().principal(), CallerClass::Mobile),
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::WorktreeServiceShow => worktree_protocol::show(&self.worktree, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::WorktreeServiceSleep => {
                worktree_protocol::sleep(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServiceActivate => {
                worktree_protocol::activate(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServicePrefetchCreateBase => {
                worktree_protocol::prefetch_create_base(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServiceResolvePrBase => {
                worktree_protocol::resolve_pr_base(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServiceRemove => {
                worktree_protocol::remove(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServiceForceDeleteBranch => {
                worktree_protocol::force_delete_branch(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServiceSet => worktree_protocol::set(&self.worktree, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::WorktreeServicePersistSortOrder => {
                worktree_protocol::persist_sort_order(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServiceDetectedList => {
                worktree_protocol::detected_list(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServiceLineageList => {
                worktree_protocol::lineage_list(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServiceBranchRenameFailureOutput => {
                worktree_protocol::branch_rename_failure_output(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServiceSubscribeStateEvents => {
                return match worktree_protocol::subscribe_state_events(
                    &self.worktree,
                    request.payload,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::WorkspaceEventsServiceAppendConsole => {
                workspace_events_protocol::append_console(&self.workspace_events, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorkspaceEventsServiceAppendPerformance => {
                workspace_events_protocol::append_performance(
                    &self.workspace_events,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::WorkspaceEventsServiceList => {
                workspace_events_protocol::list(&self.workspace_events, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorkspaceEventsServiceWatch => {
                return match workspace_events_protocol::watch(
                    &self.workspace_events,
                    request.payload,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::WorkspaceEventsServiceGetProjectRevision => {
                workspace_events_protocol::get_project_revision(
                    &self.workspace_events,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServiceArchive => {
                worktree_protocol::archive(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServiceList => worktree_protocol::list(&self.worktree, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::WorktreeServiceCreate => worktree_protocol::create(
                &self.worktree,
                request.payload,
                matches!(context.access.principal(), CallerClass::Mobile),
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::WorktreeServiceListArchives => {
                worktree_protocol::list_archives(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorktreeServiceRestore => {
                worktree_protocol::restore(&self.worktree, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorkspaceCleanupServiceScan => {
                workspace_cleanup_protocol::scan(&self.workspace_cleanup, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorkspaceCleanupServiceDismiss => {
                workspace_cleanup_protocol::dismiss(&self.workspace_cleanup, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorkspaceCleanupServiceClearDismissals => {
                workspace_cleanup_protocol::clear_dismissals(
                    &self.workspace_cleanup,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::WorkspaceCleanupServiceSubscribeEvents => {
                return match workspace_cleanup_protocol::subscribe_events(
                    &self.workspace_cleanup,
                    request.payload,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::ShellSessionServiceWatch => {
                return match workspace_session_protocol::watch(
                    &self.workspace_session,
                    request.payload,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::ShellSessionServiceGet => {
                workspace_session_protocol::get(&self.workspace_session, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellSessionServiceSet => {
                workspace_session_protocol::set(&self.workspace_session, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellSessionServicePatch => {
                workspace_session_protocol::patch(&self.workspace_session, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellSessionServiceFlush => {
                workspace_session_protocol::flush(&self.workspace_session, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::RitualServiceGetSchedule => {
                ritual_protocol::get_schedule(&self.ritual, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::RitualServiceSetSchedule => {
                ritual_protocol::set_schedule(&self.ritual, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::RitualServiceRun => ritual_protocol::run(&self.ritual, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::WorkspacePortsServiceScan => {
                workspace_ports_protocol::scan(&self.workspace_ports, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorkspacePortsServiceKill => {
                workspace_ports_protocol::kill(&self.workspace_ports, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorkspacePortsServiceSubscribeEvents => {
                return match workspace_ports_protocol::subscribe_events(
                    &self.workspace_ports,
                    request.payload,
                    &self.connection_id,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::WorkspaceSpaceServiceAnalyze => {
                workspace_space_protocol::analyze(&self.workspace_space, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::WorkspaceSpaceServiceCancel => {
                workspace_space_protocol::cancel(&self.workspace_space, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellRuntimeServiceSyncWindowGraph => {
                shell_runtime_protocol::sync_window_graph(
                    &self.shell_runtime,
                    request.payload,
                    &self.connection_id,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
        };
        match result {
            Ok(response) => ProtocolHandlerOutcome::Complete(response),
            Err(error) => ProtocolHandlerOutcome::Failed(error),
        }
    }
}

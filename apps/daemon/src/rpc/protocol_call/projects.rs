use super::{
    ProtocolCallContext, ProtocolHandlerOutcome, ProtocolHandlerResponse, ProtocolRequest,
    ProtocolRouter, folder_workspace_protocol, project_context_protocol, project_group_protocol,
    project_host_setup_protocol, project_protocol, repo_host_protocol, repo_mutations,
    repo_presets, repo_protocol, repository_refs_protocol,
};

pub(super) enum Method {
    RepoServiceGetHooks,
    RepoServiceList,
    RepoServiceAdd,
    RepoServiceBaseRefDefault,
    RepoServiceSearchRefs,
    ProjectGroupServiceList,
    ProjectGroupServiceCreate,
    ProjectGroupServiceUpdate,
    ProjectGroupServiceDelete,
    ProjectGroupServiceMoveProject,
    ProjectGroupServiceScanNested,
    ProjectGroupServiceCancelNestedScan,
    ProjectGroupServiceImportNested,
    ProjectGroupServiceSubscribeEvents,
    RepoServiceClone,
    RepoServiceCreate,
    RepoServiceGitAvailable,
    RepoServiceReorder,
    RepoServiceRm,
    RepoServiceUpdate,
    RepoServiceHooks,
    RepoServiceHooksCheck,
    RepoServiceSetupScriptImports,
    RepoServiceSparsePresets,
    RepoServiceSaveSparsePreset,
    RepoServiceRemoveSparsePreset,
    ShellRepoHostServiceCloneAbort,
    ShellRepoHostServiceGetDefaultCreateProjectParent,
    ShellRepoHostServicePickDirectory,
    ShellRepoHostServicePickFolder,
    ShellRepoHostServicePickFolders,
    ShellRepoHostServiceRemoveForHost,
    ShellRepoHostServiceReorderForHost,
    ProjectHostSetupServiceList,
    ProjectHostSetupServiceCreate,
    ProjectHostSetupServiceSetupExistingFolder,
    ProjectHostSetupServiceClone,
    ProjectHostSetupServiceUpdate,
    ProjectHostSetupServiceDelete,
    FolderWorkspaceServiceList,
    FolderWorkspaceServiceCreate,
    FolderWorkspaceServiceUpdate,
    FolderWorkspaceServiceDelete,
    FolderWorkspaceServiceGetPathStatus,
    ProjectServiceList,
    ProjectServiceUpdate,
    ProjectContextServiceResolve,
}

impl ProtocolRouter {
    pub(super) async fn handle_projects(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::RepoServiceGetHooks => repo_protocol::get_hooks(&self.repo, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RepoServiceList => repo_protocol::list(&self.repo, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RepoServiceAdd => repo_protocol::add(&self.repo, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RepoServiceBaseRefDefault => {
                repository_refs_protocol::base_ref_default(&self.repository_refs, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::RepoServiceSearchRefs => {
                repository_refs_protocol::search_refs(&self.repository_refs, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectGroupServiceList => {
                project_group_protocol::list(&self.project_group, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectGroupServiceCreate => {
                project_group_protocol::create(&self.project_group, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectGroupServiceUpdate => {
                project_group_protocol::update(&self.project_group, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectGroupServiceDelete => {
                project_group_protocol::delete(&self.project_group, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectGroupServiceMoveProject => {
                project_group_protocol::move_project(&self.project_group, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectGroupServiceScanNested => {
                project_group_protocol::scan_nested(&self.project_group, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectGroupServiceCancelNestedScan => {
                project_group_protocol::cancel_nested_scan(&self.project_group, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectGroupServiceImportNested => {
                project_group_protocol::import_nested(&self.project_group, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectGroupServiceSubscribeEvents => {
                return match project_group_protocol::subscribe_events(
                    &self.project_group,
                    request.payload,
                    Some(&self.connection_id),
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::RepoServiceClone => repo_mutations::clone(&self.repo, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RepoServiceCreate => repo_mutations::create(&self.repo, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RepoServiceGitAvailable => {
                repo_mutations::git_available(&self.repo, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::RepoServiceReorder => repo_mutations::reorder(&self.repo, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RepoServiceRm => repo_mutations::rm(&self.repo, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RepoServiceUpdate => repo_mutations::update(&self.repo, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RepoServiceHooks => repo_presets::hooks(&self.repo, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RepoServiceHooksCheck => repo_presets::hooks_check(&self.repo, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::RepoServiceSetupScriptImports => {
                repo_presets::setup_script_imports(&self.repo, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::RepoServiceSparsePresets => {
                repo_presets::sparse_presets(&self.repo, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::RepoServiceSaveSparsePreset => {
                repo_presets::save_sparse_preset(&self.repo, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::RepoServiceRemoveSparsePreset => {
                repo_presets::remove_sparse_preset(&self.repo, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellRepoHostServiceCloneAbort => {
                repo_host_protocol::clone_abort(&self.repo_host, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellRepoHostServiceGetDefaultCreateProjectParent => {
                repo_host_protocol::get_default_create_project_parent(
                    &self.repo_host,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellRepoHostServicePickDirectory => {
                repo_host_protocol::pick_directory(&self.repo_host, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellRepoHostServicePickFolder => {
                repo_host_protocol::pick_folder(&self.repo_host, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellRepoHostServicePickFolders => {
                repo_host_protocol::pick_folders(&self.repo_host, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellRepoHostServiceRemoveForHost => {
                repo_host_protocol::remove_for_host(&self.repo_host, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellRepoHostServiceReorderForHost => {
                repo_host_protocol::reorder_for_host(&self.repo_host, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectHostSetupServiceList => {
                project_host_setup_protocol::list(&self.project_host_setup, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectHostSetupServiceCreate => {
                project_host_setup_protocol::create(&self.project_host_setup, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectHostSetupServiceSetupExistingFolder => {
                project_host_setup_protocol::setup_existing_folder(
                    &self.project_host_setup,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectHostSetupServiceClone => {
                project_host_setup_protocol::clone(&self.project_host_setup, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectHostSetupServiceUpdate => {
                project_host_setup_protocol::update(&self.project_host_setup, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectHostSetupServiceDelete => {
                project_host_setup_protocol::delete(&self.project_host_setup, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FolderWorkspaceServiceList => {
                folder_workspace_protocol::list(&self.folder_workspace, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FolderWorkspaceServiceCreate => {
                folder_workspace_protocol::create(&self.folder_workspace, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FolderWorkspaceServiceUpdate => {
                folder_workspace_protocol::update(&self.folder_workspace, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FolderWorkspaceServiceDelete => {
                folder_workspace_protocol::delete(&self.folder_workspace, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FolderWorkspaceServiceGetPathStatus => {
                folder_workspace_protocol::get_path_status(&self.folder_workspace, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectServiceList => project_protocol::list(&self.project, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::ProjectServiceUpdate => {
                project_protocol::update(&self.project, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ProjectContextServiceResolve => {
                project_context_protocol::resolve(&self.project_context, request.payload)
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

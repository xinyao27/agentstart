use tokio::sync::oneshot;

use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{HostFileKind, HostFilesystem, HostFilesystemError};
use crate::project_groups::ProjectGroupAuthority;
use crate::projects::{ProjectCatalog, ProjectCatalogError};

use super::{
    FolderWorkspaceCreate, FolderWorkspaceDelete, FolderWorkspaceDeleteResult,
    FolderWorkspaceListResult, FolderWorkspacePathStatus, FolderWorkspaceResult,
    FolderWorkspaceUpdate, NullableFolderWorkspaceResult, PathStatusScope,
};

#[derive(Clone)]
pub(crate) struct FolderWorkspaceAuthority {
    groups: ProjectGroupAuthority,
    hosts: HostRegistry,
    projects: ProjectCatalog,
}

pub(crate) enum FolderWorkspaceRequest {
    Create {
        input: FolderWorkspaceCreate,
        response: oneshot::Sender<Result<FolderWorkspaceResult, ProjectCatalogError>>,
    },
    Delete {
        input: FolderWorkspaceDelete,
        response: oneshot::Sender<Result<FolderWorkspaceDeleteResult, ProjectCatalogError>>,
    },
    List {
        response: oneshot::Sender<Result<FolderWorkspaceListResult, ProjectCatalogError>>,
    },
    Update {
        input: FolderWorkspaceUpdate,
        response: oneshot::Sender<Result<NullableFolderWorkspaceResult, ProjectCatalogError>>,
    },
}

pub(crate) struct FolderWorkspaceWorker;

impl FolderWorkspaceAuthority {
    pub(crate) fn new(
        groups: ProjectGroupAuthority,
        hosts: HostRegistry,
        projects: ProjectCatalog,
    ) -> Self {
        Self {
            groups,
            hosts,
            projects,
        }
    }

    pub(crate) async fn list(&self) -> Result<FolderWorkspaceListResult, FolderWorkspaceError> {
        let (response, result) = oneshot::channel();
        self.projects
            .submit_folder_workspaces(FolderWorkspaceRequest::List { response })
            .await?;
        receive(result).await.map_err(Into::into)
    }

    pub(crate) async fn create(
        &self,
        input: FolderWorkspaceCreate,
    ) -> Result<FolderWorkspaceResult, FolderWorkspaceError> {
        let _mutation = self.projects.mutation_guard().await;
        self.assert_revision(input.expected_revision).await?;
        let group = self
            .groups
            .find(&input.project_group_id)
            .await?
            .ok_or(FolderWorkspaceError::GroupNotFound)?;
        let path = input
            .folder_path
            .as_deref()
            .filter(|path| !path.trim().is_empty())
            .or(group.parent_path.as_deref())
            .ok_or(FolderWorkspaceError::GroupNotFound)?;
        self.assert_usable(path).await?;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_folder_workspaces(FolderWorkspaceRequest::Create { input, response })
            .await?;
        receive(result).await.map_err(Into::into)
    }

    pub(crate) async fn update(
        &self,
        input: FolderWorkspaceUpdate,
    ) -> Result<NullableFolderWorkspaceResult, FolderWorkspaceError> {
        let _mutation = self.projects.mutation_guard().await;
        self.assert_revision(input.expected_revision).await?;
        if let Some(path) = input
            .folder_path
            .as_deref()
            .filter(|path| !path.trim().is_empty())
        {
            let exists = self
                .list()
                .await?
                .folder_workspaces
                .iter()
                .any(|workspace| workspace.id == input.folder_workspace_id);
            if !exists {
                return self.update_unchecked(input).await;
            }
            self.assert_usable(path).await?;
        }
        self.update_unchecked(input).await
    }

    async fn update_unchecked(
        &self,
        input: FolderWorkspaceUpdate,
    ) -> Result<NullableFolderWorkspaceResult, FolderWorkspaceError> {
        let (response, result) = oneshot::channel();
        self.projects
            .submit_folder_workspaces(FolderWorkspaceRequest::Update { input, response })
            .await?;
        receive(result).await.map_err(Into::into)
    }

    pub(crate) async fn delete(
        &self,
        input: FolderWorkspaceDelete,
    ) -> Result<FolderWorkspaceDeleteResult, FolderWorkspaceError> {
        let _mutation = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_folder_workspaces(FolderWorkspaceRequest::Delete { input, response })
            .await?;
        receive(result).await.map_err(Into::into)
    }

    pub(crate) async fn path_status(
        &self,
        scope: PathStatusScope,
    ) -> Result<FolderWorkspacePathStatus, FolderWorkspaceError> {
        let path = match scope {
            PathStatusScope::Path(path) => path,
            PathStatusScope::ProjectGroup(id) => self
                .groups
                .find(&id)
                .await?
                .and_then(|group| group.parent_path)
                .ok_or(FolderWorkspaceError::PathScopeNotFound)?,
            PathStatusScope::FolderWorkspace(id) => self
                .list()
                .await?
                .folder_workspaces
                .into_iter()
                .find(|workspace| workspace.id == id)
                .map(|workspace| workspace.folder_path)
                .ok_or(FolderWorkspaceError::PathScopeNotFound)?,
        };
        self.status(path).await
    }

    async fn status(
        &self,
        path: String,
    ) -> Result<FolderWorkspacePathStatus, FolderWorkspaceError> {
        let host = self.hosts.execution_host("local").await?;
        let filesystem = HostFilesystem::new(host);
        let status = match filesystem.stat(&path).await {
            Ok(Some(stat)) if stat.kind == HostFileKind::Directory => status(path, true, None),
            Ok(Some(stat)) if stat.kind == HostFileKind::Symlink => {
                match filesystem.canonical_directory(&path).await {
                    Ok(_) => status(path, true, None),
                    Err(_) => status(path, false, Some("missing")),
                }
            }
            Ok(Some(_)) => status(path, false, Some("not-directory")),
            Ok(None) => status(path, false, Some("missing")),
            Err(_) => status(path, false, Some("unavailable")),
        };
        Ok(status)
    }

    async fn assert_usable(&self, path: &str) -> Result<(), FolderWorkspaceError> {
        let status = self.status(path.to_owned()).await?;
        if status.exists {
            return Ok(());
        }
        Err(FolderWorkspaceError::Path {
            path: status.path,
            reason: status.reason.unwrap_or("unavailable"),
        })
    }

    async fn assert_revision(&self, expected: i64) -> Result<(), FolderWorkspaceError> {
        let actual = self.groups.list().await?.revision;
        if actual == expected {
            Ok(())
        } else {
            Err(ProjectCatalogError::RevisionConflict {
                actual_revision: actual,
                expected_revision: expected,
                scope: "project-catalog",
            }
            .into())
        }
    }
}

impl FolderWorkspaceWorker {
    pub(crate) fn handle(
        connection: &mut rusqlite::Connection,
        request: FolderWorkspaceRequest,
        on_committed: impl FnOnce(),
    ) {
        let mut committed = Some(on_committed);
        match request {
            FolderWorkspaceRequest::Create { input, response } => {
                let result = super::records::create(connection, input);
                notify(&mut committed, result.is_ok());
                let _ = response.send(result);
            }
            FolderWorkspaceRequest::Delete { input, response } => {
                let result = super::records::delete(connection, input);
                notify(
                    &mut committed,
                    result.as_ref().is_ok_and(|value| value.deleted),
                );
                let _ = response.send(result);
            }
            FolderWorkspaceRequest::List { response } => {
                let _ = response.send(super::records::list(connection));
            }
            FolderWorkspaceRequest::Update { input, response } => {
                let result = super::records::update(connection, input);
                notify(
                    &mut committed,
                    result
                        .as_ref()
                        .is_ok_and(|value| value.folder_workspace.is_some()),
                );
                let _ = response.send(result);
            }
        }
    }
}

fn notify(callback: &mut Option<impl FnOnce()>, should_notify: bool) {
    if should_notify {
        callback.take().expect("commit notifier exists")();
    }
}

fn status(path: String, exists: bool, reason: Option<&'static str>) -> FolderWorkspacePathStatus {
    FolderWorkspacePathStatus {
        exists,
        path,
        reason,
    }
}

async fn receive<T>(
    result: oneshot::Receiver<Result<T, ProjectCatalogError>>,
) -> Result<T, ProjectCatalogError> {
    result
        .await
        .map_err(|_| ProjectCatalogError::WorkerUnavailable)?
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum FolderWorkspaceError {
    #[error(transparent)]
    Catalog(#[from] ProjectCatalogError),
    #[error("folder_workspace_project_group_not_found")]
    GroupNotFound,
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
    #[error("folder_workspace_path_{reason}:{path}")]
    Path { path: String, reason: &'static str },
    #[error("folder_workspace_path_scope_not_found")]
    PathScopeNotFound,
}

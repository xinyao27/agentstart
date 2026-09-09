use std::sync::Arc;

use async_trait::async_trait;
use rusqlite::Connection;
use tokio::sync::{Mutex, OwnedMutexGuard, oneshot};

use crate::folder_workspaces::{FolderWorkspaceRequest, FolderWorkspaceWorker};
use crate::project_groups::{ProjectGroupRequest, ProjectGroupWorker};
use crate::project_host_setups::{ProjectHostSetupRequest, ProjectHostSetupWorker};
use crate::repo_host::{RepoHostRequest, RepoHostWorker};
use crate::repositories::{RepositoryRequest, RepositoryWorker};

use super::{
    GitRemoteIdentity, Project, ProjectCatalogError, ProjectRegistration, ProjectWireUpdate,
    RuntimeProjectList, RuntimeProjectResult, WorkbenchProject, records, wire_records,
};

#[derive(Clone)]
pub struct ProjectCatalog {
    mailbox: Arc<dyn ProjectCatalogMailbox>,
    mutation_gate: Arc<Mutex<()>>,
}

enum ProjectCatalogCommand {
    ImportIndependent {
        root: std::path::PathBuf,
        response: oneshot::Sender<Result<(), ProjectCatalogError>>,
    },
    List {
        response: oneshot::Sender<Result<Vec<Project>, ProjectCatalogError>>,
    },
    ResolveId {
        project_id: String,
        response: oneshot::Sender<Result<Project, ProjectCatalogError>>,
    },
    RuntimeList {
        response: oneshot::Sender<Result<RuntimeProjectList, ProjectCatalogError>>,
    },
    RuntimeUpdate {
        input: ProjectWireUpdate,
        response: oneshot::Sender<Result<RuntimeProjectResult, ProjectCatalogError>>,
    },
    Register {
        input: ProjectRegistration,
        response: oneshot::Sender<Result<Project, ProjectCatalogError>>,
    },
    ReplaceRemotes {
        project_id: String,
        remotes: Vec<GitRemoteIdentity>,
        response: oneshot::Sender<Result<(), ProjectCatalogError>>,
    },
    ResolveByRemote {
        canonical_key: String,
        response: oneshot::Sender<Result<Vec<Project>, ProjectCatalogError>>,
    },
    SyncWorkbench {
        projects: Vec<WorkbenchProject>,
        response: oneshot::Sender<Result<(), ProjectCatalogError>>,
    },
    ProjectGroups(Box<ProjectGroupRequest>),
    FolderWorkspaces(Box<FolderWorkspaceRequest>),
    ProjectHostSetups(Box<ProjectHostSetupRequest>),
    RepoHost(Box<RepoHostRequest>),
    Repository(Box<RepositoryRequest>),
}

pub(crate) struct ProjectCatalogWorker;

pub(crate) struct ProjectCatalogRequest(ProjectCatalogCommand);

#[derive(Clone, Copy, Debug)]
pub(crate) struct ProjectCatalogMailboxClosed;

#[async_trait]
pub(crate) trait ProjectCatalogMailbox: Send + Sync {
    async fn submit(
        &self,
        request: ProjectCatalogRequest,
    ) -> Result<(), ProjectCatalogMailboxClosed>;
}

impl ProjectCatalog {
    pub(crate) fn new(mailbox: Arc<dyn ProjectCatalogMailbox>) -> Self {
        Self {
            mailbox,
            mutation_gate: Arc::new(Mutex::new(())),
        }
    }

    pub(crate) async fn import_independent(
        &self,
        root: &std::path::Path,
    ) -> Result<(), ProjectCatalogError> {
        let _mutation = self.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.send(ProjectCatalogCommand::ImportIndependent {
            root: root.to_owned(),
            response,
        })
        .await?;
        receive(result).await
    }

    pub async fn list(&self) -> Result<Vec<Project>, ProjectCatalogError> {
        let (response, result) = oneshot::channel();
        self.send(ProjectCatalogCommand::List { response }).await?;
        receive(result).await
    }

    pub(crate) async fn runtime_list(&self) -> Result<RuntimeProjectList, ProjectCatalogError> {
        let (response, result) = oneshot::channel();
        self.send(ProjectCatalogCommand::RuntimeList { response })
            .await?;
        receive(result).await
    }

    pub(crate) async fn runtime_update(
        &self,
        input: ProjectWireUpdate,
    ) -> Result<RuntimeProjectResult, ProjectCatalogError> {
        let _mutation = self.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.send(ProjectCatalogCommand::RuntimeUpdate { input, response })
            .await?;
        receive(result).await
    }

    pub async fn resolve(&self, selector: &str) -> Result<Project, ProjectCatalogError> {
        let normalized = selector.strip_prefix("id:").unwrap_or(selector);
        let matches = self
            .list()
            .await?
            .into_iter()
            .filter(|project| {
                project.id == normalized
                    || project.path == normalized
                    || project.display_name == normalized
            })
            .collect::<Vec<_>>();
        match matches.len() {
            0 => Err(ProjectCatalogError::NotFound),
            1 => Ok(matches.into_iter().next().expect("one project exists")),
            _ => Err(ProjectCatalogError::AmbiguousSelector),
        }
    }

    pub(crate) async fn resolve_id(
        &self,
        project_id: &str,
    ) -> Result<Project, ProjectCatalogError> {
        let (response, result) = oneshot::channel();
        self.send(ProjectCatalogCommand::ResolveId {
            project_id: project_id.to_owned(),
            response,
        })
        .await?;
        receive(result).await
    }

    pub async fn register(
        &self,
        input: ProjectRegistration,
    ) -> Result<Project, ProjectCatalogError> {
        let _mutation = self.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.send(ProjectCatalogCommand::Register { input, response })
            .await?;
        receive(result).await
    }

    pub async fn replace_remotes(
        &self,
        project_id: String,
        remotes: Vec<GitRemoteIdentity>,
    ) -> Result<(), ProjectCatalogError> {
        let _mutation = self.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.send(ProjectCatalogCommand::ReplaceRemotes {
            project_id,
            remotes,
            response,
        })
        .await?;
        receive(result).await
    }

    pub async fn resolve_by_remote(
        &self,
        canonical_key: String,
    ) -> Result<Vec<Project>, ProjectCatalogError> {
        let (response, result) = oneshot::channel();
        self.send(ProjectCatalogCommand::ResolveByRemote {
            canonical_key,
            response,
        })
        .await?;
        receive(result).await
    }

    pub async fn sync_workbench(
        &self,
        projects: Vec<WorkbenchProject>,
    ) -> Result<(), ProjectCatalogError> {
        let _mutation = self.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.send(ProjectCatalogCommand::SyncWorkbench { projects, response })
            .await?;
        receive(result).await
    }

    pub(crate) async fn submit_project_groups(
        &self,
        request: ProjectGroupRequest,
    ) -> Result<(), ProjectCatalogError> {
        self.send(ProjectCatalogCommand::ProjectGroups(Box::new(request)))
            .await
    }

    pub(crate) async fn submit_folder_workspaces(
        &self,
        request: FolderWorkspaceRequest,
    ) -> Result<(), ProjectCatalogError> {
        self.send(ProjectCatalogCommand::FolderWorkspaces(Box::new(request)))
            .await
    }

    pub(crate) async fn submit_project_host_setups(
        &self,
        request: ProjectHostSetupRequest,
    ) -> Result<(), ProjectCatalogError> {
        self.send(ProjectCatalogCommand::ProjectHostSetups(Box::new(request)))
            .await
    }

    pub(crate) async fn submit_repo_host(
        &self,
        request: RepoHostRequest,
    ) -> Result<(), ProjectCatalogError> {
        self.send(ProjectCatalogCommand::RepoHost(Box::new(request)))
            .await
    }

    pub(crate) async fn submit_repository(
        &self,
        request: RepositoryRequest,
    ) -> Result<(), ProjectCatalogError> {
        self.send(ProjectCatalogCommand::Repository(Box::new(request)))
            .await
    }

    pub(crate) async fn mutation_guard(&self) -> OwnedMutexGuard<()> {
        self.mutation_gate.clone().lock_owned().await
    }

    async fn send(&self, command: ProjectCatalogCommand) -> Result<(), ProjectCatalogError> {
        self.mailbox
            .submit(ProjectCatalogRequest::new(command))
            .await
            .map_err(|_| ProjectCatalogError::WorkerUnavailable)
    }
}

impl ProjectCatalogRequest {
    fn new(command: ProjectCatalogCommand) -> Self {
        Self(command)
    }
}

impl ProjectCatalogWorker {
    pub(crate) fn handle(
        &self,
        connection: &mut Connection,
        request: ProjectCatalogRequest,
        on_committed: impl FnOnce(),
    ) {
        match request.0 {
            ProjectCatalogCommand::ImportIndependent { root, response } => {
                let _ = response.send(super::independent::import(connection, &root));
            }
            ProjectCatalogCommand::List { response } => {
                let _ = response.send(records::list(connection));
            }
            ProjectCatalogCommand::ResolveId {
                project_id,
                response,
            } => {
                let _ = response.send(records::resolve_id(connection, &project_id));
            }
            ProjectCatalogCommand::RuntimeList { response } => {
                let _ = response.send(wire_records::list(connection));
            }
            ProjectCatalogCommand::RuntimeUpdate { input, response } => {
                let result = wire_records::update(connection, input);
                if result.is_ok() {
                    on_committed();
                }
                let _ = response.send(result);
            }
            ProjectCatalogCommand::Register { input, response } => {
                let _ = response.send(records::register(connection, input));
            }
            ProjectCatalogCommand::ReplaceRemotes {
                project_id,
                remotes,
                response,
            } => {
                let _ = response.send(records::replace_remotes(connection, &project_id, &remotes));
            }
            ProjectCatalogCommand::ResolveByRemote {
                canonical_key,
                response,
            } => {
                let _ = response.send(records::resolve_by_remote(connection, &canonical_key));
            }
            ProjectCatalogCommand::SyncWorkbench { projects, response } => {
                let _ = response.send(records::sync_workbench(connection, &projects));
            }
            ProjectCatalogCommand::ProjectGroups(request) => {
                ProjectGroupWorker::handle(connection, *request, on_committed);
            }
            ProjectCatalogCommand::FolderWorkspaces(request) => {
                FolderWorkspaceWorker::handle(connection, *request, on_committed);
            }
            ProjectCatalogCommand::ProjectHostSetups(request) => {
                ProjectHostSetupWorker::handle(connection, *request, on_committed);
            }
            ProjectCatalogCommand::RepoHost(request) => {
                RepoHostWorker::handle(connection, *request, on_committed);
            }
            ProjectCatalogCommand::Repository(request) => {
                RepositoryWorker::handle(connection, *request);
                on_committed();
            }
        }
    }
}

async fn receive<T>(
    result: oneshot::Receiver<Result<T, ProjectCatalogError>>,
) -> Result<T, ProjectCatalogError> {
    result
        .await
        .map_err(|_| ProjectCatalogError::WorkerUnavailable)?
}

use tokio::sync::oneshot;

use crate::host_registry::HostRegistry;
use crate::projects::{ProjectCatalog, ProjectCatalogError};

use super::model::{
    NullableProjectGroupResult, ProjectGroupCreate, ProjectGroupDelete, ProjectGroupDeleteResult,
    ProjectGroupListResult, ProjectGroupMoveProject, ProjectGroupMoveProjectResult,
    ProjectGroupResult, ProjectGroupUpdate,
};
use super::{
    CancelNestedRepoScanResult, NestedRepoScan, NestedRepoScanError, NestedRepoScanOptions,
    NestedRepoScans, ProjectGroupImportError, ProjectGroupImportInput, ProjectGroupImportResult,
    ScanSubscription,
};

#[derive(Clone)]
pub(crate) struct ProjectGroupAuthority {
    hosts: HostRegistry,
    projects: ProjectCatalog,
    scans: NestedRepoScans,
}

pub(crate) enum ProjectGroupRequest {
    Create {
        input: ProjectGroupCreate,
        response: oneshot::Sender<Result<ProjectGroupResult, ProjectCatalogError>>,
    },
    Delete {
        input: ProjectGroupDelete,
        response: oneshot::Sender<Result<ProjectGroupDeleteResult, ProjectCatalogError>>,
    },
    List {
        response: oneshot::Sender<Result<ProjectGroupListResult, ProjectCatalogError>>,
    },
    Find {
        group_id: String,
        response: oneshot::Sender<Result<Option<super::model::ProjectGroup>, ProjectCatalogError>>,
    },
    Import {
        input: Box<super::import_model::PreparedImport>,
        response: oneshot::Sender<Result<ProjectGroupImportResult, ProjectCatalogError>>,
    },
    MoveProject {
        input: ProjectGroupMoveProject,
        response: oneshot::Sender<Result<ProjectGroupMoveProjectResult, ProjectCatalogError>>,
    },
    Update {
        input: ProjectGroupUpdate,
        response: oneshot::Sender<Result<NullableProjectGroupResult, ProjectCatalogError>>,
    },
}

pub(crate) struct ProjectGroupWorker;

impl ProjectGroupAuthority {
    pub(crate) fn new(projects: ProjectCatalog, hosts: HostRegistry) -> Self {
        Self {
            hosts: hosts.clone(),
            projects,
            scans: NestedRepoScans::new(hosts),
        }
    }

    pub(crate) async fn list(&self) -> Result<ProjectGroupListResult, ProjectCatalogError> {
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_groups(ProjectGroupRequest::List { response })
            .await?;
        receive(result).await
    }

    pub(crate) async fn find(
        &self,
        group_id: &str,
    ) -> Result<Option<super::model::ProjectGroup>, ProjectCatalogError> {
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_groups(ProjectGroupRequest::Find {
                group_id: group_id.to_owned(),
                response,
            })
            .await?;
        receive(result).await
    }

    pub(crate) async fn create(
        &self,
        input: ProjectGroupCreate,
    ) -> Result<ProjectGroupResult, ProjectCatalogError> {
        let _mutation = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_groups(ProjectGroupRequest::Create { input, response })
            .await?;
        receive(result).await
    }

    pub(crate) async fn update(
        &self,
        input: ProjectGroupUpdate,
    ) -> Result<NullableProjectGroupResult, ProjectCatalogError> {
        let _mutation = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_groups(ProjectGroupRequest::Update { input, response })
            .await?;
        receive(result).await
    }

    pub(crate) async fn delete(
        &self,
        input: ProjectGroupDelete,
    ) -> Result<ProjectGroupDeleteResult, ProjectCatalogError> {
        let _mutation = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_groups(ProjectGroupRequest::Delete { input, response })
            .await?;
        receive(result).await
    }

    pub(crate) async fn move_project(
        &self,
        input: ProjectGroupMoveProject,
    ) -> Result<ProjectGroupMoveProjectResult, ProjectCatalogError> {
        let _mutation = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_groups(ProjectGroupRequest::MoveProject { input, response })
            .await?;
        receive(result).await
    }

    pub(crate) async fn import_nested(
        &self,
        input: ProjectGroupImportInput,
    ) -> Result<ProjectGroupImportResult, ProjectGroupImportError> {
        let _mutation = self.projects.mutation_guard().await;
        let snapshot = self.list().await?;
        if snapshot.revision != input.expected_revision {
            return Err(ProjectCatalogError::RevisionConflict {
                actual_revision: snapshot.revision,
                expected_revision: input.expected_revision,
                scope: "project-catalog",
            }
            .into());
        }
        let prepared = super::import::prepare(&self.scans, &self.hosts, input).await?;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_groups(ProjectGroupRequest::Import {
                input: Box::new(prepared),
                response,
            })
            .await?;
        Ok(receive(result).await?)
    }

    pub(crate) async fn scan_nested(
        &self,
        path: String,
        scan_id: Option<String>,
        options: NestedRepoScanOptions,
    ) -> Result<NestedRepoScan, NestedRepoScanError> {
        self.scans.scan(path, scan_id, options).await
    }

    pub(crate) fn cancel_nested(&self, scan_id: &str) -> CancelNestedRepoScanResult {
        self.scans.cancel(scan_id)
    }

    pub(crate) fn subscribe(&self, connection_id: Option<&str>) -> ScanSubscription {
        self.scans.subscribe(connection_id)
    }
}

impl ProjectGroupWorker {
    pub(crate) fn handle(
        connection: &mut rusqlite::Connection,
        request: ProjectGroupRequest,
        on_committed: impl FnOnce(),
    ) {
        let mut committed = Some(on_committed);
        match request {
            ProjectGroupRequest::Create { input, response } => {
                let result = super::records::create(connection, input);
                if result.is_ok() {
                    committed.take().expect("commit notifier exists")();
                }
                let _ = response.send(result);
            }
            ProjectGroupRequest::Delete { input, response } => {
                let result = super::records::delete(connection, input);
                if result.as_ref().is_ok_and(|result| result.deleted) {
                    committed.take().expect("commit notifier exists")();
                }
                let _ = response.send(result);
            }
            ProjectGroupRequest::List { response } => {
                let result = super::records::list(connection);
                let _ = response.send(result);
            }
            ProjectGroupRequest::Find { group_id, response } => {
                let result = super::records::find_group(connection, &group_id);
                let _ = response.send(result);
            }
            ProjectGroupRequest::Import { input, response } => {
                let result = super::records::import_nested(connection, *input);
                if result
                    .as_ref()
                    .is_ok_and(|result| result.group.is_some() || result.imported_count > 0)
                {
                    committed.take().expect("commit notifier exists")();
                }
                let _ = response.send(result);
            }
            ProjectGroupRequest::MoveProject { input, response } => {
                let result = super::records::move_project(connection, input);
                if result.is_ok() {
                    committed.take().expect("commit notifier exists")();
                }
                let _ = response.send(result);
            }
            ProjectGroupRequest::Update { input, response } => {
                let result = super::records::update(connection, input);
                if result.as_ref().is_ok_and(|result| result.group.is_some()) {
                    committed.take().expect("commit notifier exists")();
                }
                let _ = response.send(result);
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

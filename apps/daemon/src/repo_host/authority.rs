use std::path::PathBuf;

use tokio::sync::oneshot;

use crate::project_host_setups::ProjectHostSetupAuthority;
use crate::projects::{ProjectCatalog, ProjectCatalogError};

use super::{
    RemoveForHostInput, RemoveForHostResult, RemoveMutation, ReorderForHostInput,
    ReorderForHostResult, RepoHostError, RepoHostRequest,
};

#[derive(Clone)]
pub(crate) struct RepoHostAuthority {
    project_host_setups: ProjectHostSetupAuthority,
    projects: ProjectCatalog,
}

impl RepoHostAuthority {
    pub(crate) fn new(
        projects: ProjectCatalog,
        project_host_setups: ProjectHostSetupAuthority,
    ) -> Self {
        Self {
            project_host_setups,
            projects,
        }
    }

    pub(crate) fn abort_clone(&self) {
        self.project_host_setups.abort_clone();
    }

    pub(crate) fn default_create_project_parent(&self) -> Result<String, RepoHostError> {
        crate::paths::resolve_local_home_path()
            .map(|home| home.join("yiru").join("projects"))
            .map(path_string)
            .ok_or(RepoHostError::HomeUnavailable)
    }

    pub(crate) async fn pick_directories(&self, multiple: bool) -> Vec<String> {
        tokio::task::spawn_blocking(move || {
            crate::native_messaging::pick_project_directories(multiple).unwrap_or_default()
        })
        .await
        .unwrap_or_default()
    }

    pub(crate) async fn remove_for_host(
        &self,
        input: RemoveForHostInput,
    ) -> Result<RemoveForHostResult, RepoHostError> {
        let _mutation = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repo_host(RepoHostRequest::Remove { input, response })
            .await?;
        let RemoveMutation { cleanup, result } = receive(result).await?;
        if let Some(cleanup) = cleanup {
            self.project_host_setups.replay_cleanup(cleanup).await?;
        }
        Ok(result)
    }

    pub(crate) async fn reorder_for_host(
        &self,
        input: ReorderForHostInput,
    ) -> Result<ReorderForHostResult, RepoHostError> {
        let _mutation = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repo_host(RepoHostRequest::Reorder { input, response })
            .await?;
        receive(result).await.map_err(Into::into)
    }
}

fn path_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

async fn receive<T>(
    result: oneshot::Receiver<Result<T, ProjectCatalogError>>,
) -> Result<T, ProjectCatalogError> {
    result
        .await
        .map_err(|_| ProjectCatalogError::WorkerUnavailable)?
}

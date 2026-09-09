mod authority;
mod model;
mod records;

use tokio::sync::oneshot;

pub(crate) use authority::RepoHostAuthority;
pub(crate) use model::{
    RemoveForHostInput, RemoveForHostResult, RemoveMutation, ReorderForHostInput,
    ReorderForHostResult, ReorderStatus,
};

use crate::projects::ProjectCatalogError;

pub(crate) enum RepoHostRequest {
    Remove {
        input: RemoveForHostInput,
        response: oneshot::Sender<Result<RemoveMutation, ProjectCatalogError>>,
    },
    Reorder {
        input: ReorderForHostInput,
        response: oneshot::Sender<Result<ReorderForHostResult, ProjectCatalogError>>,
    },
}

pub(crate) struct RepoHostWorker;

impl RepoHostWorker {
    pub(crate) fn handle(
        connection: &mut rusqlite::Connection,
        request: RepoHostRequest,
        on_committed: impl FnOnce(),
    ) {
        match request {
            RepoHostRequest::Remove { input, response } => {
                let result = records::remove_for_host(connection, input);
                if result.is_ok() {
                    on_committed();
                }
                let _ = response.send(result);
            }
            RepoHostRequest::Reorder { input, response } => {
                let result = records::reorder_for_host(connection, input);
                if result
                    .as_ref()
                    .is_ok_and(|result| matches!(result.status, ReorderStatus::Applied))
                {
                    on_committed();
                }
                let _ = response.send(result);
            }
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum RepoHostError {
    #[error(transparent)]
    Catalog(#[from] ProjectCatalogError),
    #[error("home directory is unavailable")]
    HomeUnavailable,
    #[error(transparent)]
    Setup(#[from] crate::project_host_setups::ProjectHostSetupError),
}

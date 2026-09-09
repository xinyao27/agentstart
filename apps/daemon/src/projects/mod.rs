mod catalog;
mod git_repository;
pub(crate) mod identity;
pub(crate) mod independent;
mod model;
pub(crate) mod records;
mod remote_resolution;
pub(crate) mod remotes;
pub(crate) mod wire;
pub(crate) mod wire_records;

pub use catalog::ProjectCatalog;
pub(crate) use catalog::{
    ProjectCatalogMailbox, ProjectCatalogMailboxClosed, ProjectCatalogRequest, ProjectCatalogWorker,
};
pub(crate) use git_repository::is_git_repository;
pub use model::{
    GitRemoteIdentity, Project, ProjectKind, ProjectLocation, ProjectRegistration,
    ProjectWorktreeVisibility, WorkbenchProject,
};
pub(crate) use remote_resolution::RemoteProjectResolver;
pub(crate) use wire::{
    ProjectWireUpdate, RuntimeProject, RuntimeProjectList, RuntimeProjectResult,
};

use std::error::Error;
use std::time::SystemTimeError;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProjectCatalogError {
    #[error("project_selector_ambiguous")]
    AmbiguousSelector,
    #[error("project catalog clock failed: {0}")]
    Clock(#[from] SystemTimeError),
    #[error("project catalog contained invalid kind {0}")]
    InvalidKind(String),
    #[error("project_not_found")]
    NotFound,
    #[error("Project host setup already exists: {0}")]
    SetupExists(String),
    #[error("Project host setup not found: {0}")]
    SetupNotFound(String),
    #[error("Imported folder does not match the selected project identity.")]
    SetupIdentityMismatch,
    #[error("Repo-backed project host setup paths must be changed by re-importing the project.")]
    SetupPathImmutable,
    #[error("Repo-backed project host setups cannot be marked provisioned.")]
    SetupProvisioned,
    #[error("Repo-backed project host setups cannot be marked unavailable.")]
    SetupUnavailable,
    #[error("workspaceRevisionConflict")]
    RevisionConflict {
        actual_revision: i64,
        expected_revision: i64,
        scope: &'static str,
    },
    #[error("workspace_revision_unavailable")]
    RevisionUnavailable,
    #[error("project catalog random identifier generation failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("project catalog storage failed")]
    Storage(#[source] Box<dyn Error + Send + Sync>),
    #[error("project catalog database worker is unavailable")]
    WorkerUnavailable,
}

impl ProjectCatalogError {
    pub(crate) fn storage(source: impl Error + Send + Sync + 'static) -> Self {
        Self::Storage(Box::new(source))
    }
}

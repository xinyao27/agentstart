use crate::host_registry::HostRegistryError;
use crate::hosts::HostFilesystemError;
use crate::projects::ProjectCatalogError;
use crate::workspace_session::WorkspaceSessionError;

#[derive(Debug, thiserror::Error)]
pub(crate) enum ProjectHostSetupError {
    #[error(transparent)]
    Catalog(#[from] ProjectCatalogError),
    #[error("Clone destination must be an absolute path")]
    CloneDestinationNotAbsolute,
    #[error("Invalid repository name derived from URL")]
    CloneNameInvalid,
    #[error("Clone target identity is unavailable: {0}")]
    CloneIdentityUnavailable(String),
    #[error("Clone cancelled")]
    CloneCancelled,
    #[error(transparent)]
    Filesystem(HostFilesystemError),
    #[error("Clone failed: {0}")]
    Git(String),
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error("Not a valid git repository: {0}")]
    NotGitRepository(String),
    #[error("Project path is not a directory: {0}")]
    PathNotDirectory(String),
    #[error("Project not found: {0}")]
    ProjectNotFound(String),
    #[error(transparent)]
    StateCleanup(#[from] super::state_cleanup::StateCleanupError),
    #[error(transparent)]
    WorkspaceSession(#[from] WorkspaceSessionError),
}

mod candidates;
mod containment;
mod resolution;

use std::sync::Arc;

use thiserror::Error;

use crate::external_paths::{ExternalPathAuthority, ExternalPathError};
use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{ExecutionHost, HostCommandError, HostFilesystemError};
use crate::projects::{ProjectCatalog, ProjectCatalogError};
use crate::worktrees::{WorktreeCatalog, WorktreeCatalogError};

#[derive(Clone, Copy)]
pub(crate) enum PathResolution {
    Follow,
    PreserveLeaf,
}

#[derive(Clone)]
pub(crate) struct AuthorizedWorkspacePath {
    pub(crate) host: Arc<dyn ExecutionHost>,
    pub(crate) path: String,
}

#[derive(Clone)]
pub(crate) struct WorkspacePathAuthority {
    external_paths: ExternalPathAuthority,
    hosts: HostRegistry,
    projects: ProjectCatalog,
    worktrees: WorktreeCatalog,
}

#[derive(Debug, Error)]
pub(crate) enum WorkspacePathError {
    #[error("path has more than one registered execution authority")]
    Ambiguous,
    #[error(transparent)]
    ExternalPath(#[from] ExternalPathError),
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
    #[error(transparent)]
    Host(#[from] HostCommandError),
    #[error(transparent)]
    HostRegistry(#[from] HostRegistryError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("path resolution failed: {0}")]
    PathResolution(String),
    #[error(transparent)]
    Project(#[from] ProjectCatalogError),
    #[error("path is outside registered projects, worktrees, and external grants")]
    Unauthorized,
    #[error(transparent)]
    Worktree(#[from] WorktreeCatalogError),
}

impl WorkspacePathAuthority {
    pub(crate) fn new(
        projects: ProjectCatalog,
        worktrees: WorktreeCatalog,
        hosts: HostRegistry,
        external_paths: ExternalPathAuthority,
    ) -> Self {
        Self {
            external_paths,
            hosts,
            projects,
            worktrees,
        }
    }

    pub(crate) async fn authorize_external(
        &self,
        target_path: &str,
    ) -> Result<(), WorkspacePathError> {
        self.external_paths.authorize(target_path).await?;
        Ok(())
    }

    pub(crate) async fn resolve(
        &self,
        target_path: &str,
        mode: PathResolution,
    ) -> Result<AuthorizedWorkspacePath, WorkspacePathError> {
        let candidates =
            candidates::collect(&self.projects, &self.worktrees, &self.hosts, target_path).await?;
        let has_local_lexical_authority =
            !candidates.is_empty() && candidates.iter().all(candidates::Candidate::is_local);
        let can_use_external = candidates.is_empty() || has_local_lexical_authority;
        let authorized = resolution::authorize_candidates(candidates, target_path, mode).await?;
        match resolution::select(authorized) {
            Ok(path) => Ok(path),
            Err(WorkspacePathError::Unauthorized) if can_use_external => {
                self.resolve_external(target_path, mode, has_local_lexical_authority)
                    .await
            }
            Err(error) => Err(error),
        }
    }

    async fn resolve_external(
        &self,
        target_path: &str,
        mode: PathResolution,
        has_lexical_authority: bool,
    ) -> Result<AuthorizedWorkspacePath, WorkspacePathError> {
        let path = if has_lexical_authority {
            self.external_paths
                .resolve_after_lexical_authorization(target_path, mode)
                .await?
        } else {
            self.external_paths.resolve(target_path, mode).await?
        };
        let Some(path) = path else {
            return Err(WorkspacePathError::Unauthorized);
        };
        Ok(AuthorizedWorkspacePath {
            host: self.hosts.execution_host("local").await?,
            path: path.to_string_lossy().into_owned(),
        })
    }
}

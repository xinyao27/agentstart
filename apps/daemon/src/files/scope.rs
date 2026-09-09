use std::sync::Arc;

use crate::host_registry::HostRegistry;
use crate::hosts::{ExecutionHost, HostFilesystem};
use crate::workspace_paths::{PathResolution, WorkspacePathAuthority};
use crate::worktrees::WorktreeCatalog;

use super::FilesError;

#[derive(Clone)]
pub(super) struct FileScope {
    pub(super) host: Arc<dyn ExecutionHost>,
    pub(super) path: String,
    pub(super) worktree_id: String,
}

#[derive(Clone)]
pub(super) struct ScopeResolver {
    hosts: HostRegistry,
    worktrees: WorktreeCatalog,
}

impl ScopeResolver {
    pub(super) fn new(worktrees: WorktreeCatalog, hosts: HostRegistry) -> Self {
        Self { hosts, worktrees }
    }

    pub(super) async fn resolve(&self, selector: &str) -> Result<FileScope, FilesError> {
        let probe = self.worktrees.resolve_selector(selector).await?;
        Ok(FileScope {
            host: self.hosts.execution_host(&probe.host_id).await?,
            path: probe.path,
            worktree_id: probe.worktree_id,
        })
    }
}

pub(super) async fn target(
    scope: &FileScope,
    authority: &WorkspacePathAuthority,
    relative_path: &str,
    allow_empty: bool,
    mode: PathResolution,
) -> Result<(String, String), FilesError> {
    let filesystem = HostFilesystem::new(scope.host.clone());
    let (relative, candidate) =
        super::path::resolve_relative(&filesystem, &scope.path, relative_path, allow_empty)
            .map_err(FilesError::InvalidInput)?;
    let authorized = authority.resolve(&candidate, mode).await?;
    if authorized.host.id() != scope.host.id() {
        return Err(FilesError::InvalidInput("worktree host mismatch"));
    }
    Ok((relative, authorized.path))
}

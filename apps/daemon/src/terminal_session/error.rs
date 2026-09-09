use thiserror::Error;

use crate::host_registry::HostRegistryError;
use crate::hosts::HostFilesystemError;
use crate::projects::ProjectCatalogError;
use crate::settings::SettingsError;
use crate::workspace_session::WorkspaceSessionError;
use crate::worktrees::WorktreeCatalogError;

#[derive(Debug, Error)]
pub(crate) enum TerminalSessionError {
    #[error("terminal input is invalid: {0}")]
    InvalidInput(&'static str),
    #[error("terminal_not_found")]
    NotFound,
    #[error("terminal_not_writable")]
    NotWritable,
    #[error("timeout")]
    WaitTimeout,
    #[error("terminal process failed: {0}")]
    Process(String),
    #[error("terminal launch preparation failed: {0}")]
    LaunchPreparation(String),
    #[error("terminal process task failed: {0}")]
    ProcessTask(#[from] tokio::task::JoinError),
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error(transparent)]
    HostFilesystem(#[from] HostFilesystemError),
    #[error(transparent)]
    Project(#[from] ProjectCatalogError),
    #[error(transparent)]
    Settings(#[from] SettingsError),
    #[error(transparent)]
    Worktree(#[from] WorktreeCatalogError),
    #[error(transparent)]
    WorkspaceSession(#[from] WorkspaceSessionError),
}

impl TerminalSessionError {
    pub(super) fn process(error: impl std::fmt::Display) -> Self {
        Self::Process(error.to_string())
    }
}

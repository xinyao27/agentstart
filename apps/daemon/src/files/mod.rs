mod host_io;
mod inventory;
mod log_tail;
mod model;
mod mutation;
mod path;
mod query;
mod scope;
mod search;
mod terminal;
mod watch;

use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;

use thiserror::Error;

use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{HostCommandError, HostFilesystemError};
use crate::projects::ProjectCatalogError;
use crate::shell_services::ShellServicesRegistry;
use crate::terminal_session::TerminalSessionAuthority;
use crate::workspace_paths::{WorkspacePathAuthority, WorkspacePathError};
use crate::worktrees::{WorktreeCatalog, WorktreeCatalogError};
pub(crate) use model::*;

type SearchCancellation = tokio::sync::watch::Sender<bool>;
type SearchRegistry = Arc<Mutex<HashMap<(String, String), SearchCancellation>>>;

#[derive(Clone)]
pub(crate) struct FilesAuthority {
    hosts: HostRegistry,
    grants: Arc<Mutex<HashMap<String, TerminalGrant>>>,
    inventory: inventory::InventoryCache,
    paths: WorkspacePathAuthority,
    scopes: scope::ScopeResolver,
    searches: SearchRegistry,
    shells: ShellServicesRegistry,
    terminals: TerminalSessionAuthority,
    watch_sequence: Arc<AtomicU64>,
    watches: Arc<Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>>,
}

#[derive(Clone)]
struct TerminalGrant {
    absolute_path: String,
    client_id: String,
    expiry_task: tokio::task::AbortHandle,
    expires_at: Instant,
    host: Arc<dyn crate::hosts::ExecutionHost>,
    identity: String,
    worktree_id: String,
}

#[derive(Debug, Error)]
pub(crate) enum FilesError {
    #[error("binary_file")]
    BinaryFile,
    #[error("file operation failed: {0}")]
    CommandFailed(&'static str),
    #[error("file_too_large")]
    FileTooLarge,
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
    #[error("home directory is unavailable")]
    HomeUnavailable,
    #[error(transparent)]
    Host(#[from] HostCommandError),
    #[error(transparent)]
    HostRegistry(#[from] HostRegistryError),
    #[error("{0}")]
    InvalidInput(&'static str),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("path does not exist: {0}")]
    MissingPath(String),
    #[error(transparent)]
    Notify(#[from] notify::Error),
    #[error("A file or folder named '{0}' already exists in this location")]
    PathExists(String),
    #[error(transparent)]
    Project(#[from] ProjectCatalogError),
    #[error("file protocol failed: {0}")]
    Protocol(&'static str),
    #[error(transparent)]
    Serialization(#[from] serde_json::Error),
    #[error("random source failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("renderer_unavailable")]
    RendererUnavailable,
    #[error("terminal_file_grant_expired")]
    TerminalGrantExpired,
    #[error("terminal_file_grant_mismatch")]
    TerminalGrantMismatch,
    #[error("terminal_file_grant_stale")]
    TerminalGrantStale,
    #[error(transparent)]
    WorkspacePath(#[from] WorkspacePathError),
    #[error(transparent)]
    Worktree(#[from] WorktreeCatalogError),
}

impl FilesAuthority {
    pub(crate) fn new(
        worktrees: WorktreeCatalog,
        hosts: HostRegistry,
        paths: WorkspacePathAuthority,
        terminals: TerminalSessionAuthority,
        shells: ShellServicesRegistry,
    ) -> Self {
        Self {
            scopes: scope::ScopeResolver::new(worktrees, hosts.clone()),
            hosts,
            grants: Arc::new(Mutex::new(HashMap::new())),
            inventory: inventory::InventoryCache::new(),
            paths,
            searches: Arc::new(Mutex::new(HashMap::new())),
            shells,
            terminals,
            watch_sequence: Arc::new(AtomicU64::new(0)),
            watches: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

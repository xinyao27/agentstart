use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex, MutexGuard, Weak};
use std::time::Instant;

use thiserror::Error;
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{ExecutionHost, HostFilesystemError};
use crate::projects::ProjectCatalog;
use crate::settings::SettingsAuthority;
use crate::worktrees::{WorktreeCatalog, WorktreeCatalogError};

use super::GitCommandTrace;
use super::runner::GitRunner;

type GenerationCancelMap = HashMap<String, (u64, tokio::sync::watch::Sender<bool>)>;
type StatusStatsCache = HashMap<(String, String), StatusStatsCacheEntry>;
type UpstreamNegativeCache = HashMap<(String, String, String, String), UpstreamNegativeCacheEntry>;
type UpstreamResolvedCache = HashMap<(String, String, String, String), UpstreamResolvedCacheEntry>;

pub(super) struct StatusStatsCacheEntry {
    pub(super) identity: String,
    pub(super) stats: Vec<(Option<u64>, Option<u64>)>,
    pub(super) stored_at: Instant,
}

pub(super) struct UpstreamNegativeCacheEntry {
    pub(super) status: serde_json::Value,
    pub(super) stored_at: Instant,
}

pub(super) struct UpstreamResolvedCacheEntry {
    pub(super) name: String,
    pub(super) stored_at: Instant,
}

#[derive(Clone)]
pub(crate) struct GitAuthority {
    pub(super) generation_cancels: Arc<Mutex<GenerationCancelMap>>,
    pub(super) generation_sequence: Arc<AtomicU64>,
    gitignore_writes: Arc<Mutex<HashMap<String, Weak<AsyncMutex<()>>>>>,
    pub(super) history_format_support: Arc<Mutex<HashMap<String, (bool, Instant)>>>,
    pub(super) hosts: HostRegistry,
    pub(super) command_trace: GitCommandTrace,
    _projects: ProjectCatalog,
    pub(super) settings: SettingsAuthority,
    pub(super) resolved_upstream: Arc<Mutex<UpstreamResolvedCache>>,
    pub(super) status_stats: Arc<Mutex<StatusStatsCache>>,
    pub(super) upstream_negative: Arc<Mutex<UpstreamNegativeCache>>,
    pub(super) worktrees: WorktreeCatalog,
}

pub(super) struct GitScope {
    pub(super) host: Arc<dyn ExecutionHost>,
    pub(super) host_id: String,
    pub(super) runner: GitRunner,
}

#[derive(Debug, Error)]
pub(crate) enum GitAuthorityError {
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
    #[error(transparent)]
    Git(#[from] super::runner::GitError),
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error("{0}")]
    InvalidInput(&'static str),
    #[error("{0}")]
    Operation(String),
    #[error(transparent)]
    Serialization(#[from] serde_json::Error),
    #[error(transparent)]
    Worktree(#[from] WorktreeCatalogError),
}

impl GitAuthority {
    pub(crate) fn new(
        projects: ProjectCatalog,
        worktrees: WorktreeCatalog,
        hosts: HostRegistry,
        settings: SettingsAuthority,
        command_trace: GitCommandTrace,
    ) -> Self {
        Self {
            generation_cancels: Arc::new(Mutex::new(HashMap::new())),
            generation_sequence: Arc::new(AtomicU64::new(0)),
            gitignore_writes: Arc::new(Mutex::new(HashMap::new())),
            history_format_support: Arc::new(Mutex::new(HashMap::new())),
            hosts,
            command_trace,
            _projects: projects,
            settings,
            resolved_upstream: Arc::new(Mutex::new(HashMap::new())),
            status_stats: Arc::new(Mutex::new(HashMap::new())),
            upstream_negative: Arc::new(Mutex::new(HashMap::new())),
            worktrees,
        }
    }

    pub(super) async fn scope(&self, selector: &str) -> Result<GitScope, GitAuthorityError> {
        let selector = selector.strip_prefix("id:").unwrap_or(selector);
        if selector.is_empty() {
            return Err(GitAuthorityError::InvalidInput("missing worktree selector"));
        }
        let probe = self.worktrees.resolve_selector(selector).await?;
        let host = self.hosts.execution_host(&probe.host_id).await?;
        Ok(GitScope {
            host: host.clone(),
            host_id: probe.host_id,
            runner: GitRunner::new(host, probe.path, self.command_trace.clone()),
        })
    }

    pub(super) async fn lock_gitignore(&self, key: String) -> OwnedMutexGuard<()> {
        let write = {
            let mut writes = lock(&self.gitignore_writes);
            writes.retain(|_, write| write.strong_count() > 0);
            match writes.get(&key).and_then(Weak::upgrade) {
                Some(write) => write,
                None => {
                    let write = Arc::new(AsyncMutex::new(()));
                    writes.insert(key, Arc::downgrade(&write));
                    write
                }
            }
        };
        write.lock_owned().await
    }

    pub(super) fn begin_read_cache_invalidation(&self) -> GitReadCacheInvalidation {
        let guard = GitReadCacheInvalidation {
            resolved_upstream: self.resolved_upstream.clone(),
            status_stats: self.status_stats.clone(),
            upstream_negative: self.upstream_negative.clone(),
        };
        guard.clear();
        guard
    }
}

pub(super) struct GitReadCacheInvalidation {
    resolved_upstream: Arc<Mutex<UpstreamResolvedCache>>,
    status_stats: Arc<Mutex<StatusStatsCache>>,
    upstream_negative: Arc<Mutex<UpstreamNegativeCache>>,
}

impl GitReadCacheInvalidation {
    fn clear(&self) {
        lock(&self.resolved_upstream).clear();
        lock(&self.status_stats).clear();
        lock(&self.upstream_negative).clear();
    }
}

impl Drop for GitReadCacheInvalidation {
    fn drop(&mut self) {
        self.clear();
    }
}

pub(super) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

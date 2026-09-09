mod binding_preservation;
mod document;
mod host_id;
mod owner_pruning;
mod pty_binding;
mod scrollback;
mod storage;
mod version;
pub(crate) mod wire;

use std::collections::HashSet;
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};

use serde_json::{Map, Value};
use thiserror::Error;
use tokio::sync::{Mutex as AsyncMutex, watch};

use crate::projects::{ProjectCatalog, ProjectCatalogError};
use crate::terminal_scrollback::TerminalScrollbackSnapshots;
use storage::SessionPersistence;

pub(crate) use host_id::normalize_host_id;
pub(crate) use pty_binding::{PtyBinding, PtyScrollback};
pub(crate) use version::{SessionSnapshot, SessionVersion};

#[derive(Clone)]
pub(crate) struct WorkspaceSessionAuthority {
    inner: Arc<AuthorityInner>,
}

struct AuthorityInner {
    changes: watch::Sender<u64>,
    mutation: AsyncMutex<()>,
    persistence: SessionPersistence,
    projects: ProjectCatalog,
    snapshots: TerminalScrollbackSnapshots,
    state: Mutex<SessionState>,
}

struct SessionState {
    document: Map<String, Value>,
    revision: u64,
    epoch: String,
}

#[derive(Debug, Error)]
pub(crate) enum WorkspaceSessionError {
    #[error("session_version_conflict")]
    VersionConflict,
    #[error("session_version_exhausted")]
    VersionExhausted,
    #[error("session persistence worker is unavailable")]
    PersistenceUnavailable,
    #[error("session state file has no parent directory")]
    StoragePath,
    #[error("session state file is not a recoverable JSON object")]
    InvalidDocument,
    #[error("session state I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("session state JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Project(#[from] ProjectCatalogError),
    #[error("session normalization worker failed: {0}")]
    Worker(#[from] tokio::task::JoinError),
}

impl WorkspaceSessionAuthority {
    pub(crate) async fn open(
        user_data_path: &Path,
        projects: ProjectCatalog,
    ) -> Result<Self, WorkspaceSessionError> {
        let snapshots = TerminalScrollbackSnapshots::for_profile(user_data_path);
        let (persistence, document) =
            SessionPersistence::open(user_data_path, snapshots.clone()).await?;
        let owners = scrollback::ProjectOwners::new(projects.list().await?);
        let normalization_snapshots = snapshots.clone();
        let (document, changed, removed) = tokio::task::spawn_blocking(move || {
            let mut document = document;
            let prior_refs = scrollback::collect_document_refs(&document);
            let changed =
                document::migrate_loaded(&mut document, &owners, &normalization_snapshots);
            let removed = removed_refs(prior_refs, &document);
            (document, changed, removed)
        })
        .await?;
        let (version, initialize_version) = SessionVersion::load(&document)?;
        let authority = Self {
            inner: Arc::new(AuthorityInner {
                changes: watch::channel(version.revision).0,
                mutation: AsyncMutex::new(()),
                persistence,
                projects,
                snapshots,
                state: Mutex::new(SessionState {
                    document,
                    revision: version.revision,
                    epoch: version.epoch,
                }),
            }),
        };
        if changed || initialize_version {
            let document = lock(&authority.inner.state).document.clone();
            replace_and_commit(&authority.inner, document, removed)?;
            authority.flush().await?;
        }
        Ok(authority)
    }

    pub(crate) async fn get(&self, host_id: Option<&str>) -> Result<Value, WorkspaceSessionError> {
        Ok(self.get_snapshot(host_id).await?.session)
    }

    pub(crate) async fn get_snapshot(
        &self,
        host_id: Option<&str>,
    ) -> Result<SessionSnapshot, WorkspaceSessionError> {
        let _mutation = self.inner.mutation.lock().await;
        self.snapshot_under_mutation(host_id).await
    }

    async fn snapshot_under_mutation(
        &self,
        host_id: Option<&str>,
    ) -> Result<SessionSnapshot, WorkspaceSessionError> {
        let (mut session, version) = {
            let state = lock(&self.inner.state);
            (
                document::get(&state.document, host_id),
                SessionVersion {
                    epoch: state.epoch.clone(),
                    revision: state.revision,
                },
            )
        };
        let snapshots = self.inner.snapshots.clone();
        tokio::task::spawn_blocking(move || {
            scrollback::hydrate_replay_buffers(&mut session, &snapshots);
            SessionSnapshot { session, version }
        })
        .await
        .map_err(Into::into)
    }

    pub(crate) fn subscribe_changes(&self) -> watch::Receiver<u64> {
        self.inner.changes.subscribe()
    }

    pub(crate) fn current_revision(&self) -> u64 {
        *self.inner.changes.borrow()
    }

    pub(crate) fn loaded_sessions(&self) -> Vec<(Option<String>, Value)> {
        document::loaded_sessions(&lock(&self.inner.state).document)
    }

    pub(crate) fn worktree_scopes(&self) -> Vec<(Option<String>, String)> {
        document::worktree_scopes(&lock(&self.inner.state).document)
    }

    pub(crate) fn terminal_pty_references(&self) -> HashSet<String> {
        document::loaded_sessions(&lock(&self.inner.state).document)
            .into_iter()
            .flat_map(|(_, session)| collect_terminal_pty_references(&session))
            .collect()
    }

    pub(crate) async fn active_worktree(
        &self,
        host_id: Option<&str>,
    ) -> Result<Option<String>, WorkspaceSessionError> {
        Ok(self
            .get(host_id)
            .await?
            .get("activeWorktreeId")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(str::to_owned))
    }

    pub(crate) async fn set(
        &self,
        session: Value,
        host_id: Option<&str>,
        expected: SessionVersion,
    ) -> Result<SessionSnapshot, WorkspaceSessionError> {
        self.write_expected(session, host_id, expected, false).await
    }

    pub(crate) async fn patch(
        &self,
        patch: Map<String, Value>,
        host_id: Option<&str>,
        expected: SessionVersion,
    ) -> Result<SessionSnapshot, WorkspaceSessionError> {
        self.write_expected(Value::Object(patch), host_id, expected, true)
            .await
    }

    async fn write_expected(
        &self,
        value: Value,
        host_id: Option<&str>,
        expected: SessionVersion,
        is_patch: bool,
    ) -> Result<SessionSnapshot, WorkspaceSessionError> {
        let _mutation = self.inner.mutation.lock().await;
        let mut next = {
            let state = lock(&self.inner.state);
            if state.epoch != expected.epoch || state.revision != expected.revision {
                return Err(WorkspaceSessionError::VersionConflict);
            }
            state.document.clone()
        };
        let owners = scrollback::ProjectOwners::new(self.inner.projects.list().await?);
        let prior_refs = scrollback::collect_document_refs(&next);
        let snapshots = self.inner.snapshots.clone();
        let owned_host_id = host_id.map(str::to_owned);
        next = tokio::task::spawn_blocking(move || {
            if is_patch {
                document::patch(
                    &mut next,
                    owned_host_id.as_deref(),
                    value.as_object().cloned().unwrap_or_default(),
                    &owners,
                    &snapshots,
                );
            } else {
                document::set(
                    &mut next,
                    owned_host_id.as_deref(),
                    value,
                    &owners,
                    &snapshots,
                );
            }
            next
        })
        .await?;
        let removed = removed_refs(prior_refs, &next);
        replace_and_commit(&self.inner, next, removed)?;
        self.inner.persistence.flush().await?;
        self.snapshot_under_mutation(host_id).await
    }

    pub(crate) async fn mutate<R, F>(
        &self,
        host_id: Option<&str>,
        mutation: F,
    ) -> Result<R, WorkspaceSessionError>
    where
        R: Send + 'static,
        F: FnOnce(&mut Value) -> (R, bool) + Send + 'static,
    {
        let _mutation = self.inner.mutation.lock().await;
        let owners = scrollback::ProjectOwners::new(self.inner.projects.list().await?);
        let mut next = lock(&self.inner.state).document.clone();
        let prior_refs = scrollback::collect_document_refs(&next);
        let snapshots = self.inner.snapshots.clone();
        let host_id = host_id.map(str::to_owned);
        let mut session = document::get(&next, host_id.as_deref());
        let (result, changed, next) = tokio::task::spawn_blocking(move || {
            let (result, changed) = mutation(&mut session);
            if changed {
                document::set(&mut next, host_id.as_deref(), session, &owners, &snapshots);
            }
            (result, changed, next)
        })
        .await?;
        if changed {
            let removed = removed_refs(prior_refs, &next);
            replace_and_commit(&self.inner, next, removed)?;
        }
        Ok(result)
    }

    pub(crate) async fn flush(&self) -> Result<(), WorkspaceSessionError> {
        let _mutation = self.inner.mutation.lock().await;
        self.inner.persistence.flush().await
    }

    pub(crate) async fn bind_pty(&self, binding: PtyBinding) -> Result<(), WorkspaceSessionError> {
        let _mutation = self.inner.mutation.lock().await;
        let owners = scrollback::ProjectOwners::new(self.inner.projects.list().await?);
        let mut next = lock(&self.inner.state).document.clone();
        let prior_refs = scrollback::collect_document_refs(&next);
        let mut session = document::get(&next, binding.host_id.as_deref());
        pty_binding::apply(&mut session, &binding);
        document::set(
            &mut next,
            binding.host_id.as_deref(),
            session,
            &owners,
            &self.inner.snapshots,
        );
        let removed = removed_refs(prior_refs, &next);
        replace_and_commit(&self.inner, next, removed)
    }

    pub(crate) async fn set_tab_color(
        &self,
        host_id: Option<&str>,
        worktree_id: &str,
        tab_id: &str,
        color: String,
    ) -> Result<(), WorkspaceSessionError> {
        let worktree_id = worktree_id.to_owned();
        let tab_id = tab_id.to_owned();
        self.mutate(host_id, move |session| {
            let changed = pty_binding::set_tab_color(session, &worktree_id, &tab_id, &color);
            ((), changed)
        })
        .await
    }

    pub(crate) async fn bind_pty_scrollback(
        &self,
        scrollback: PtyScrollback,
    ) -> Result<(), WorkspaceSessionError> {
        let _mutation = self.inner.mutation.lock().await;
        let mut next = lock(&self.inner.state).document.clone();
        let prior_refs = scrollback::collect_document_refs(&next);
        let Some(session) = document::raw_session_mut(&mut next, scrollback.host_id.as_deref())
        else {
            return Ok(());
        };
        pty_binding::apply_scrollback(session, &scrollback);
        let removed = removed_refs(prior_refs, &next);
        replace_and_commit(&self.inner, next, removed)
    }

    pub(crate) async fn clear_pty_scrollback(
        &self,
        host_id: Option<&str>,
        tab_id: &str,
        leaf_id: &str,
    ) -> Result<(), WorkspaceSessionError> {
        let _mutation = self.inner.mutation.lock().await;
        let mut next = lock(&self.inner.state).document.clone();
        let prior_refs = scrollback::collect_document_refs(&next);
        let Some(session) = document::raw_session_mut(&mut next, host_id) else {
            return Ok(());
        };
        pty_binding::clear_scrollback(session, tab_id, leaf_id);
        let removed = removed_refs(prior_refs, &next);
        replace_and_commit(&self.inner, next, removed)
    }

    pub(crate) async fn prune_repo_owner(
        &self,
        repo_id: &str,
        host_id: Option<&str>,
    ) -> Result<(), WorkspaceSessionError> {
        let _mutation = self.inner.mutation.lock().await;
        {
            let mut next = lock(&self.inner.state).document.clone();
            let prior_refs = scrollback::collect_document_refs(&next);
            if owner_pruning::prune_repo(&mut next, repo_id, host_id) {
                let removed = removed_refs(prior_refs, &next);
                replace_and_commit(&self.inner, next, removed)?;
            }
        }
        self.inner.persistence.flush().await
    }
}

fn collect_terminal_pty_references(session: &Value) -> HashSet<String> {
    let mut references = HashSet::new();
    for tab in session
        .get("tabsByWorktree")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(Map::values)
        .filter_map(Value::as_array)
        .flatten()
    {
        if let Some(pty_id) = tab.get("ptyId").and_then(Value::as_str) {
            references.insert(pty_id.to_owned());
        }
    }
    for layout in session
        .get("terminalLayoutsByTabId")
        .and_then(Value::as_object)
        .into_iter()
        .flat_map(Map::values)
    {
        references.extend(
            layout
                .get("ptyIdsByLeafId")
                .and_then(Value::as_object)
                .into_iter()
                .flat_map(Map::values)
                .filter_map(Value::as_str)
                .map(str::to_owned),
        );
    }
    references.extend(
        session
            .get("remoteSessionIdsByTabId")
            .and_then(Value::as_object)
            .into_iter()
            .flat_map(Map::values)
            .filter_map(Value::as_str)
            .map(str::to_owned),
    );
    references
}

fn replace_and_commit(
    inner: &AuthorityInner,
    mut document: Map<String, Value>,
    removed: HashSet<String>,
) -> Result<(), WorkspaceSessionError> {
    let mut state = lock(&inner.state);
    let revision = state
        .revision
        .checked_add(1)
        .ok_or(WorkspaceSessionError::VersionExhausted)?;
    SessionVersion {
        epoch: state.epoch.clone(),
        revision,
    }
    .store(&mut document);
    inner
        .persistence
        .schedule(document.clone(), revision, removed)?;
    state.document = document;
    state.revision = revision;
    inner.changes.send_replace(revision);
    Ok(())
}

fn removed_refs(prior: HashSet<String>, document: &Map<String, Value>) -> HashSet<String> {
    let next = scrollback::collect_document_refs(document);
    prior.difference(&next).cloned().collect()
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

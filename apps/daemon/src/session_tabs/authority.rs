mod renderer;

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde_json::Value;
use thiserror::Error;
use tokio::sync::{Mutex as AsyncMutex, broadcast};

use crate::shell_services::{ShellServicesError, ShellServicesRegistry};
use crate::terminal_session::TerminalSessionAuthority;
use crate::terminal_session::TerminalSessionError;
use crate::workspace_session::{WorkspaceSessionAuthority, WorkspaceSessionError};
use crate::worktrees::{WorktreeCatalog, WorktreeCatalogError};

use super::model::{RendererSnapshot, SessionTabsUpdate};
use super::projection;
use super::subscription::{SessionTabsScope, SessionTabsSubscription, SubscriptionRegistry};

const CHANGE_CAPACITY: usize = 64;

/// One change event resolved for a worktree-scoped subscriber: the exact
/// snapshot to publish, or nothing when the change did not touch it.
pub(crate) enum WorktreeStreamUpdate {
    Publish(Value),
    Skip,
}

#[derive(Clone)]
pub(crate) struct SessionTabsAuthority {
    pub(super) inner: Arc<AuthorityInner>,
}

pub(super) struct AuthorityInner {
    pub(super) changes: broadcast::Sender<SessionTabsUpdate>,
    pub(super) create_gate: AsyncMutex<()>,
    pub(super) create_results: Mutex<CreateResults>,
    removed_clock_ms: AtomicU64,
    pub(super) shells: ShellServicesRegistry,
    pub(super) state: Mutex<ProjectionState>,
    subscriptions: SubscriptionRegistry,
    pub(super) terminals: TerminalSessionAuthority,
    pub(super) workspace_session: WorkspaceSessionAuthority,
    worktrees: WorktreeCatalog,
}

#[derive(Default)]
pub(super) struct CreateResults {
    pub(super) order: VecDeque<String>,
    pub(super) values: HashMap<String, (Instant, Value)>,
}

#[derive(Default)]
pub(super) struct ProjectionState {
    pub(super) needs_resync: bool,
    pub(super) owner: Option<String>,
    pub(super) browser_revision: u64,
    pub(super) browser_snapshots: Vec<RendererSnapshot>,
    pub(super) publication_epoch: String,
    pub(super) revision: u64,
    pub(super) snapshots: Vec<RendererSnapshot>,
}

#[derive(Debug, Error)]
pub(crate) enum SessionTabsError {
    #[error("renderer_snapshot_host_unresolved")]
    HostProvenance,
    #[error("session_tabs_state_changed")]
    StateChanged,
    #[error("renderer_projection_owned_by_another_connection")]
    RendererOwner,
    #[error("after_tab_not_found")]
    AfterTabNotFound,
    #[error("client_disconnected")]
    ClientDisconnected,
    #[error("duplicate_tab_order")]
    DuplicateTabOrder,
    #[error("invalid_tab_order")]
    InvalidTabOrder,
    #[error("renderer_unavailable")]
    RendererUnavailable,
    #[error("editor_has_unsaved_changes")]
    EditorDirty,
    #[error("tab_not_found")]
    TabNotFound,
    #[error("target_group_not_found")]
    TargetGroupNotFound,
    #[error("terminal_tab_pinned")]
    TerminalTabPinned,
    #[error(transparent)]
    Shell(Box<ShellServicesError>),
    #[error(transparent)]
    Terminal(#[from] TerminalSessionError),
    #[error(transparent)]
    Session(#[from] WorkspaceSessionError),
    #[error(transparent)]
    Worktree(#[from] WorktreeCatalogError),
}

impl From<ShellServicesError> for SessionTabsError {
    fn from(error: ShellServicesError) -> Self {
        Self::Shell(Box::new(error))
    }
}

impl SessionTabsAuthority {
    pub(crate) fn new(
        workspace_session: WorkspaceSessionAuthority,
        terminals: TerminalSessionAuthority,
        worktrees: WorktreeCatalog,
        shells: ShellServicesRegistry,
    ) -> Self {
        let (changes, _) = broadcast::channel(CHANGE_CAPACITY);
        let inner = Arc::new(AuthorityInner {
            changes,
            create_gate: AsyncMutex::new(()),
            create_results: Mutex::new(CreateResults::default()),
            removed_clock_ms: AtomicU64::new(0),
            shells,
            state: Mutex::new(ProjectionState {
                publication_epoch: format!(
                    "daemon:{}",
                    crate::terminal_session::random_id()
                        .unwrap_or_else(|_| format!("{:?}", SystemTime::now()))
                ),
                ..ProjectionState::default()
            }),
            subscriptions: SubscriptionRegistry::new(),
            terminals,
            workspace_session,
            worktrees,
        });
        renderer::forward_changes(&inner);
        Self { inner }
    }

    pub(crate) async fn list(&self, selector: &str) -> Result<Value, SessionTabsError> {
        let probe = self.inner.worktrees.resolve_selector(selector).await?;
        self.snapshot_for_probe(
            &probe.worktree_id,
            (probe.host_id != "local").then_some(probe.host_id.as_str()),
        )
        .await
    }

    pub(crate) async fn snapshot_for_scope(
        &self,
        scope: &SessionTabsScope,
    ) -> Result<Value, SessionTabsError> {
        let SessionTabsScope::Worktree { host_id, worktree } = scope else {
            return Err(SessionTabsError::HostProvenance);
        };
        let probe = self
            .inner
            .worktrees
            .resolve_selector(&format!("id:{worktree}"))
            .await?;
        let resolved_host = (probe.host_id != "local").then_some(probe.host_id);
        if &resolved_host != host_id {
            return Err(WorktreeCatalogError::AmbiguousSelector.into());
        }
        self.headless_for_probe(host_id.as_deref(), worktree).await
    }

    pub(crate) async fn snapshot_for_worktree(
        &self,
        worktree: &str,
    ) -> Result<Value, SessionTabsError> {
        let probe = self
            .inner
            .worktrees
            .resolve_selector(&format!("id:{worktree}"))
            .await?;
        self.headless_for_probe(
            (probe.host_id != "local").then_some(probe.host_id.as_str()),
            worktree,
        )
        .await
    }

    pub(crate) async fn resolve_scope(
        &self,
        selector: &str,
    ) -> Result<SessionTabsScope, SessionTabsError> {
        let probe = self.inner.worktrees.resolve_selector(selector).await?;
        Ok(SessionTabsScope::Worktree {
            host_id: (probe.host_id != "local").then_some(probe.host_id),
            worktree: probe.worktree_id,
        })
    }

    pub(crate) fn removed_snapshot(&self, worktree: &str, epoch: Option<&str>) -> Value {
        let epoch = epoch
            .map(str::to_owned)
            .unwrap_or_else(|| next_removed_epoch(&self.inner));
        projection::removed(worktree, &epoch)
    }

    /// Resolves one subscription change for a worktree-scoped subscriber into
    /// the snapshot it must publish, including the removed-snapshot and
    /// publication-epoch rules. The legacy JSON stream and the protobuf stream
    /// both publish through this one function so their semantics cannot drift;
    /// the returned flag is the subscriber's next `had_snapshot` state.
    pub(crate) async fn worktree_stream_update(
        &self,
        scope: &SessionTabsScope,
        worktree: &str,
        had_snapshot: bool,
        update: &SessionTabsUpdate,
    ) -> Result<(bool, WorktreeStreamUpdate), SessionTabsError> {
        let should_publish = update
            .worktrees
            .as_ref()
            .is_none_or(|worktrees| worktrees.iter().any(|update| update.worktree == worktree));
        if !should_publish {
            return Ok((had_snapshot, WorktreeStreamUpdate::Skip));
        }
        let removed = update
            .worktrees
            .as_ref()
            .and_then(|worktrees| worktrees.iter().find(|update| update.worktree == worktree))
            .filter(|update| update.removed);
        if let Some(removed) = removed {
            let snapshot = self.removed_snapshot(worktree, removed.removed_epoch.as_deref());
            return Ok((false, WorktreeStreamUpdate::Publish(snapshot)));
        }
        let current = self.snapshot_for_scope(scope).await?;
        let is_missing = current.get("publicationEpoch").and_then(Value::as_str) == Some("none");
        let snapshot = if had_snapshot && is_missing {
            self.removed_snapshot(worktree, None)
        } else {
            current
        };
        Ok((!is_missing, WorktreeStreamUpdate::Publish(snapshot)))
    }

    pub(crate) async fn list_all(&self) -> Result<Vec<Value>, SessionTabsError> {
        self.reconcile_headless_now().await?;
        Ok(lock(&self.inner.state)
            .snapshots
            .iter()
            .map(|snapshot| projection::client_snapshot(&snapshot.value, &self.inner.terminals))
            .collect())
    }

    pub(crate) fn subscribe(
        &self,
        connection_id: &str,
        scope: SessionTabsScope,
        subscription_id: &str,
    ) -> SessionTabsSubscription {
        self.inner.subscriptions.subscribe(
            self.inner.changes.subscribe(),
            connection_id,
            scope,
            subscription_id,
        )
    }

    pub(crate) async fn unsubscribe(
        &self,
        connection_id: &str,
        scope: &SessionTabsScope,
        subscription_id: Option<&str>,
    ) {
        self.inner
            .subscriptions
            .unsubscribe(connection_id, scope, subscription_id)
            .await;
    }

    pub(crate) fn close_connection(&self, connection_id: &str) {
        self.inner.subscriptions.close_connection(connection_id);
        let mut state = lock(&self.inner.state);
        if state.owner.as_deref() != Some(connection_id) {
            return;
        }
        state.needs_resync = false;
        state.owner = None;
        state.browser_snapshots.clear();
        state.browser_revision = state.browser_revision.saturating_add(1);
        for snapshot in &mut state.snapshots {
            if let Some(tabs) = snapshot.value.get_mut("tabs").and_then(Value::as_array_mut) {
                tabs.retain(|tab| tab.get("type").and_then(Value::as_str) != Some("browser"));
            }
        }
        state.revision = state.revision.saturating_add(1);
        let update = SessionTabsUpdate { worktrees: None };
        drop(state);
        let _ = self.inner.changes.send(update);
    }

    async fn headless_for_probe(
        &self,
        host_id: Option<&str>,
        worktree: &str,
    ) -> Result<Value, SessionTabsError> {
        self.reconcile_headless_now().await?;
        Ok(lock(&self.inner.state)
            .snapshots
            .iter()
            .find(|snapshot| snapshot.worktree == worktree && snapshot.host.matches(host_id))
            .map(|snapshot| projection::client_snapshot(&snapshot.value, &self.inner.terminals))
            .unwrap_or_else(|| projection::empty(worktree, "none", 0.0)))
    }

    async fn snapshot_for_probe(
        &self,
        worktree: &str,
        host_id: Option<&str>,
    ) -> Result<Value, SessionTabsError> {
        self.headless_for_probe(host_id, worktree).await
    }
}

pub(super) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn next_removed_epoch(inner: &AuthorityInner) -> String {
    let observed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
        .unwrap_or_default();
    let mut prior = inner.removed_clock_ms.load(Ordering::Relaxed);
    let next = loop {
        let next = observed.max(prior.saturating_add(1));
        match inner.removed_clock_ms.compare_exchange_weak(
            prior,
            next,
            Ordering::Relaxed,
            Ordering::Relaxed,
        ) {
            Ok(_) => break next,
            Err(current) => prior = current,
        }
    };
    format!("removed:{}", base36(next))
}

fn base36(mut value: u64) -> String {
    const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if value == 0 {
        return "0".to_owned();
    }
    let mut encoded = Vec::new();
    while value > 0 {
        encoded.push(DIGITS[(value % 36) as usize]);
        value /= 36;
    }
    encoded.reverse();
    String::from_utf8(encoded).unwrap_or_default()
}

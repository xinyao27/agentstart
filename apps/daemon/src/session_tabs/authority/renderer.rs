use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use serde_json::Value;

use crate::worktrees::WorktreeCatalogError;

use super::{AuthorityInner, SessionTabsAuthority, SessionTabsError, lock};
use crate::session_tabs::headless_projection;
use crate::session_tabs::model::{
    RendererHost, RendererProjection, RendererSnapshot, SessionTabsUpdate,
};

const MAX_COHERENT_PROJECTION_ATTEMPTS: usize = 8;

pub(super) struct HeadlessProjection {
    pub(super) snapshots: Vec<RendererSnapshot>,
    browser_revision: u64,
    terminal_revision: u64,
    workspace_revision: u64,
}

#[derive(Clone, Eq, PartialEq)]
enum ObservedHost {
    Ambiguous,
    Known(Option<String>),
}

impl SessionTabsAuthority {
    pub(crate) async fn sync_renderer(
        &self,
        connection_id: &str,
        projection: RendererProjection,
    ) -> Result<(), SessionTabsError> {
        let observed = self.observed_hosts();
        let mut incoming = projection.snapshots.unwrap_or_default();
        for snapshot in &mut incoming {
            match observed.get(&snapshot.worktree) {
                Some(ObservedHost::Known(host)) => {
                    if !snapshot.host.is_unknown() && !snapshot.host.matches(host.as_deref()) {
                        return Err(WorktreeCatalogError::AmbiguousSelector.into());
                    }
                    snapshot.host = RendererHost::from_scope(host.as_deref());
                }
                Some(ObservedHost::Ambiguous) => {
                    return Err(WorktreeCatalogError::AmbiguousSelector.into());
                }
                None if snapshot.host.is_unknown() => return Err(SessionTabsError::HostProvenance),
                None => {}
            }
            if let Some(tabs) = snapshot.value.get_mut("tabs").and_then(Value::as_array_mut) {
                tabs.retain(|tab| tab.get("type").and_then(Value::as_str) == Some("browser"));
                for tab in tabs {
                    tab["isActive"] = Value::Bool(false);
                }
            }
        }
        {
            let mut state = lock(&self.inner.state);
            if state
                .owner
                .as_deref()
                .is_some_and(|owner| owner != connection_id)
            {
                return Err(SessionTabsError::RendererOwner);
            }
            for next in &mut incoming {
                if let Some(prior) = state.browser_snapshots.iter().find(|prior| {
                    prior.worktree == next.worktree
                        && prior.host == next.host
                        && prior.publication_epoch == next.publication_epoch
                        && prior.snapshot_version > next.snapshot_version
                }) {
                    *next = prior.clone();
                }
            }
            state.owner = Some(connection_id.to_owned());
            state.browser_snapshots = incoming;
            state.browser_revision = state.browser_revision.saturating_add(1);
        }
        self.reconcile_headless_now().await
    }

    fn build_headless_projection(&self) -> Result<HeadlessProjection, SessionTabsError> {
        self.ensure_observed_worktrees_unambiguous(None)?;
        let terminal_revision = self.inner.terminals.current_revision();
        let workspace_revision = self.inner.workspace_session.current_revision();
        let mut grouped = Vec::<(String, Option<String>, Vec<_>)>::new();
        let mut hosts_by_worktree = HashMap::<String, Option<String>>::new();
        for binding in self.inner.terminals.headless_bindings() {
            if hosts_by_worktree
                .insert(binding.worktree_id.clone(), binding.host_id.clone())
                .is_some_and(|host_id| host_id != binding.host_id)
            {
                return Err(WorktreeCatalogError::AmbiguousSelector.into());
            }
            match grouped.iter_mut().find(|(worktree, host_id, _)| {
                *worktree == binding.worktree_id && *host_id == binding.host_id
            }) {
                Some((_, _, bindings)) => bindings.push(binding),
                None => grouped.push((
                    binding.worktree_id.clone(),
                    binding.host_id.clone(),
                    vec![binding],
                )),
            }
        }
        for (host_id, worktree) in self.inner.workspace_session.worktree_scopes() {
            if !grouped
                .iter()
                .any(|(id, host, _)| *id == worktree && *host == host_id)
            {
                grouped.push((worktree, host_id, Vec::new()));
            }
        }
        let (browser_snapshots, browser_revision) = {
            let state = lock(&self.inner.state);
            (state.browser_snapshots.clone(), state.browser_revision)
        };
        for browser in &browser_snapshots {
            let host = match &browser.host {
                RendererHost::KnownLocal => None,
                RendererHost::KnownRemote(host) => Some(host.clone()),
                RendererHost::Unknown => return Err(SessionTabsError::HostProvenance),
            };
            if !grouped
                .iter()
                .any(|(id, h, _)| *id == browser.worktree && *h == host)
            {
                grouped.push((browser.worktree.clone(), host, Vec::new()));
            }
        }
        let sessions = self
            .inner
            .workspace_session
            .loaded_sessions()
            .into_iter()
            .collect::<HashMap<_, _>>();
        let mut snapshots = Vec::with_capacity(grouped.len());
        for (worktree, host_id, bindings) in grouped {
            let session = sessions.get(&host_id).cloned().unwrap_or(Value::Null);
            let mut snapshot = headless_projection::headless_snapshot(
                &session,
                host_id.as_deref(),
                &worktree,
                workspace_revision,
                &bindings,
            );
            if let Some(browser) = browser_snapshots.iter().find(|browser| {
                browser.worktree == worktree && browser.host.matches(host_id.as_deref())
            }) && let Some(tabs) = browser.value.get("tabs").and_then(Value::as_array)
                && let Some(output) = snapshot.value.get_mut("tabs").and_then(Value::as_array_mut)
            {
                output.extend(tabs.iter().cloned());
            }
            headless_projection::presentation::apply(&session, &worktree, &mut snapshot.value);
            snapshots.push(snapshot);
        }
        Ok(HeadlessProjection {
            snapshots,
            browser_revision,
            terminal_revision,
            workspace_revision,
        })
    }

    pub(super) fn ensure_observed_worktrees_unambiguous(
        &self,
        worktrees: Option<&HashSet<String>>,
    ) -> Result<(), SessionTabsError> {
        for (worktree, host) in self.observed_hosts() {
            if worktrees.is_some_and(|worktrees| !worktrees.contains(&worktree)) {
                continue;
            }
            if host == ObservedHost::Ambiguous {
                return Err(WorktreeCatalogError::AmbiguousSelector.into());
            }
        }
        Ok(())
    }

    fn observed_hosts(&self) -> HashMap<String, ObservedHost> {
        let scopes = self
            .inner
            .workspace_session
            .worktree_scopes()
            .into_iter()
            .chain(
                self.inner
                    .terminals
                    .headless_bindings()
                    .into_iter()
                    .map(|binding| (binding.host_id, binding.worktree_id)),
            );
        let mut observed = HashMap::new();
        for (host_id, worktree) in scopes {
            observed
                .entry(worktree)
                .and_modify(|prior| {
                    if *prior != ObservedHost::Known(host_id.clone()) {
                        *prior = ObservedHost::Ambiguous;
                    }
                })
                .or_insert(ObservedHost::Known(host_id));
        }
        observed
    }

    pub(super) async fn build_coherent_headless_projection(
        &self,
    ) -> Result<HeadlessProjection, SessionTabsError> {
        for _ in 0..MAX_COHERENT_PROJECTION_ATTEMPTS {
            let projection = self.build_headless_projection()?;
            if self.is_current_projection(&projection) {
                return Ok(projection);
            }
        }
        Err(SessionTabsError::StateChanged)
    }

    pub(crate) async fn reconcile_headless_now(&self) -> Result<(), SessionTabsError> {
        for _ in 0..MAX_COHERENT_PROJECTION_ATTEMPTS {
            let headless = self.build_coherent_headless_projection().await?;
            if self.reconcile_headless(headless)? {
                return Ok(());
            }
        }
        Err(SessionTabsError::StateChanged)
    }

    fn is_current_projection(&self, projection: &HeadlessProjection) -> bool {
        self.inner.terminals.current_revision() == projection.terminal_revision
            && self.inner.workspace_session.current_revision() == projection.workspace_revision
    }

    fn reconcile_headless(
        &self,
        mut headless: HeadlessProjection,
    ) -> Result<bool, SessionTabsError> {
        let mut state = lock(&self.inner.state);
        if state.browser_revision != headless.browser_revision
            || !self.is_current_projection(&headless)
        {
            return Ok(false);
        }
        for snapshot in &mut headless.snapshots {
            snapshot.value["publicationEpoch"] = Value::String(state.publication_epoch.clone());
            snapshot.value["snapshotVersion"] = Value::from(state.revision);
        }
        if state.snapshots.len() == headless.snapshots.len()
            && headless.snapshots.iter().all(|next| {
                state.snapshots.iter().any(|prior| {
                    prior.host == next.host
                        && prior.worktree == next.worktree
                        && prior.value == next.value
                })
            })
        {
            state.needs_resync = false;
            return Ok(true);
        }
        state.needs_resync = false;
        state.revision = state.revision.saturating_add(1);
        let epoch = state.publication_epoch.clone();
        let revision = state.revision;
        state.snapshots = headless
            .snapshots
            .into_iter()
            .map(|mut snapshot| {
                snapshot.publication_epoch = epoch.clone();
                snapshot.snapshot_version = revision as f64;
                snapshot.value["publicationEpoch"] = Value::String(epoch.clone());
                snapshot.value["snapshotVersion"] = Value::from(revision);
                snapshot
            })
            .collect();
        drop(state);
        let _ = self
            .inner
            .changes
            .send(SessionTabsUpdate { worktrees: None });
        Ok(true)
    }
}

pub(super) fn forward_changes(inner: &Arc<AuthorityInner>) {
    let mut workspace_changes = inner.workspace_session.subscribe_changes();
    let mut terminal_changes = inner.terminals.subscribe_changes();
    let inner = Arc::downgrade(inner);
    tokio::spawn(async move {
        loop {
            let changed = tokio::select! {
                changed = workspace_changes.changed() => changed,
                changed = terminal_changes.changed() => changed,
            };
            if changed.is_err() {
                return;
            }
            let Some(inner) = inner.upgrade() else {
                return;
            };
            let authority = SessionTabsAuthority { inner };
            let mut reconciled = false;
            for _ in 0..MAX_COHERENT_PROJECTION_ATTEMPTS {
                match authority.build_headless_projection() {
                    Ok(headless) => match authority.reconcile_headless(headless) {
                        Ok(true) => {
                            reconciled = true;
                            break;
                        }
                        Ok(false) => {}
                        Err(_) => {
                            publish_resync(&authority.inner);
                            reconciled = true;
                            break;
                        }
                    },
                    Err(_) => {
                        publish_resync(&authority.inner);
                        reconciled = true;
                        break;
                    }
                }
            }
            if !reconciled {
                publish_resync(&authority.inner);
            }
        }
    });
}

fn publish_resync(inner: &AuthorityInner) {
    let mut state = lock(&inner.state);
    state.needs_resync = true;
    state.revision = state.revision.saturating_add(1);
    let update = SessionTabsUpdate { worktrees: None };
    drop(state);
    let _ = inner.changes.send(update);
}

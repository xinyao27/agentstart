use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, MutexGuard};

use super::advertised_cache::{AdvertisedUrlState, CacheKey, ListenerState};
use super::advertised_url::{self, AdvertisedUrl};
use super::subscription::{
    EventAuthority, WorkspacePortSubscription, WorkspacePortSubscriptionEvent,
};

#[derive(Clone)]
pub(super) struct AdvertisedUrls {
    events: EventAuthority,
    state: Arc<Mutex<AdvertisedUrlState>>,
}

impl AdvertisedUrls {
    pub(super) fn new(events: EventAuthority) -> Self {
        Self {
            events,
            state: Arc::new(Mutex::new(AdvertisedUrlState::default())),
        }
    }

    pub(super) fn observe(
        &self,
        pty_id: &str,
        worktree_id: &str,
        url: &str,
        observed_at: i64,
    ) -> bool {
        let Some(candidate) = advertised_url::parse(url, pty_id, observed_at) else {
            return false;
        };
        let key = CacheKey {
            port: candidate.port,
            worktree_id: worktree_id.to_owned(),
        };
        let changes = {
            let mut state = lock(&self.state);
            if let Some(existing) = state.cache.get_mut(&key)
                && !advertised_url::should_replace(existing, &candidate)
            {
                existing.last_seen_at = observed_at;
                return true;
            }
            let origin_changed = state
                .cache
                .get(&key)
                .is_none_or(|existing| existing.origin != candidate.origin);
            state.cache.insert(key.clone(), candidate);
            state.capture_validation_baseline(&key);
            let mut changes = state.enforce_limit();
            if origin_changed {
                changes.push(key);
            }
            changes
        };
        self.emit(changes);
        true
    }

    pub(super) fn remove_pty(&self, pty_id: &str) {
        let changes = {
            let mut state = lock(&self.state);
            let keys = state
                .cache
                .iter()
                .filter(|(_, value)| value.pty_id == pty_id)
                .map(|(key, _)| key.clone())
                .collect::<Vec<_>>();
            for key in &keys {
                state.delete(key);
            }
            keys
        };
        self.emit(changes);
    }

    pub(super) fn forget_worktree(&self, worktree_id: &str) {
        let changes = {
            let mut state = lock(&self.state);
            state.delete_scan_snapshot(worktree_id);
            let keys = state
                .cache
                .keys()
                .filter(|key| key.worktree_id == worktree_id)
                .cloned()
                .collect::<Vec<_>>();
            for key in &keys {
                state.delete(key);
            }
            keys
        };
        self.emit(changes);
    }

    pub(super) fn reconcile(&self, worktree_id: &str, listeners: &[(u16, Option<u32>)]) {
        let mut observed = HashMap::new();
        for &(port, pid) in listeners {
            match observed.entry(port) {
                std::collections::hash_map::Entry::Vacant(entry) => {
                    entry.insert(pid);
                }
                std::collections::hash_map::Entry::Occupied(mut entry) if *entry.get() != pid => {
                    entry.insert(None);
                }
                std::collections::hash_map::Entry::Occupied(_) => {}
            }
        }
        let changes = {
            let mut state = lock(&self.state);
            let keys = state
                .cache
                .keys()
                .filter(|key| key.worktree_id == worktree_id)
                .cloned()
                .collect::<Vec<_>>();
            let mut changes = Vec::new();
            for key in keys {
                let current = observed
                    .get(&key.port)
                    .map_or(ListenerState::Absent, |pid| ListenerState::Present(*pid));
                if state.should_evict_after_scan(&key, current) {
                    state.delete(&key);
                    changes.push(key);
                } else if state
                    .cache
                    .get(&key)
                    .is_some_and(|entry| entry.validated_listener_pid.is_none())
                {
                    state.validation_baselines.insert(key, current);
                }
            }
            state.record_scan_snapshot(worktree_id.to_owned(), observed);
            changes
        };
        self.emit(changes);
    }

    pub(super) fn lookup(
        &self,
        worktree_id: &str,
        port: u16,
        current_listener_pid: Option<u32>,
    ) -> Option<AdvertisedUrl> {
        let key = CacheKey {
            port,
            worktree_id: worktree_id.to_owned(),
        };
        let (entry, changed) = {
            let mut state = lock(&self.state);
            let entry = state.cache.get(&key)?;
            let mismatch = current_listener_pid.is_some_and(|current_pid| {
                entry
                    .validated_listener_pid
                    .is_some_and(|validated| validated != current_pid)
            });
            if mismatch {
                state.delete(&key);
                (None, true)
            } else {
                if let Some(current_pid) = current_listener_pid
                    && let Some(entry) = state.cache.get_mut(&key)
                {
                    entry.validated_listener_pid = Some(current_pid);
                }
                (state.cache.get(&key).cloned(), false)
            }
        };
        if changed {
            self.emit([key]);
        }
        entry
    }

    pub(super) fn subscribe(&self, connection_id: Option<&str>) -> WorkspacePortSubscription {
        self.events.subscribe(connection_id)
    }

    pub(super) fn close(&self) {
        self.events.close();
        self.clear();
    }

    pub(super) fn clear(&self) {
        lock(&self.state).clear();
    }

    fn emit(&self, changes: impl IntoIterator<Item = CacheKey>) {
        let mut unique = HashSet::new();
        for key in changes {
            if unique.insert(key.clone()) {
                self.events
                    .publish(WorkspacePortSubscriptionEvent::AdvertisedUrlChanged {
                        port: key.port,
                        worktree_id: key.worktree_id,
                    });
            }
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

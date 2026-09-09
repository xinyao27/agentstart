use std::collections::{HashMap, HashSet, VecDeque};

use super::advertised_url::AdvertisedUrl;

const MAX_CACHE_ENTRIES: usize = 256;

#[derive(Default)]
pub(super) struct AdvertisedUrlState {
    pub(super) cache: HashMap<CacheKey, AdvertisedUrl>,
    scan_snapshot_order: VecDeque<String>,
    pub(super) scan_snapshots: HashMap<String, HashMap<u16, Option<u32>>>,
    pub(super) startup_absent_allowances: HashSet<CacheKey>,
    pub(super) validation_baselines: HashMap<CacheKey, ListenerState>,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(super) struct CacheKey {
    pub(super) port: u16,
    pub(super) worktree_id: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum ListenerState {
    Absent,
    Present(Option<u32>),
}

impl AdvertisedUrlState {
    pub(super) fn record_scan_snapshot(
        &mut self,
        worktree_id: String,
        snapshot: HashMap<u16, Option<u32>>,
    ) {
        self.scan_snapshot_order
            .retain(|candidate| candidate != &worktree_id);
        self.scan_snapshot_order.push_back(worktree_id.clone());
        self.scan_snapshots.insert(worktree_id, snapshot);
        while self.scan_snapshots.len() > MAX_CACHE_ENTRIES {
            let Some(oldest) = self.scan_snapshot_order.pop_front() else {
                break;
            };
            self.scan_snapshots.remove(&oldest);
        }
    }

    pub(super) fn delete_scan_snapshot(&mut self, worktree_id: &str) {
        self.scan_snapshots.remove(worktree_id);
        self.scan_snapshot_order
            .retain(|candidate| candidate != worktree_id);
    }

    pub(super) fn capture_validation_baseline(&mut self, key: &CacheKey) {
        let baseline = self.scan_snapshots.get(&key.worktree_id).map(|snapshot| {
            snapshot
                .get(&key.port)
                .map_or(ListenerState::Absent, |pid| ListenerState::Present(*pid))
        });
        match baseline {
            None => {
                self.validation_baselines.remove(key);
                self.startup_absent_allowances.insert(key.clone());
            }
            Some(baseline @ ListenerState::Absent) => {
                self.validation_baselines.insert(key.clone(), baseline);
                self.startup_absent_allowances.insert(key.clone());
            }
            Some(baseline @ ListenerState::Present(_)) => {
                self.validation_baselines.insert(key.clone(), baseline);
                self.startup_absent_allowances.remove(key);
            }
        }
    }

    pub(super) fn should_evict_after_scan(
        &mut self,
        key: &CacheKey,
        current: ListenerState,
    ) -> bool {
        let Some(entry) = self.cache.get(key) else {
            return false;
        };
        let validated_pid = entry.validated_listener_pid;
        let baseline = self.validation_baselines.get(key).copied();
        if current == ListenerState::Absent {
            if validated_pid.is_none()
                && !matches!(baseline, Some(ListenerState::Present(_)))
                && self.startup_absent_allowances.remove(key)
            {
                return false;
            }
            return true;
        }
        if let (Some(validated), ListenerState::Present(Some(current_pid))) =
            (validated_pid, current)
            && validated != current_pid
        {
            return true;
        }
        if baseline == Some(ListenerState::Absent) {
            self.startup_absent_allowances.remove(key);
            return false;
        }
        validated_pid.is_none() && baseline.is_some() && baseline != Some(current)
    }

    pub(super) fn enforce_limit(&mut self) -> Vec<CacheKey> {
        let overflow = self.cache.len().saturating_sub(MAX_CACHE_ENTRIES);
        let mut entries = self
            .cache
            .iter()
            .map(|(key, value)| (key.clone(), value.last_seen_at))
            .collect::<Vec<_>>();
        entries.sort_by_key(|(_, last_seen_at)| *last_seen_at);
        let keys = entries
            .into_iter()
            .take(overflow)
            .map(|(key, _)| key)
            .collect::<Vec<_>>();
        for key in &keys {
            self.delete(key);
        }
        keys
    }

    pub(super) fn delete(&mut self, key: &CacheKey) {
        self.cache.remove(key);
        self.validation_baselines.remove(key);
        self.startup_absent_allowances.remove(key);
    }

    pub(super) fn clear(&mut self) {
        self.cache.clear();
        self.scan_snapshot_order.clear();
        self.scan_snapshots.clear();
        self.startup_absent_allowances.clear();
        self.validation_baselines.clear();
    }
}

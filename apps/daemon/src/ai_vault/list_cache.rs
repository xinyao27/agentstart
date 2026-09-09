use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use super::model::AiVaultListResult;

const CACHE_TTL: Duration = Duration::from_secs(15);
const CACHE_ENTRY_LIMIT: usize = 32;

pub(super) struct SessionListCache {
    entries: Mutex<HashMap<String, CacheEntry>>,
}

struct CacheEntry {
    expires_at: Instant,
    result: AiVaultListResult,
}

impl SessionListCache {
    pub(super) fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }

    pub(super) fn get(&self, key: &str) -> Option<AiVaultListResult> {
        let now = Instant::now();
        let mut entries = lock(&self.entries);
        entries.retain(|_, entry| entry.expires_at > now);
        entries.get(key).map(|entry| entry.result.clone())
    }

    pub(super) fn store(&self, key: String, result: AiVaultListResult) {
        let mut entries = lock(&self.entries);
        if entries.len() >= CACHE_ENTRY_LIMIT
            && let Some(oldest) = entries
                .iter()
                .min_by_key(|(_, entry)| entry.expires_at)
                .map(|(key, _)| key.clone())
        {
            entries.remove(&oldest);
        }
        entries.insert(
            key,
            CacheEntry {
                expires_at: Instant::now() + CACHE_TTL,
                result,
            },
        );
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

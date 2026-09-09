use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

const COOLDOWN: Duration = Duration::from_secs(5);
const MAX_RECENT_KEYS: usize = 50;

#[derive(Default)]
pub(super) struct NotificationDeliveryPolicy {
    local: Mutex<CooldownTracker>,
    mobile: Mutex<CooldownTracker>,
}

#[derive(Default)]
struct CooldownTracker {
    order: VecDeque<String>,
    recent_by_key: HashMap<String, Instant>,
}

impl NotificationDeliveryPolicy {
    pub(super) fn reserve_local(&self, key: &str) -> bool {
        lock(&self.local).reserve(key, Instant::now())
    }

    pub(super) fn reserve_mobile(&self, key: &str) -> bool {
        lock(&self.mobile).reserve(key, Instant::now())
    }

    pub(super) fn rollback_local(&self, key: &str) {
        lock(&self.local).rollback(key);
    }

    pub(super) fn rollback_mobile(&self, key: &str) {
        lock(&self.mobile).rollback(key);
    }
}

impl CooldownTracker {
    fn reserve(&mut self, key: &str, now: Instant) -> bool {
        if self
            .recent_by_key
            .get(key)
            .is_some_and(|reserved_at| now.duration_since(*reserved_at) < COOLDOWN)
        {
            return false;
        }
        self.rollback(key);
        self.recent_by_key.insert(key.to_owned(), now);
        self.order.push_back(key.to_owned());
        self.prune(now);
        true
    }

    fn rollback(&mut self, key: &str) {
        self.recent_by_key.remove(key);
        self.order.retain(|candidate| candidate != key);
    }

    fn prune(&mut self, now: Instant) {
        if self.recent_by_key.len() <= MAX_RECENT_KEYS {
            return;
        }
        while let Some(key) = self.order.front() {
            let is_expired = self
                .recent_by_key
                .get(key)
                .is_none_or(|reserved_at| now.duration_since(*reserved_at) >= COOLDOWN);
            if !is_expired {
                break;
            }
            let key = self.order.pop_front().expect("front key exists");
            self.recent_by_key.remove(&key);
        }
        while self.recent_by_key.len() > MAX_RECENT_KEYS {
            let Some(key) = self.order.pop_front() else {
                break;
            };
            self.recent_by_key.remove(&key);
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

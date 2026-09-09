use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, Weak};

use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard, watch};

#[derive(Clone)]
pub(super) struct CloneCoordinator {
    active: Arc<Mutex<Option<ActiveClone>>>,
    locks: Arc<Mutex<HashMap<String, Weak<AsyncMutex<()>>>>>,
    next_id: Arc<AtomicU64>,
}

struct ActiveClone {
    cancel: watch::Sender<bool>,
    id: u64,
}

pub(super) struct ActiveCloneGuard {
    active: Arc<Mutex<Option<ActiveClone>>>,
    cancelled: watch::Receiver<bool>,
    id: u64,
}

impl CloneCoordinator {
    pub(super) fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(None)),
            locks: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(AtomicU64::new(1)),
        }
    }

    pub(super) async fn acquire(&self, key: String) -> OwnedMutexGuard<()> {
        let lock = {
            let mut locks = lock(&self.locks);
            locks.retain(|_, value| value.strong_count() > 0);
            match locks.get(&key).and_then(Weak::upgrade) {
                Some(lock) => lock,
                None => {
                    let value = Arc::new(AsyncMutex::new(()));
                    locks.insert(key, Arc::downgrade(&value));
                    value
                }
            }
        };
        lock.lock_owned().await
    }

    pub(super) fn begin(&self) -> ActiveCloneGuard {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (cancel, cancelled) = watch::channel(false);
        *lock(&self.active) = Some(ActiveClone { cancel, id });
        ActiveCloneGuard {
            active: self.active.clone(),
            cancelled,
            id,
        }
    }

    pub(super) fn abort(&self) {
        if let Some(active) = lock(&self.active).take() {
            let _ = active.cancel.send(true);
        }
    }
}

impl ActiveCloneGuard {
    pub(super) fn cancelled(&self) -> watch::Receiver<bool> {
        self.cancelled.clone()
    }
}

impl Drop for ActiveCloneGuard {
    fn drop(&mut self) {
        let mut active = lock(&self.active);
        if active.as_ref().is_some_and(|active| active.id == self.id) {
            active.take();
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

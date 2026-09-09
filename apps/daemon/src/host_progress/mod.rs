use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use serde::Serialize;
use tokio::sync::mpsc;

const SUBSCRIPTION_CAPACITY: usize = 64;

#[derive(Clone)]
pub(crate) struct HostProgressAuthority {
    inner: Arc<Inner>,
}

struct Inner {
    next_id: AtomicU64,
    subscribers: Mutex<HashMap<String, mpsc::Sender<HostProgressEvent>>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum HostProgressEvent {
    RepoCloneProgress { phase: String, percent: u8 },
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum HostProgressSubscriptionEvent {
    Ready { subscription_id: String },
    RepoCloneProgress { phase: String, percent: u8 },
    End,
}

pub(crate) struct HostProgressSubscription {
    authority: HostProgressAuthority,
    ended: bool,
    id: String,
    receiver: mpsc::Receiver<HostProgressEvent>,
    ready: bool,
}

impl HostProgressAuthority {
    pub(crate) fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                next_id: AtomicU64::new(1),
                subscribers: Mutex::new(HashMap::new()),
            }),
        }
    }

    pub(crate) fn publish(&self, event: HostProgressEvent) {
        let mut subscribers = lock(&self.inner.subscribers);
        subscribers.retain(|_, sender| match sender.try_send(event.clone()) {
            Ok(()) => true,
            Err(mpsc::error::TrySendError::Closed(_) | mpsc::error::TrySendError::Full(_)) => false,
        });
    }

    pub(crate) fn subscribe(&self) -> HostProgressSubscription {
        let sequence = self.inner.next_id.fetch_add(1, Ordering::Relaxed);
        let id = format!("runtime-progress-events-{sequence}");
        let (sender, receiver) = mpsc::channel(SUBSCRIPTION_CAPACITY);
        lock(&self.inner.subscribers).insert(id.clone(), sender);
        HostProgressSubscription {
            authority: self.clone(),
            ended: false,
            id,
            receiver,
            ready: false,
        }
    }
}

impl HostProgressSubscription {
    pub(crate) async fn next(&mut self) -> Option<HostProgressSubscriptionEvent> {
        if !self.ready {
            self.ready = true;
            return Some(HostProgressSubscriptionEvent::Ready {
                subscription_id: self.id.clone(),
            });
        }
        if self.ended {
            return None;
        }
        match self.receiver.recv().await {
            Some(HostProgressEvent::RepoCloneProgress { phase, percent }) => {
                Some(HostProgressSubscriptionEvent::RepoCloneProgress { phase, percent })
            }
            None => {
                self.ended = true;
                Some(HostProgressSubscriptionEvent::End)
            }
        }
    }
}

impl Drop for HostProgressSubscription {
    fn drop(&mut self) {
        lock(&self.authority.inner.subscribers).remove(&self.id);
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, Weak};

use serde::Serialize;
use tokio::sync::mpsc;

const EVENT_QUEUE_DEPTH: usize = 8;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum WorkspacePortSubscriptionEvent {
    Ready {
        #[serde(rename = "subscriptionId")]
        subscription_id: String,
    },
    AdvertisedUrlChanged {
        port: u16,
        #[serde(rename = "worktreeId")]
        worktree_id: String,
    },
    End,
}

pub struct WorkspacePortSubscription {
    events: Weak<EventAuthorityInner>,
    id: u64,
    is_ended: bool,
    ready: Option<String>,
    receiver: mpsc::Receiver<WorkspacePortSubscriptionEvent>,
}

#[derive(Clone)]
pub(super) struct EventAuthority {
    inner: Arc<EventAuthorityInner>,
}

struct EventAuthorityInner {
    closed: AtomicBool,
    next_id: AtomicU64,
    subscribers: Mutex<HashMap<u64, mpsc::Sender<WorkspacePortSubscriptionEvent>>>,
}

impl EventAuthority {
    pub(super) fn new() -> Self {
        Self {
            inner: Arc::new(EventAuthorityInner {
                closed: AtomicBool::new(false),
                next_id: AtomicU64::new(0),
                subscribers: Mutex::new(HashMap::new()),
            }),
        }
    }

    pub(super) fn subscribe(&self, connection_id: Option<&str>) -> WorkspacePortSubscription {
        let id = self.inner.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let (sender, receiver) = mpsc::channel(EVENT_QUEUE_DEPTH);
        let mut subscribers = lock(&self.inner.subscribers);
        if self.inner.closed.load(Ordering::Acquire) {
            let _ = sender.try_send(WorkspacePortSubscriptionEvent::End);
        } else {
            subscribers.insert(id, sender);
        }
        drop(subscribers);
        WorkspacePortSubscription {
            events: Arc::downgrade(&self.inner),
            id,
            is_ended: false,
            ready: Some(format!(
                "workspace-port-events-{}-{id}",
                connection_id.unwrap_or("inproc")
            )),
            receiver,
        }
    }

    pub(super) fn publish(&self, event: WorkspacePortSubscriptionEvent) {
        let mut subscribers = lock(&self.inner.subscribers);
        subscribers.retain(|_, subscriber| subscriber.try_send(event.clone()).is_ok());
    }

    pub(super) fn close(&self) {
        if self.inner.closed.swap(true, Ordering::AcqRel) {
            return;
        }
        let subscribers = std::mem::take(&mut *lock(&self.inner.subscribers));
        for subscriber in subscribers.into_values() {
            let _ = subscriber.try_send(WorkspacePortSubscriptionEvent::End);
        }
    }
}

impl WorkspacePortSubscription {
    pub async fn next(&mut self) -> Option<WorkspacePortSubscriptionEvent> {
        if let Some(subscription_id) = self.ready.take() {
            return Some(WorkspacePortSubscriptionEvent::Ready { subscription_id });
        }
        if self.is_ended {
            return None;
        }
        match self.receiver.recv().await {
            Some(WorkspacePortSubscriptionEvent::End) | None => {
                self.is_ended = true;
                Some(WorkspacePortSubscriptionEvent::End)
            }
            event => event,
        }
    }
}

impl Drop for WorkspacePortSubscription {
    fn drop(&mut self) {
        if let Some(events) = self.events.upgrade() {
            lock(&events.subscribers).remove(&self.id);
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

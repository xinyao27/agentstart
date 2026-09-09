use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::mpsc;

use super::NestedRepoScanEvent;

const EVENT_QUEUE_DEPTH: usize = 8;

/// The subscription's typed event sequence: one synthesized ready event with
/// the subscription id, then each scan's progress. The legacy JSON stream and
/// the protobuf stream both consume this one sequence so they cannot drift.
pub(crate) enum ScanSubscriptionEvent {
    Ready {
        subscription_id: String,
    },
    Progress {
        scan_id: String,
        scan: super::NestedRepoScan,
    },
}

#[derive(Clone)]
pub(super) struct ScanEvents {
    inner: Arc<Inner>,
}

struct Inner {
    next_id: Mutex<u64>,
    subscribers: Mutex<HashMap<u64, mpsc::Sender<NestedRepoScanEvent>>>,
}

pub(crate) struct ScanSubscription {
    events: ScanEvents,
    id: u64,
    receiver: mpsc::Receiver<NestedRepoScanEvent>,
    subscription_id: Option<String>,
}

impl ScanEvents {
    pub(super) fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
                next_id: Mutex::new(0),
                subscribers: Mutex::new(HashMap::new()),
            }),
        }
    }

    pub(super) fn publish(&self, event: NestedRepoScanEvent) {
        lock(&self.inner.subscribers).retain(|_, sender| sender.try_send(event.clone()).is_ok());
    }

    pub(super) fn subscribe(&self, connection_id: Option<&str>) -> ScanSubscription {
        let (sender, receiver) = mpsc::channel(EVENT_QUEUE_DEPTH);
        let mut next_id = lock(&self.inner.next_id);
        *next_id = next_id.saturating_add(1);
        let id = *next_id;
        lock(&self.inner.subscribers).insert(id, sender);
        ScanSubscription {
            events: self.clone(),
            id,
            receiver,
            subscription_id: Some(format!(
                "project-group-events-{}-{id}",
                connection_id.unwrap_or("inproc")
            )),
        }
    }
}

impl ScanSubscription {
    pub(crate) async fn next(&mut self) -> Option<ScanSubscriptionEvent> {
        if let Some(subscription_id) = self.subscription_id.take() {
            return Some(ScanSubscriptionEvent::Ready { subscription_id });
        }
        self.receiver.recv().await.map(|event| match event {
            NestedRepoScanEvent::Progress { scan, scan_id } => {
                ScanSubscriptionEvent::Progress { scan_id, scan }
            }
        })
    }
}

impl Drop for ScanSubscription {
    fn drop(&mut self) {
        lock(&self.events.inner.subscribers).remove(&self.id);
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

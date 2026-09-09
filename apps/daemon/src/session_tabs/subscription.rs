use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, Weak};

use tokio::sync::{broadcast, watch};

use super::model::SessionTabsUpdate;

#[derive(Clone)]
pub(super) struct SubscriptionRegistry {
    inner: Arc<RegistryInner>,
}

struct RegistryInner {
    next_subscription: AtomicU64,
    subscriptions: Mutex<HashMap<SubscriptionKey, RegisteredSubscription>>,
}

struct RegisteredSubscription {
    cancel: watch::Sender<bool>,
    closed: watch::Receiver<bool>,
    nonce: u64,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) enum SessionTabsScope {
    All,
    Worktree {
        host_id: Option<String>,
        worktree: String,
    },
}

#[derive(Clone, Eq, Hash, PartialEq)]
struct SubscriptionKey {
    connection_id: String,
    scope: SessionTabsScope,
    subscription_id: String,
}

pub(crate) struct SessionTabsSubscription {
    cancel: watch::Receiver<bool>,
    changes: broadcast::Receiver<SessionTabsUpdate>,
    closed: watch::Sender<bool>,
    inner: Weak<RegistryInner>,
    key: SubscriptionKey,
    nonce: u64,
}

pub(crate) enum SessionTabsSubscriptionEvent {
    Changed(SessionTabsUpdate),
    End,
    Resync,
}

impl SubscriptionRegistry {
    pub(super) fn new() -> Self {
        Self {
            inner: Arc::new(RegistryInner {
                next_subscription: AtomicU64::new(0),
                subscriptions: Mutex::new(HashMap::new()),
            }),
        }
    }

    pub(super) fn subscribe(
        &self,
        changes: broadcast::Receiver<SessionTabsUpdate>,
        connection_id: &str,
        scope: SessionTabsScope,
        subscription_id: &str,
    ) -> SessionTabsSubscription {
        let key = SubscriptionKey {
            connection_id: connection_id.to_owned(),
            scope: scope.clone(),
            subscription_id: subscription_id.to_owned(),
        };
        let nonce = self
            .inner
            .next_subscription
            .fetch_add(1, Ordering::Relaxed)
            .saturating_add(1);
        let (cancel, cancel_rx) = watch::channel(false);
        let (closed, closed_rx) = watch::channel(false);
        let prior = lock(&self.inner.subscriptions).insert(
            key.clone(),
            RegisteredSubscription {
                cancel,
                closed: closed_rx,
                nonce,
            },
        );
        if let Some(prior) = prior {
            prior.cancel.send_replace(true);
        }
        SessionTabsSubscription {
            cancel: cancel_rx,
            changes,
            closed,
            inner: Arc::downgrade(&self.inner),
            key,
            nonce,
        }
    }

    pub(super) async fn unsubscribe(
        &self,
        connection_id: &str,
        scope: &SessionTabsScope,
        subscription_id: Option<&str>,
    ) {
        let subscriptions = {
            let mut registry = lock(&self.inner.subscriptions);
            let keys = registry
                .keys()
                .filter(|key| {
                    key.connection_id == connection_id
                        && &key.scope == scope
                        && subscription_id
                            .is_none_or(|subscription_id| key.subscription_id == subscription_id)
                })
                .cloned()
                .collect::<Vec<_>>();
            keys.into_iter()
                .filter_map(|key| registry.remove(&key))
                .collect::<Vec<_>>()
        };
        close_subscriptions(subscriptions).await;
    }

    pub(super) fn close_connection(&self, connection_id: &str) {
        let subscriptions = {
            let mut registry = lock(&self.inner.subscriptions);
            let keys = registry
                .keys()
                .filter(|key| key.connection_id == connection_id)
                .cloned()
                .collect::<Vec<_>>();
            keys.into_iter()
                .filter_map(|key| registry.remove(&key))
                .collect::<Vec<_>>()
        };
        for subscription in subscriptions {
            subscription.cancel.send_replace(true);
        }
    }
}

impl SessionTabsSubscription {
    pub(crate) fn is_cancelled(&self) -> bool {
        *self.cancel.borrow()
    }

    pub(crate) async fn next(&mut self) -> SessionTabsSubscriptionEvent {
        tokio::select! {
            biased;
            result = self.cancel.changed() => {
                if result.is_err() || *self.cancel.borrow() {
                    SessionTabsSubscriptionEvent::End
                } else {
                    SessionTabsSubscriptionEvent::Resync
                }
            }
            update = self.changes.recv() => match update {
                Ok(update) => SessionTabsSubscriptionEvent::Changed(update),
                Err(broadcast::error::RecvError::Lagged(_)) => SessionTabsSubscriptionEvent::Resync,
                Err(broadcast::error::RecvError::Closed) => SessionTabsSubscriptionEvent::End,
            }
        }
    }
}

impl Drop for SessionTabsSubscription {
    fn drop(&mut self) {
        self.closed.send_replace(true);
        let Some(inner) = self.inner.upgrade() else {
            return;
        };
        let mut subscriptions = lock(&inner.subscriptions);
        if subscriptions
            .get(&self.key)
            .is_some_and(|subscription| subscription.nonce == self.nonce)
        {
            subscriptions.remove(&self.key);
        }
    }
}

async fn close_subscriptions(subscriptions: Vec<RegisteredSubscription>) {
    for subscription in &subscriptions {
        subscription.cancel.send_replace(true);
    }
    for mut subscription in subscriptions {
        let _ = subscription.closed.wait_for(|closed| *closed).await;
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

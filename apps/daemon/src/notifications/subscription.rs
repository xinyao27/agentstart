use std::collections::VecDeque;
use std::sync::Arc;

use tokio::sync::{broadcast, watch};

use super::{
    NotificationError, NotificationStore, REPLAY_CAPACITY, ReplayableNotification,
    SubscriptionRegistry,
};

pub(crate) struct NotificationSubscription {
    cancelled: watch::Receiver<bool>,
    committed: broadcast::Receiver<()>,
    cursor: i64,
    id: String,
    registry: Arc<SubscriptionRegistry>,
    replay: VecDeque<ReplayableNotification>,
    replay_was_full: bool,
    store: NotificationStore,
}

impl NotificationSubscription {
    pub(super) fn new(
        id: String,
        cursor: i64,
        store: NotificationStore,
        committed: broadcast::Receiver<()>,
        cancelled: watch::Receiver<bool>,
        registry: Arc<SubscriptionRegistry>,
    ) -> Self {
        Self {
            cancelled,
            committed,
            cursor,
            id,
            registry,
            replay: VecDeque::new(),
            replay_was_full: true,
            store,
        }
    }

    pub(crate) async fn next(
        &mut self,
    ) -> Result<Option<ReplayableNotification>, NotificationError> {
        loop {
            if *self.cancelled.borrow() {
                return Ok(None);
            }
            if let Some(notification) = self.replay.pop_front() {
                self.cursor = notification.notification_seq;
                return Ok(Some(notification));
            }
            if self.replay_was_full {
                self.refill().await?;
                if !self.replay.is_empty() {
                    continue;
                }
            }
            tokio::select! {
                biased;
                changed = self.cancelled.changed() => {
                    if changed.is_err() || *self.cancelled.borrow() {
                        return Ok(None);
                    }
                }
                committed = self.committed.recv() => {
                    match committed {
                        Ok(()) | Err(broadcast::error::RecvError::Lagged(_)) => {
                            self.replay_was_full = true;
                        }
                        Err(broadcast::error::RecvError::Closed) => return Ok(None),
                    }
                }
            }
        }
    }

    async fn refill(&mut self) -> Result<(), NotificationError> {
        let replay = self.store.missed_since(self.cursor).await?;
        self.replay_was_full = replay.len() == REPLAY_CAPACITY;
        self.replay = VecDeque::from(replay);
        Ok(())
    }
}

impl Drop for NotificationSubscription {
    fn drop(&mut self) {
        self.registry.close(&self.id);
    }
}

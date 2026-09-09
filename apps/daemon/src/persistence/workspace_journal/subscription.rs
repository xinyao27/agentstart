use std::collections::VecDeque;

use tokio::sync::broadcast;

use super::{
    SubscriptionSeed, WorkspaceEvent, WorkspaceJournal, WorkspaceJournalError, WorkspaceSnapshot,
};

pub(crate) struct WorkspaceSubscription {
    committed: broadcast::Receiver<()>,
    cursor: i64,
    journal: WorkspaceJournal,
    replay: VecDeque<WorkspaceEvent>,
    replay_until: i64,
    scope: String,
}

impl WorkspaceSubscription {
    pub(super) fn new(
        journal: WorkspaceJournal,
        scope: String,
        cursor: i64,
        seed: SubscriptionSeed,
    ) -> Self {
        Self {
            committed: seed.committed,
            cursor,
            journal,
            replay: VecDeque::from(seed.snapshot.events),
            replay_until: seed.snapshot.latest_id,
            scope,
        }
    }

    pub(crate) async fn next(&mut self) -> Result<Option<WorkspaceEvent>, WorkspaceJournalError> {
        loop {
            if let Some(event) = self.replay.pop_front() {
                self.cursor = event.id;
                return Ok(Some(event));
            }
            if self.cursor < self.replay_until {
                self.refill_replay().await?;
                continue;
            }
            match self.committed.recv().await {
                Ok(()) | Err(broadcast::error::RecvError::Lagged(_)) => {
                    self.recover_lag().await?;
                }
                Err(broadcast::error::RecvError::Closed) => return Ok(None),
            }
        }
    }

    async fn recover_lag(&mut self) -> Result<(), WorkspaceJournalError> {
        let snapshot = self
            .journal
            .snapshot(self.scope.clone(), self.cursor, super::MAX_EVENT_PAGE_SIZE)
            .await?;
        self.install_snapshot(snapshot);
        Ok(())
    }

    async fn refill_replay(&mut self) -> Result<(), WorkspaceJournalError> {
        let events = self
            .journal
            .replay_page(self.scope.clone(), self.cursor, self.replay_until)
            .await?;
        if events.is_empty() {
            return Err(WorkspaceJournalError::ReplayUnavailable {
                after_id: self.cursor,
                through_id: self.replay_until,
            });
        }
        self.replay = VecDeque::from(events);
        Ok(())
    }

    fn install_snapshot(&mut self, snapshot: WorkspaceSnapshot) {
        self.replay = VecDeque::from(snapshot.events);
        self.replay_until = snapshot.latest_id.max(self.cursor);
    }
}

mod records;
mod subscription;

use std::error::Error;

use rusqlite::Connection;
use serde::Serialize;
use serde_json::{Map, Value};
use thiserror::Error;
use tokio::sync::{broadcast, mpsc, oneshot};

use super::database::DatabaseCommand;
use records::append_events;
use records::{append_event, count_since, read_replay_page, read_revision, read_snapshot};
pub(crate) use records::{
    append_event_in_transaction as append_workspace_event, read_revision as workspace_revision,
};
pub(crate) use subscription::WorkspaceSubscription;

const LIVE_EVENT_CAPACITY: usize = 1;
const MAX_EVENT_PAGE_SIZE: usize = 500;

pub(crate) type WorkspaceEventPayload = Map<String, Value>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceEvent {
    pub(crate) id: i64,
    pub(crate) kind: String,
    pub(crate) occurred_at: i64,
    pub(crate) payload: WorkspaceEventPayload,
    pub(crate) revision: i64,
    pub(crate) scope: String,
}

#[derive(Debug)]
pub(crate) struct WorkspaceSnapshot {
    pub(crate) events: Vec<WorkspaceEvent>,
    pub(crate) latest_id: i64,
    pub(crate) revision: i64,
}

#[derive(Clone)]
pub(crate) struct WorkspaceJournal {
    commands: mpsc::Sender<DatabaseCommand>,
}

pub(super) enum WorkspaceJournalCommand {
    Append {
        kind: String,
        payload: WorkspaceEventPayload,
        response: oneshot::Sender<Result<WorkspaceEvent, WorkspaceJournalError>>,
        scope: String,
    },
    AppendMany {
        events: Vec<(String, WorkspaceEventPayload)>,
        response: oneshot::Sender<Result<Vec<WorkspaceEvent>, WorkspaceJournalError>>,
        scope: String,
    },
    CountSince {
        occurred_after: i64,
        response: oneshot::Sender<Result<usize, WorkspaceJournalError>>,
        scope: String,
    },
    Revision {
        response: oneshot::Sender<Result<i64, WorkspaceJournalError>>,
        scope: String,
    },
    ReplayPage {
        after_id: i64,
        response: oneshot::Sender<Result<Vec<WorkspaceEvent>, WorkspaceJournalError>>,
        scope: String,
        through_id: i64,
    },
    Snapshot {
        after_id: i64,
        limit: usize,
        response: oneshot::Sender<Result<WorkspaceSnapshot, WorkspaceJournalError>>,
        scope: String,
    },
    Subscribe {
        after_id: i64,
        response: oneshot::Sender<Result<SubscriptionSeed, WorkspaceJournalError>>,
        scope: String,
    },
}

pub(super) struct WorkspaceJournalWorker {
    committed: broadcast::Sender<()>,
}

pub(super) struct SubscriptionSeed {
    committed: broadcast::Receiver<()>,
    snapshot: WorkspaceSnapshot,
}

#[derive(Debug, Error)]
pub(crate) enum WorkspaceJournalError {
    #[error("workspace_journal_invalid_payload")]
    InvalidPayload,
    #[error("workspace_event_insert_failed")]
    EventInsertFailed,
    #[error("workspace journal replay is unavailable after event {after_id} through {through_id}")]
    ReplayUnavailable { after_id: i64, through_id: i64 },
    #[error("workspace_revision_unavailable")]
    RevisionUnavailable,
    #[error("workspace journal storage failed")]
    Storage(#[source] Box<dyn Error + Send + Sync>),
    #[error("workspace journal worker is unavailable")]
    WorkerUnavailable,
}

impl WorkspaceJournal {
    pub(super) fn new(commands: mpsc::Sender<DatabaseCommand>) -> Self {
        Self { commands }
    }

    pub(crate) async fn append(
        &self,
        scope: String,
        kind: String,
        payload: WorkspaceEventPayload,
    ) -> Result<WorkspaceEvent, WorkspaceJournalError> {
        if !payload.values().all(is_payload_value) {
            return Err(WorkspaceJournalError::InvalidPayload);
        }
        let (response, result) = oneshot::channel();
        self.send(WorkspaceJournalCommand::Append {
            kind,
            payload,
            response,
            scope,
        })
        .await?;
        result
            .await
            .map_err(|_| WorkspaceJournalError::WorkerUnavailable)?
    }

    pub(crate) async fn count_since(
        &self,
        scope: String,
        occurred_after: i64,
    ) -> Result<usize, WorkspaceJournalError> {
        let (response, result) = oneshot::channel();
        self.send(WorkspaceJournalCommand::CountSince {
            occurred_after,
            response,
            scope,
        })
        .await?;
        result
            .await
            .map_err(|_| WorkspaceJournalError::WorkerUnavailable)?
    }

    pub(crate) async fn append_many(
        &self,
        scope: String,
        events: Vec<(String, WorkspaceEventPayload)>,
    ) -> Result<Vec<WorkspaceEvent>, WorkspaceJournalError> {
        if !events
            .iter()
            .all(|(_, payload)| payload.values().all(is_payload_value))
        {
            return Err(WorkspaceJournalError::InvalidPayload);
        }
        if events.is_empty() {
            return Ok(Vec::new());
        }
        let (response, result) = oneshot::channel();
        self.send(WorkspaceJournalCommand::AppendMany {
            events,
            response,
            scope,
        })
        .await?;
        result
            .await
            .map_err(|_| WorkspaceJournalError::WorkerUnavailable)?
    }

    pub(crate) async fn snapshot(
        &self,
        scope: String,
        after_id: i64,
        limit: usize,
    ) -> Result<WorkspaceSnapshot, WorkspaceJournalError> {
        let (response, result) = oneshot::channel();
        self.send(WorkspaceJournalCommand::Snapshot {
            after_id,
            limit: limit.clamp(1, MAX_EVENT_PAGE_SIZE),
            response,
            scope,
        })
        .await?;
        result
            .await
            .map_err(|_| WorkspaceJournalError::WorkerUnavailable)?
    }

    pub(crate) async fn revision(&self, scope: String) -> Result<i64, WorkspaceJournalError> {
        let (response, result) = oneshot::channel();
        self.send(WorkspaceJournalCommand::Revision { response, scope })
            .await?;
        result
            .await
            .map_err(|_| WorkspaceJournalError::WorkerUnavailable)?
    }

    pub(crate) async fn subscribe(
        &self,
        scope: String,
        after_id: i64,
    ) -> Result<WorkspaceSubscription, WorkspaceJournalError> {
        let (response, result) = oneshot::channel();
        self.send(WorkspaceJournalCommand::Subscribe {
            after_id,
            response,
            scope: scope.clone(),
        })
        .await?;
        let seed = result
            .await
            .map_err(|_| WorkspaceJournalError::WorkerUnavailable)??;
        Ok(WorkspaceSubscription::new(
            self.clone(),
            scope,
            after_id,
            seed,
        ))
    }

    async fn replay_page(
        &self,
        scope: String,
        after_id: i64,
        through_id: i64,
    ) -> Result<Vec<WorkspaceEvent>, WorkspaceJournalError> {
        let (response, result) = oneshot::channel();
        self.send(WorkspaceJournalCommand::ReplayPage {
            after_id,
            response,
            scope,
            through_id,
        })
        .await?;
        result
            .await
            .map_err(|_| WorkspaceJournalError::WorkerUnavailable)?
    }

    async fn send(&self, command: WorkspaceJournalCommand) -> Result<(), WorkspaceJournalError> {
        self.commands
            .send(DatabaseCommand::WorkspaceJournal(command))
            .await
            .map_err(|_| WorkspaceJournalError::WorkerUnavailable)
    }
}

impl WorkspaceJournalWorker {
    pub(super) fn new() -> Self {
        let (committed, receiver) = broadcast::channel(LIVE_EVENT_CAPACITY);
        drop(receiver);
        Self { committed }
    }

    pub(super) fn handle(&self, connection: &mut Connection, command: WorkspaceJournalCommand) {
        match command {
            WorkspaceJournalCommand::Append {
                kind,
                payload,
                response,
                scope,
            } => {
                let result = append_event(connection, scope, kind, payload);
                if result.is_ok() {
                    // Why: the worker publishes synchronously after commit and before replying, so
                    // commit order and live delivery order cannot diverge under executor scheduling.
                    self.notify_committed();
                }
                let _ = response.send(result);
            }
            WorkspaceJournalCommand::AppendMany {
                events,
                response,
                scope,
            } => {
                let result = append_events(connection, scope, events);
                if result.is_ok() {
                    self.notify_committed();
                }
                let _ = response.send(result);
            }
            WorkspaceJournalCommand::CountSince {
                occurred_after,
                response,
                scope,
            } => {
                let _ = response.send(count_since(connection, &scope, occurred_after));
            }
            WorkspaceJournalCommand::ReplayPage {
                after_id,
                response,
                scope,
                through_id,
            } => {
                let _ = response.send(read_replay_page(
                    connection,
                    &scope,
                    after_id,
                    through_id,
                    MAX_EVENT_PAGE_SIZE,
                ));
            }
            WorkspaceJournalCommand::Revision { response, scope } => {
                let _ = response.send(read_revision(connection, &scope));
            }
            WorkspaceJournalCommand::Snapshot {
                after_id,
                limit,
                response,
                scope,
            } => {
                let _ = response.send(read_snapshot(connection, &scope, after_id, limit));
            }
            WorkspaceJournalCommand::Subscribe {
                after_id,
                response,
                scope,
            } => {
                // Why: registering while the worker owns the command order guarantees that every
                // commit is either visible in the snapshot or queued for live delivery.
                let committed = self.committed.subscribe();
                let result = read_snapshot(connection, &scope, after_id, MAX_EVENT_PAGE_SIZE).map(
                    |snapshot| SubscriptionSeed {
                        committed,
                        snapshot,
                    },
                );
                let _ = response.send(result);
            }
        }
    }

    pub(super) fn notify_committed(&self) {
        let _ = self.committed.send(());
    }
}

impl WorkspaceJournalError {
    fn storage(source: impl Error + Send + Sync + 'static) -> Self {
        Self::Storage(Box::new(source))
    }
}

fn is_payload_value(value: &Value) -> bool {
    matches!(
        value,
        Value::Bool(_) | Value::Null | Value::Number(_) | Value::String(_)
    )
}

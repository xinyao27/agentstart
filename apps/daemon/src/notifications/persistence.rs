use std::time::{SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use rusqlite::{Connection, OptionalExtension};
use serde_json::Value;
use tokio::sync::{broadcast, oneshot};

use super::{
    MobileNotificationEvent, NotificationError, NotificationStore, REPLAY_CAPACITY,
    ReplayableNotification,
};

const LIVE_EVENT_CAPACITY: usize = 1;

pub(crate) enum NotificationCommand {
    Dispatch {
        event: MobileNotificationEvent,
        response: oneshot::Sender<Result<ReplayableNotification, NotificationError>>,
    },
    LatestSequence {
        response: oneshot::Sender<Result<i64, NotificationError>>,
    },
    MissedSince {
        last_seen_seq: i64,
        response: oneshot::Sender<Result<Vec<ReplayableNotification>, NotificationError>>,
    },
    SubscribeCommits {
        response: oneshot::Sender<broadcast::Receiver<()>>,
    },
}

pub(crate) struct NotificationRequest(NotificationCommand);

#[derive(Clone, Copy, Debug)]
pub(crate) struct NotificationMailboxClosed;

#[async_trait]
pub(crate) trait NotificationMailbox: Send + Sync {
    async fn submit(&self, request: NotificationRequest) -> Result<(), NotificationMailboxClosed>;
}

pub(crate) struct NotificationWorker {
    committed: broadcast::Sender<()>,
}

impl NotificationRequest {
    pub(crate) fn new(command: NotificationCommand) -> Self {
        Self(command)
    }
}

impl NotificationWorker {
    pub(crate) fn new() -> Self {
        let (committed, receiver) = broadcast::channel(LIVE_EVENT_CAPACITY);
        drop(receiver);
        Self { committed }
    }

    pub(crate) fn handle(&self, connection: &mut Connection, request: NotificationRequest) {
        match request.0 {
            NotificationCommand::Dispatch { event, response } => {
                let result = dispatch(connection, event);
                if result.is_ok() {
                    // Why: commit and wakeup share the database worker's serial order, so replay
                    // order cannot diverge from live subscription delivery order.
                    let _ = self.committed.send(());
                }
                let _ = response.send(result);
            }
            NotificationCommand::LatestSequence { response } => {
                let _ = response.send(latest_sequence(connection));
            }
            NotificationCommand::MissedSince {
                last_seen_seq,
                response,
            } => {
                let _ = response.send(missed_since(connection, last_seen_seq));
            }
            NotificationCommand::SubscribeCommits { response } => {
                let _ = response.send(self.committed.subscribe());
            }
        }
    }
}

impl NotificationStore {
    pub(super) async fn dispatch(
        &self,
        event: MobileNotificationEvent,
    ) -> Result<ReplayableNotification, NotificationError> {
        let (response, result) = oneshot::channel();
        self.submit(NotificationCommand::Dispatch { event, response })
            .await?;
        receive(result).await
    }

    pub(super) async fn latest_sequence(&self) -> Result<i64, NotificationError> {
        let (response, result) = oneshot::channel();
        self.submit(NotificationCommand::LatestSequence { response })
            .await?;
        receive(result).await
    }

    pub(super) async fn missed_since(
        &self,
        last_seen_seq: i64,
    ) -> Result<Vec<ReplayableNotification>, NotificationError> {
        let (response, result) = oneshot::channel();
        self.submit(NotificationCommand::MissedSince {
            last_seen_seq,
            response,
        })
        .await?;
        receive(result).await
    }

    pub(super) async fn subscribe_commits(
        &self,
    ) -> Result<broadcast::Receiver<()>, NotificationError> {
        let (response, result) = oneshot::channel();
        self.submit(NotificationCommand::SubscribeCommits { response })
            .await?;
        result
            .await
            .map_err(|_| NotificationError::WorkerUnavailable)
    }

    async fn submit(&self, command: NotificationCommand) -> Result<(), NotificationError> {
        self.mailbox
            .submit(NotificationRequest::new(command))
            .await
            .map_err(|_| NotificationError::WorkerUnavailable)
    }
}

fn dispatch(
    connection: &mut Connection,
    event: MobileNotificationEvent,
) -> Result<ReplayableNotification, NotificationError> {
    let payload = serde_json::to_string(&event).map_err(NotificationError::storage)?;
    let occurred_at = i64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())
        .map_err(NotificationError::storage)?;
    let transaction = connection
        .transaction()
        .map_err(NotificationError::storage)?;
    let notification_seq = transaction
        .query_row(
            "INSERT INTO mobile_notification(payload, occurred_at)
             VALUES (?1, ?2)
             RETURNING id",
            rusqlite::params![payload, occurred_at],
            |row| row.get(0),
        )
        .optional()
        .map_err(NotificationError::storage)?
        .ok_or(NotificationError::InsertFailed)?;
    transaction
        .execute(
            "DELETE FROM mobile_notification
             WHERE id <= (SELECT COALESCE(MAX(id), 0) - ?1 FROM mobile_notification)",
            [i64::try_from(REPLAY_CAPACITY).expect("replay capacity fits i64")],
        )
        .map_err(NotificationError::storage)?;
    transaction.commit().map_err(NotificationError::storage)?;
    Ok(ReplayableNotification {
        event,
        notification_seq,
    })
}

fn latest_sequence(connection: &Connection) -> Result<i64, NotificationError> {
    connection
        .query_row(
            "SELECT COALESCE(MAX(id), 0) FROM mobile_notification",
            [],
            |row| row.get(0),
        )
        .map_err(NotificationError::storage)
}

fn missed_since(
    connection: &Connection,
    last_seen_seq: i64,
) -> Result<Vec<ReplayableNotification>, NotificationError> {
    let mut statement = connection
        .prepare(
            "SELECT id, payload FROM mobile_notification
             WHERE id > ?1 ORDER BY id ASC LIMIT ?2",
        )
        .map_err(NotificationError::storage)?;
    let rows = statement
        .query_map(
            rusqlite::params![
                last_seen_seq,
                i64::try_from(REPLAY_CAPACITY).expect("replay capacity fits i64")
            ],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(NotificationError::storage)?;
    let mut notifications = Vec::new();
    for row in rows {
        let (notification_seq, payload) = row.map_err(NotificationError::storage)?;
        if let Some(notification) = read_notification(notification_seq, &payload) {
            notifications.push(notification);
        }
    }
    Ok(notifications)
}

fn read_notification(notification_seq: i64, payload: &str) -> Option<ReplayableNotification> {
    let value = serde_json::from_str::<Value>(payload).ok()?;
    let object = value.as_object()?;
    let event = match object.get("type").and_then(Value::as_str)? {
        "dismiss" => MobileNotificationEvent::Dismiss {
            notification_id: object.get("notificationId")?.as_str()?.to_owned(),
        },
        "notification" => MobileNotificationEvent::Notification {
            body: object.get("body")?.as_str()?.to_owned(),
            notification_id: optional_stored_string(object.get("notificationId")),
            source: super::NotificationSource::from_wire(object.get("source")?.as_str()?)?,
            title: object.get("title")?.as_str()?.to_owned(),
            worktree_id: optional_stored_string(object.get("worktreeId")),
        },
        _ => return None,
    };
    Some(ReplayableNotification {
        event,
        notification_seq,
    })
}

fn optional_stored_string(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(str::to_owned)
}

async fn receive<T>(
    result: oneshot::Receiver<Result<T, NotificationError>>,
) -> Result<T, NotificationError> {
    result
        .await
        .map_err(|_| NotificationError::WorkerUnavailable)?
}

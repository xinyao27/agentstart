mod model;
mod records;

use std::sync::Arc;

use async_trait::async_trait;
use rusqlite::Connection;
use thiserror::Error;
use tokio::sync::oneshot;

pub(crate) use model::{HostMutation, HostRecord, HostSnapshot, RegisteredHostKind};

#[derive(Clone)]
pub(crate) struct HostStore {
    mailbox: Arc<dyn HostStoreMailbox>,
}

enum HostStoreCommand {
    Add {
        expected_revision: i64,
        host: HostRecord,
        response: oneshot::Sender<Result<HostMutation, HostStoreError>>,
    },
    Find {
        id: String,
        response: oneshot::Sender<Result<HostRecord, HostStoreError>>,
    },
    Remove {
        expected_revision: i64,
        host_id: String,
        response: oneshot::Sender<Result<HostMutation, HostStoreError>>,
    },
    Snapshot {
        response: oneshot::Sender<Result<HostSnapshot, HostStoreError>>,
    },
}

pub(crate) struct HostStoreRequest(HostStoreCommand);

pub(crate) struct HostStoreWorker;

#[derive(Clone, Copy, Debug)]
pub(crate) struct HostStoreMailboxClosed;

#[async_trait]
pub(crate) trait HostStoreMailbox: Send + Sync {
    async fn submit(&self, request: HostStoreRequest) -> Result<(), HostStoreMailboxClosed>;
}

#[derive(Debug, Error)]
pub(crate) enum HostStoreError {
    #[error("host_has_projects")]
    HasProjects,
    #[error("host_not_found")]
    NotFound,
    #[error("host store serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("host store SQLite operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("host store clock failed: {0}")]
    Clock(#[from] std::time::SystemTimeError),
    #[error("workspace revision conflict")]
    RevisionConflict {
        actual_revision: i64,
        expected_revision: i64,
        scope: &'static str,
    },
    #[error("workspace revision is unavailable")]
    RevisionUnavailable,
    #[error("host store worker is unavailable")]
    WorkerUnavailable,
}

impl HostStore {
    pub(crate) fn new(mailbox: Arc<dyn HostStoreMailbox>) -> Self {
        Self { mailbox }
    }

    pub(crate) async fn snapshot(&self) -> Result<HostSnapshot, HostStoreError> {
        let (response, result) = oneshot::channel();
        self.send(HostStoreCommand::Snapshot { response }).await?;
        receive(result).await
    }

    pub(crate) async fn find(&self, id: String) -> Result<HostRecord, HostStoreError> {
        let (response, result) = oneshot::channel();
        self.send(HostStoreCommand::Find { id, response }).await?;
        receive(result).await
    }

    pub(crate) async fn add(
        &self,
        expected_revision: i64,
        host: HostRecord,
    ) -> Result<HostMutation, HostStoreError> {
        let (response, result) = oneshot::channel();
        self.send(HostStoreCommand::Add {
            expected_revision,
            host,
            response,
        })
        .await?;
        receive(result).await
    }

    pub(crate) async fn remove(
        &self,
        expected_revision: i64,
        host_id: String,
    ) -> Result<HostMutation, HostStoreError> {
        let (response, result) = oneshot::channel();
        self.send(HostStoreCommand::Remove {
            expected_revision,
            host_id,
            response,
        })
        .await?;
        receive(result).await
    }

    async fn send(&self, command: HostStoreCommand) -> Result<(), HostStoreError> {
        self.mailbox
            .submit(HostStoreRequest(command))
            .await
            .map_err(|_| HostStoreError::WorkerUnavailable)
    }
}

impl HostStoreWorker {
    pub(crate) fn handle(
        &self,
        connection: &mut Connection,
        request: HostStoreRequest,
        notify_commit: impl Fn(),
    ) {
        match request.0 {
            HostStoreCommand::Add {
                expected_revision,
                host,
                response,
            } => {
                let result = records::add(connection, expected_revision, host);
                if result.is_ok() {
                    notify_commit();
                }
                let _ = response.send(result);
            }
            HostStoreCommand::Find { id, response } => {
                let _ = response.send(records::find(connection, &id));
            }
            HostStoreCommand::Remove {
                expected_revision,
                host_id,
                response,
            } => {
                let result = records::remove(connection, expected_revision, &host_id);
                if result.is_ok() {
                    notify_commit();
                }
                let _ = response.send(result);
            }
            HostStoreCommand::Snapshot { response } => {
                let _ = response.send(records::snapshot(connection));
            }
        }
    }
}

async fn receive<T>(
    result: oneshot::Receiver<Result<T, HostStoreError>>,
) -> Result<T, HostStoreError> {
    result
        .await
        .map_err(|_| HostStoreError::WorkerUnavailable)?
}

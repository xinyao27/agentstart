use std::error::Error;
use std::sync::Arc;

use async_trait::async_trait;
use rusqlite::Connection;
use serde::Serialize;
use thiserror::Error;
use tokio::sync::oneshot;

use super::records;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorktreeArchive {
    pub(crate) branch: String,
    pub(crate) created_at: i64,
    pub(crate) failure_detail: Option<String>,
    pub(crate) head: String,
    pub(crate) id: String,
    pub(crate) original_worktree_id: String,
    pub(crate) path: String,
    pub(crate) repo_id: String,
    pub(crate) restored_at: Option<i64>,
    pub(crate) stash_oid: Option<String>,
    pub(crate) status: String,
}

#[derive(Clone)]
pub(crate) struct WorktreeArchiveStore {
    mailbox: Arc<dyn WorktreeArchiveMailbox>,
}

pub(crate) struct BeginArchive {
    pub(crate) branch: String,
    pub(crate) head: String,
    pub(crate) original_worktree_id: String,
    pub(crate) path: String,
    pub(crate) storage_repo_id: String,
}

enum WorktreeArchiveCommand {
    Begin {
        input: BeginArchive,
        response: oneshot::Sender<Result<WorktreeArchive, WorktreeArchiveError>>,
    },
    Complete {
        id: String,
        stash_oid: Option<String>,
        response: oneshot::Sender<Result<WorktreeArchive, WorktreeArchiveError>>,
    },
    Fail {
        detail: String,
        id: String,
        response: oneshot::Sender<Result<WorktreeArchive, WorktreeArchiveError>>,
    },
    Get {
        id: String,
        response: oneshot::Sender<Result<WorktreeArchive, WorktreeArchiveError>>,
    },
    List {
        storage_repo_id: Option<String>,
        response: oneshot::Sender<Result<Vec<WorktreeArchive>, WorktreeArchiveError>>,
    },
    Preserve {
        id: String,
        stash_oid: Option<String>,
        response: oneshot::Sender<Result<WorktreeArchive, WorktreeArchiveError>>,
    },
    Restored {
        id: String,
        response: oneshot::Sender<Result<WorktreeArchive, WorktreeArchiveError>>,
    },
}

pub(crate) struct WorktreeArchiveRequest(WorktreeArchiveCommand);

pub(crate) struct WorktreeArchiveWorker;

#[derive(Clone, Copy, Debug)]
pub(crate) struct WorktreeArchiveMailboxClosed;

#[derive(Debug, Error)]
pub(crate) enum WorktreeArchiveError {
    #[error("worktree_archive_not_found")]
    NotFound,
    #[error("worktree archive storage failed")]
    Storage(#[source] Box<dyn Error + Send + Sync>),
    #[error("worktree archive worker is unavailable")]
    WorkerUnavailable,
}

#[async_trait]
pub(crate) trait WorktreeArchiveMailbox: Send + Sync {
    async fn submit(
        &self,
        request: WorktreeArchiveRequest,
    ) -> Result<(), WorktreeArchiveMailboxClosed>;
}

impl WorktreeArchiveStore {
    pub(crate) fn new(mailbox: Arc<dyn WorktreeArchiveMailbox>) -> Self {
        Self { mailbox }
    }

    pub(crate) async fn begin(
        &self,
        input: BeginArchive,
    ) -> Result<WorktreeArchive, WorktreeArchiveError> {
        let (response, result) = oneshot::channel();
        self.send(WorktreeArchiveCommand::Begin { input, response })
            .await?;
        receive(result).await
    }

    pub(crate) async fn complete(
        &self,
        id: String,
        stash_oid: Option<String>,
    ) -> Result<WorktreeArchive, WorktreeArchiveError> {
        let (response, result) = oneshot::channel();
        self.send(WorktreeArchiveCommand::Complete {
            id,
            stash_oid,
            response,
        })
        .await?;
        receive(result).await
    }

    pub(crate) async fn fail(
        &self,
        id: String,
        detail: String,
    ) -> Result<WorktreeArchive, WorktreeArchiveError> {
        let (response, result) = oneshot::channel();
        self.send(WorktreeArchiveCommand::Fail {
            detail,
            id,
            response,
        })
        .await?;
        receive(result).await
    }

    pub(crate) async fn get(&self, id: String) -> Result<WorktreeArchive, WorktreeArchiveError> {
        let (response, result) = oneshot::channel();
        self.send(WorktreeArchiveCommand::Get { id, response })
            .await?;
        receive(result).await
    }

    pub(crate) async fn list(
        &self,
        storage_repo_id: Option<String>,
    ) -> Result<Vec<WorktreeArchive>, WorktreeArchiveError> {
        let (response, result) = oneshot::channel();
        self.send(WorktreeArchiveCommand::List {
            storage_repo_id,
            response,
        })
        .await?;
        receive(result).await
    }

    pub(crate) async fn preserve(
        &self,
        id: String,
        stash_oid: Option<String>,
    ) -> Result<WorktreeArchive, WorktreeArchiveError> {
        let (response, result) = oneshot::channel();
        self.send(WorktreeArchiveCommand::Preserve {
            id,
            stash_oid,
            response,
        })
        .await?;
        receive(result).await
    }

    pub(crate) async fn restored(
        &self,
        id: String,
    ) -> Result<WorktreeArchive, WorktreeArchiveError> {
        let (response, result) = oneshot::channel();
        self.send(WorktreeArchiveCommand::Restored { id, response })
            .await?;
        receive(result).await
    }

    async fn send(&self, command: WorktreeArchiveCommand) -> Result<(), WorktreeArchiveError> {
        self.mailbox
            .submit(WorktreeArchiveRequest(command))
            .await
            .map_err(|_| WorktreeArchiveError::WorkerUnavailable)
    }
}

impl WorktreeArchiveWorker {
    pub(crate) fn handle(&self, connection: &mut Connection, request: WorktreeArchiveRequest) {
        match request.0 {
            WorktreeArchiveCommand::Begin { input, response } => {
                let _ = response.send(records::begin(connection, input));
            }
            WorktreeArchiveCommand::Complete {
                id,
                stash_oid,
                response,
            } => {
                let _ = response.send(records::complete(connection, &id, stash_oid.as_deref()));
            }
            WorktreeArchiveCommand::Fail {
                detail,
                id,
                response,
            } => {
                let _ = response.send(records::fail(connection, &id, &detail));
            }
            WorktreeArchiveCommand::Get { id, response } => {
                let _ = response.send(records::get(connection, &id));
            }
            WorktreeArchiveCommand::List {
                storage_repo_id,
                response,
            } => {
                let _ = response.send(records::list(connection, storage_repo_id.as_deref()));
            }
            WorktreeArchiveCommand::Preserve {
                id,
                stash_oid,
                response,
            } => {
                let _ = response.send(records::preserve(connection, &id, stash_oid.as_deref()));
            }
            WorktreeArchiveCommand::Restored { id, response } => {
                let _ = response.send(records::restored(connection, &id));
            }
        }
    }
}

impl WorktreeArchiveError {
    pub(super) fn storage(source: impl Error + Send + Sync + 'static) -> Self {
        Self::Storage(Box::new(source))
    }
}

async fn receive<T>(
    result: oneshot::Receiver<Result<T, WorktreeArchiveError>>,
) -> Result<T, WorktreeArchiveError> {
    result
        .await
        .map_err(|_| WorktreeArchiveError::WorkerUnavailable)?
}

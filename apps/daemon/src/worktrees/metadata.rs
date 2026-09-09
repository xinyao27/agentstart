use std::error::Error;
use std::sync::Arc;

use async_trait::async_trait;
use rusqlite::Connection;
use serde_json::{Map, Value};
use thiserror::Error;
use tokio::sync::oneshot;

use super::records;

#[derive(Clone, Debug)]
pub(crate) struct WorktreeMetadata {
    pub(crate) display_name: String,
    pub(crate) host_id: Option<String>,
    pub(crate) id: String,
    pub(crate) metadata: Map<String, Value>,
    pub(crate) path: String,
}

#[derive(Clone, Debug)]
pub(crate) struct WorkbenchWorktreeMetadata {
    pub(crate) display_name: String,
    pub(crate) host_id: Option<String>,
    pub(crate) id: String,
    pub(crate) metadata: Map<String, Value>,
    pub(crate) path: String,
    pub(crate) project_id: String,
    pub(crate) updated_at: i64,
}

#[derive(Clone)]
pub(crate) struct WorktreeMetadataStore {
    mailbox: Arc<dyn WorktreeMetadataMailbox>,
}

enum WorktreeMetadataCommand {
    List {
        storage_project_id: String,
        response: oneshot::Sender<Result<Vec<WorktreeMetadata>, WorktreeMetadataError>>,
    },
    Patch {
        display_name: String,
        host_id: String,
        path: String,
        storage_project_id: String,
        worktree_id: String,
        patch: Map<String, Value>,
        response: oneshot::Sender<Result<WorktreeMetadata, WorktreeMetadataError>>,
    },
    Remove {
        storage_project_id: String,
        worktree_id: String,
        response: oneshot::Sender<Result<bool, WorktreeMetadataError>>,
    },
    Reorder {
        ordered_ids: Vec<String>,
        response: oneshot::Sender<Result<usize, WorktreeMetadataError>>,
    },
}

pub(crate) struct WorktreeMetadataRequest(WorktreeMetadataCommand);

pub(crate) struct WorktreeMetadataWorker;

#[derive(Clone, Copy, Debug)]
pub(crate) struct WorktreeMetadataMailboxClosed;

#[derive(Debug, Error)]
pub(crate) enum WorktreeMetadataError {
    #[error("worktree metadata storage failed")]
    Storage(#[source] Box<dyn Error + Send + Sync>),
    #[error("worktree metadata worker is unavailable")]
    WorkerUnavailable,
}

#[async_trait]
pub(crate) trait WorktreeMetadataMailbox: Send + Sync {
    async fn submit(
        &self,
        request: WorktreeMetadataRequest,
    ) -> Result<(), WorktreeMetadataMailboxClosed>;
}

impl WorktreeMetadataStore {
    pub(crate) fn new(mailbox: Arc<dyn WorktreeMetadataMailbox>) -> Self {
        Self { mailbox }
    }

    pub(crate) async fn list(
        &self,
        storage_project_id: String,
    ) -> Result<Vec<WorktreeMetadata>, WorktreeMetadataError> {
        let (response, result) = oneshot::channel();
        self.send(WorktreeMetadataCommand::List {
            storage_project_id,
            response,
        })
        .await?;
        receive(result).await
    }

    pub(crate) async fn patch(
        &self,
        display_name: String,
        host_id: String,
        path: String,
        storage_project_id: String,
        worktree_id: String,
        patch: Map<String, Value>,
    ) -> Result<WorktreeMetadata, WorktreeMetadataError> {
        let (response, result) = oneshot::channel();
        self.send(WorktreeMetadataCommand::Patch {
            display_name,
            host_id,
            path,
            storage_project_id,
            worktree_id,
            patch,
            response,
        })
        .await?;
        receive(result).await
    }

    pub(crate) async fn reorder(
        &self,
        ordered_ids: Vec<String>,
    ) -> Result<usize, WorktreeMetadataError> {
        let (response, result) = oneshot::channel();
        self.send(WorktreeMetadataCommand::Reorder {
            ordered_ids,
            response,
        })
        .await?;
        receive(result).await
    }

    pub(crate) async fn remove(
        &self,
        storage_project_id: String,
        worktree_id: String,
    ) -> Result<bool, WorktreeMetadataError> {
        let (response, result) = oneshot::channel();
        self.send(WorktreeMetadataCommand::Remove {
            storage_project_id,
            worktree_id,
            response,
        })
        .await?;
        receive(result).await
    }

    async fn send(&self, command: WorktreeMetadataCommand) -> Result<(), WorktreeMetadataError> {
        self.mailbox
            .submit(WorktreeMetadataRequest(command))
            .await
            .map_err(|_| WorktreeMetadataError::WorkerUnavailable)
    }
}

impl WorktreeMetadataWorker {
    pub(crate) fn handle(&self, connection: &mut Connection, request: WorktreeMetadataRequest) {
        match request.0 {
            WorktreeMetadataCommand::List {
                storage_project_id,
                response,
            } => {
                let _ = response.send(records::list(connection, &storage_project_id));
            }
            WorktreeMetadataCommand::Patch {
                display_name,
                host_id,
                path,
                storage_project_id,
                worktree_id,
                patch,
                response,
            } => {
                let _ = response.send(records::patch(
                    connection,
                    &display_name,
                    &host_id,
                    &path,
                    &storage_project_id,
                    &worktree_id,
                    patch,
                ));
            }
            WorktreeMetadataCommand::Reorder {
                ordered_ids,
                response,
            } => {
                let _ = response.send(records::reorder(connection, &ordered_ids));
            }
            WorktreeMetadataCommand::Remove {
                storage_project_id,
                worktree_id,
                response,
            } => {
                let _ = response.send(records::remove(
                    connection,
                    &storage_project_id,
                    &worktree_id,
                ));
            }
        }
    }
}

impl WorktreeMetadataError {
    pub(super) fn storage(source: impl Error + Send + Sync + 'static) -> Self {
        Self::Storage(Box::new(source))
    }
}

async fn receive<T>(
    result: oneshot::Receiver<Result<T, WorktreeMetadataError>>,
) -> Result<T, WorktreeMetadataError> {
    result
        .await
        .map_err(|_| WorktreeMetadataError::WorkerUnavailable)?
}

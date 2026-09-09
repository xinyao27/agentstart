mod records;

use std::error::Error;
use std::time::SystemTimeError;

use rusqlite::Connection;
use serde::Serialize;
use thiserror::Error;
use tokio::sync::{mpsc, oneshot};

use super::database::DatabaseCommand;

const DEFAULT_LIST_LIMIT: usize = 20;
const MAX_LIST_LIMIT: usize = 100;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrowserReplay {
    pub(crate) created_at: i64,
    pub(crate) ended_at: f64,
    pub(crate) events: Vec<BrowserReplayEvent>,
    pub(crate) id: String,
    pub(crate) page_title: String,
    pub(crate) page_url: String,
    pub(crate) project_id: String,
    pub(crate) started_at: f64,
    pub(crate) video_artifact_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrowserReplayEvent {
    pub(crate) at: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) key: Option<String>,
    pub(crate) kind: BrowserReplayEventKind,
    pub(crate) selector: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) value: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum BrowserReplayEventKind {
    Click,
    Input,
    Keydown,
}

pub(crate) struct BrowserReplaySave {
    pub(crate) ended_at: f64,
    pub(crate) events: Vec<BrowserReplayEvent>,
    pub(crate) page_title: String,
    pub(crate) page_url: String,
    pub(crate) project_id: String,
    pub(crate) started_at: f64,
    pub(crate) video_artifact_id: Option<String>,
}

#[derive(Clone)]
pub(crate) struct BrowserReplayStore {
    commands: mpsc::Sender<DatabaseCommand>,
}

pub(super) enum BrowserReplayCommand {
    Find {
        id: String,
        response: oneshot::Sender<Result<Option<BrowserReplay>, BrowserReplayStoreError>>,
    },
    List {
        limit: usize,
        project_id: String,
        response: oneshot::Sender<Result<Vec<BrowserReplay>, BrowserReplayStoreError>>,
    },
    Save {
        input: BrowserReplaySave,
        response: oneshot::Sender<Result<BrowserReplay, BrowserReplayStoreError>>,
    },
}

pub(super) struct BrowserReplayStoreWorker;

#[derive(Debug, Error)]
pub(crate) enum BrowserReplayStoreError {
    #[error("browser replay clock failed: {0}")]
    Clock(#[from] SystemTimeError),
    #[error("browser replay random identifier generation failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("browser replay storage failed")]
    Storage(#[source] Box<dyn Error + Send + Sync>),
    #[error("browser replay worker is unavailable")]
    WorkerUnavailable,
}

impl BrowserReplayStore {
    pub(super) fn new(commands: mpsc::Sender<DatabaseCommand>) -> Self {
        Self { commands }
    }

    pub(crate) async fn find(
        &self,
        id: String,
    ) -> Result<Option<BrowserReplay>, BrowserReplayStoreError> {
        let (response, result) = oneshot::channel();
        self.send(BrowserReplayCommand::Find { id, response })
            .await?;
        result
            .await
            .map_err(|_| BrowserReplayStoreError::WorkerUnavailable)?
    }

    pub(crate) async fn list(
        &self,
        project_id: String,
        limit: Option<usize>,
    ) -> Result<Vec<BrowserReplay>, BrowserReplayStoreError> {
        let (response, result) = oneshot::channel();
        self.send(BrowserReplayCommand::List {
            limit: limit.unwrap_or(DEFAULT_LIST_LIMIT).clamp(1, MAX_LIST_LIMIT),
            project_id,
            response,
        })
        .await?;
        result
            .await
            .map_err(|_| BrowserReplayStoreError::WorkerUnavailable)?
    }

    pub(crate) async fn save(
        &self,
        input: BrowserReplaySave,
    ) -> Result<BrowserReplay, BrowserReplayStoreError> {
        let (response, result) = oneshot::channel();
        self.send(BrowserReplayCommand::Save { input, response })
            .await?;
        result
            .await
            .map_err(|_| BrowserReplayStoreError::WorkerUnavailable)?
    }

    async fn send(&self, command: BrowserReplayCommand) -> Result<(), BrowserReplayStoreError> {
        self.commands
            .send(DatabaseCommand::BrowserReplay(command))
            .await
            .map_err(|_| BrowserReplayStoreError::WorkerUnavailable)
    }
}

impl BrowserReplayStoreWorker {
    pub(super) fn handle(&self, connection: &Connection, command: BrowserReplayCommand) {
        match command {
            BrowserReplayCommand::Find { id, response } => {
                let _ = response.send(records::find(connection, &id));
            }
            BrowserReplayCommand::List {
                limit,
                project_id,
                response,
            } => {
                let _ = response.send(records::list(connection, &project_id, limit));
            }
            BrowserReplayCommand::Save { input, response } => {
                let _ = response.send(records::save(connection, input));
            }
        }
    }
}

impl BrowserReplayStoreError {
    fn storage(source: impl Error + Send + Sync + 'static) -> Self {
        Self::Storage(Box::new(source))
    }
}

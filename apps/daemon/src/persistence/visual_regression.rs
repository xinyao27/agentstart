mod legacy;
mod records;

use std::error::Error;
use std::path::PathBuf;
use std::time::SystemTimeError;

use rusqlite::Connection;
use serde::Serialize;
use thiserror::Error;
use tokio::sync::{Mutex, mpsc, oneshot};

use super::database::DatabaseCommand;
use super::{ArtifactStore, ArtifactStoreError};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VisualRegressionCapture {
    pub(crate) created_at: i64,
    pub(crate) diff_ratio: Option<f64>,
    pub(crate) height: i64,
    pub(crate) id: String,
    pub(crate) image_artifact_id: String,
    pub(crate) page_url: String,
    pub(crate) project_id: String,
    pub(crate) width: i64,
    pub(crate) worktree_id: String,
}

pub(crate) struct VisualRegressionSave {
    pub(crate) diff_ratio: Option<f64>,
    pub(crate) height: i64,
    pub(crate) image_artifact_id: String,
    pub(crate) page_url: String,
    pub(crate) project_id: String,
    pub(crate) width: i64,
    pub(crate) worktree_id: String,
}

#[derive(Clone)]
pub(crate) struct VisualRegressionStore {
    artifacts: ArtifactStore,
    captures_path: PathBuf,
    commands: mpsc::Sender<DatabaseCommand>,
    operation: std::sync::Arc<Mutex<()>>,
}

pub(super) enum VisualRegressionCommand {
    BindArtifact {
        capture_id: String,
        image_artifact_id: String,
        response: oneshot::Sender<Result<(), VisualRegressionStoreError>>,
    },
    Latest {
        project_id: String,
        response:
            oneshot::Sender<Result<Option<VisualRegressionCaptureRow>, VisualRegressionStoreError>>,
        worktree_id: String,
    },
    Save {
        input: VisualRegressionSave,
        response: oneshot::Sender<Result<VisualRegressionCapture, VisualRegressionStoreError>>,
    },
}

pub(super) struct VisualRegressionStoreWorker;

pub(super) struct VisualRegressionCaptureRow {
    pub(super) created_at: i64,
    pub(super) diff_ratio: Option<f64>,
    pub(super) height: i64,
    pub(super) id: String,
    pub(super) image_artifact_id: Option<String>,
    pub(super) page_url: String,
    pub(super) project_id: String,
    pub(super) width: i64,
    pub(super) worktree_id: String,
}

#[derive(Debug, Error)]
pub(crate) enum VisualRegressionStoreError {
    #[error("visual_capture_artifact_invalid")]
    ArtifactInvalid,
    #[error(transparent)]
    ArtifactStore(#[from] ArtifactStoreError),
    #[error("visual regression clock failed: {0}")]
    Clock(#[from] SystemTimeError),
    #[error("visual capture legacy file task failed: {0}")]
    LegacyFileTask(#[from] tokio::task::JoinError),
    #[error("visual_capture_legacy_file_invalid")]
    LegacyFileInvalid,
    #[error("visual capture legacy file I/O failed: {0}")]
    LegacyFileIo(#[source] std::io::Error),
    #[error("visual_capture_legacy_file_missing")]
    LegacyFileMissing,
    #[error("visual regression random identifier generation failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("visual regression storage failed")]
    Storage(#[source] Box<dyn Error + Send + Sync>),
    #[error("visual regression worker is unavailable")]
    WorkerUnavailable,
}

impl VisualRegressionStore {
    pub(super) fn new(
        commands: mpsc::Sender<DatabaseCommand>,
        captures_path: PathBuf,
        artifacts: ArtifactStore,
    ) -> Self {
        Self {
            artifacts,
            captures_path,
            commands,
            operation: std::sync::Arc::new(Mutex::new(())),
        }
    }

    fn legacy_path(&self, capture_id: &str) -> PathBuf {
        self.captures_path.join(format!("{capture_id}.png"))
    }

    pub(crate) async fn latest(
        &self,
        project_id: String,
        worktree_id: String,
    ) -> Result<Option<VisualRegressionCapture>, VisualRegressionStoreError> {
        let _operation = self.operation.lock().await;
        let (response, result) = oneshot::channel();
        self.send(VisualRegressionCommand::Latest {
            project_id,
            response,
            worktree_id,
        })
        .await?;
        let row = result
            .await
            .map_err(|_| VisualRegressionStoreError::WorkerUnavailable)??;
        match row {
            Some(row) => legacy::hydrate_capture(&self.artifacts, self, row)
                .await
                .map(Some),
            None => Ok(None),
        }
    }

    pub(crate) async fn save(
        &self,
        input: VisualRegressionSave,
    ) -> Result<VisualRegressionCapture, VisualRegressionStoreError> {
        let _operation = self.operation.lock().await;
        let ready = self
            .artifacts
            .ready_file(input.image_artifact_id.clone())
            .await?;
        if ready.as_ref().is_none_or(|ready| {
            ready.artifact.project_id != input.project_id || ready.artifact.mime_type != "image/png"
        }) {
            return Err(VisualRegressionStoreError::ArtifactInvalid);
        }
        let (response, result) = oneshot::channel();
        self.send(VisualRegressionCommand::Save { input, response })
            .await?;
        result
            .await
            .map_err(|_| VisualRegressionStoreError::WorkerUnavailable)?
    }

    async fn bind_artifact(
        &self,
        capture_id: String,
        image_artifact_id: String,
    ) -> Result<(), VisualRegressionStoreError> {
        let (response, result) = oneshot::channel();
        self.send(VisualRegressionCommand::BindArtifact {
            capture_id,
            image_artifact_id,
            response,
        })
        .await?;
        result
            .await
            .map_err(|_| VisualRegressionStoreError::WorkerUnavailable)?
    }

    async fn send(
        &self,
        command: VisualRegressionCommand,
    ) -> Result<(), VisualRegressionStoreError> {
        self.commands
            .send(DatabaseCommand::VisualRegression(command))
            .await
            .map_err(|_| VisualRegressionStoreError::WorkerUnavailable)
    }
}

impl VisualRegressionStoreWorker {
    pub(super) fn handle(&self, connection: &Connection, command: VisualRegressionCommand) {
        match command {
            VisualRegressionCommand::BindArtifact {
                capture_id,
                image_artifact_id,
                response,
            } => {
                let _ = response.send(records::bind_artifact(
                    connection,
                    &capture_id,
                    &image_artifact_id,
                ));
            }
            VisualRegressionCommand::Latest {
                project_id,
                response,
                worktree_id,
            } => {
                let _ = response.send(records::latest(connection, &project_id, &worktree_id));
            }
            VisualRegressionCommand::Save { input, response } => {
                let _ = response.send(records::save(connection, input));
            }
        }
    }
}

impl VisualRegressionCaptureRow {
    fn with_artifact(self, image_artifact_id: String) -> VisualRegressionCapture {
        VisualRegressionCapture {
            created_at: self.created_at,
            diff_ratio: self.diff_ratio,
            height: self.height,
            id: self.id,
            image_artifact_id,
            page_url: self.page_url,
            project_id: self.project_id,
            width: self.width,
            worktree_id: self.worktree_id,
        }
    }
}

impl VisualRegressionStoreError {
    fn storage(source: impl Error + Send + Sync + 'static) -> Self {
        Self::Storage(Box::new(source))
    }
}

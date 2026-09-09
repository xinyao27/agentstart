mod access;
mod actor;
mod download;
mod files;
mod records;
mod tickets;
mod write;

use std::collections::HashMap;
use std::error::Error;
use std::io;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, SystemTimeError, UNIX_EPOCH};

use serde::Serialize;
use thiserror::Error;
use tokio::sync::{Mutex, mpsc, oneshot};

use super::database::DatabaseCommand;
pub(super) use actor::{ArtifactStoreCommand, ArtifactStoreWorker};

const MAX_ARTIFACT_BYTES: i64 = 100 * 1_024 * 1_024;
const MAX_CHUNK_BYTES: usize = 512 * 1_024;
const DOWNLOAD_TICKET_TTL_MS: i64 = 5 * 60_000;
const MAX_DOWNLOAD_TICKETS: usize = 1_024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Artifact {
    pub(crate) byte_length: i64,
    pub(crate) created_at: i64,
    pub(crate) file_name: String,
    pub(crate) id: String,
    pub(crate) mime_type: String,
    pub(crate) project_id: String,
    pub(crate) status: ArtifactStatus,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ArtifactStatus {
    Ready,
    Writing,
}

pub(crate) struct ArtifactBegin {
    pub(crate) file_name: String,
    pub(crate) mime_type: String,
    pub(crate) project_id: String,
}

#[derive(Clone, Debug)]
pub(crate) struct ReadyArtifactFile {
    pub(crate) artifact: Artifact,
    pub(crate) path: PathBuf,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArtifactRead {
    pub(crate) data_base64: String,
    pub(crate) eof: bool,
    pub(crate) mime_type: String,
    pub(crate) next_offset: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArtifactDownloadTicket {
    pub(crate) expires_at: i64,
    pub(crate) ticket: String,
}

#[derive(Debug)]
pub(crate) struct ArtifactDownload {
    pub(crate) byte_length: i64,
    pub(crate) content_disposition: String,
    pub(crate) mime_type: String,
    pub(crate) path: PathBuf,
}

#[derive(Clone)]
pub(crate) struct ArtifactStore {
    commands: mpsc::Sender<DatabaseCommand>,
    directory: PathBuf,
    state: Arc<Mutex<ArtifactState>>,
}

struct ArtifactState {
    download_tickets: HashMap<String, DownloadTicketEntry>,
    is_initialized: bool,
}

struct DownloadTicketEntry {
    artifact_id: String,
    expires_at: i64,
}

#[derive(Debug, Error)]
pub(crate) enum ArtifactStoreError {
    #[error("artifact_append_offset_conflict")]
    AppendOffsetConflict,
    #[error("artifact_base64_invalid")]
    Base64Invalid,
    #[error("artifact_byte_length_mismatch")]
    ByteLengthMismatch,
    #[error("artifact_chunk_size_invalid")]
    ChunkSizeInvalid,
    #[error("artifact store file task failed: {0}")]
    FileTask(#[from] tokio::task::JoinError),
    #[error("artifact store I/O failed: {0}")]
    Io(#[from] io::Error),
    #[error("artifact storage contained invalid status {0}")]
    InvalidStatus(String),
    #[error("artifact_not_found")]
    NotFound,
    #[error("artifact random identifier generation failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("artifact_read_offset_invalid")]
    ReadOffsetInvalid,
    #[error("artifact store clock failed: {0}")]
    Clock(#[from] SystemTimeError),
    #[error("artifact store storage failed")]
    Storage(#[source] Box<dyn Error + Send + Sync>),
    #[error("artifact store worker is unavailable")]
    WorkerUnavailable,
}

impl ArtifactStore {
    pub(super) fn new(commands: mpsc::Sender<DatabaseCommand>, directory: PathBuf) -> Self {
        Self {
            commands,
            directory,
            state: Arc::new(Mutex::new(ArtifactState {
                download_tickets: HashMap::new(),
                is_initialized: false,
            })),
        }
    }

    pub(crate) async fn initialize(&self) -> Result<(), ArtifactStoreError> {
        let mut state = self.state.lock().await;
        self.initialize_locked(&mut state).await
    }

    async fn initialize_locked(&self, state: &mut ArtifactState) -> Result<(), ArtifactStoreError> {
        if state.is_initialized {
            return Ok(());
        }
        run_file({
            let directory = self.directory.clone();
            move || files::create_directory(&directory)
        })
        .await?;
        let (response, result) = oneshot::channel();
        self.send(ArtifactStoreCommand::ClearWriting { response })
            .await?;
        result
            .await
            .map_err(|_| ArtifactStoreError::WorkerUnavailable)??;
        run_file({
            let directory = self.directory.clone();
            move || files::clear_parts(&directory)
        })
        .await?;
        state.is_initialized = true;
        Ok(())
    }

    fn part_path(&self, id: &str) -> PathBuf {
        self.directory.join(format!("{id}.part"))
    }

    fn ready_path(&self, id: &str) -> PathBuf {
        self.directory.join(format!("{id}.artifact"))
    }
}

impl ArtifactStoreError {
    pub(super) fn storage(source: impl Error + Send + Sync + 'static) -> Self {
        Self::Storage(Box::new(source))
    }
}

async fn run_file<T>(
    operation: impl FnOnce() -> io::Result<T> + Send + 'static,
) -> Result<T, ArtifactStoreError>
where
    T: Send + 'static,
{
    tokio::task::spawn_blocking(operation)
        .await?
        .map_err(Into::into)
}

fn now_millis() -> Result<i64, ArtifactStoreError> {
    i64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())
        .map_err(ArtifactStoreError::storage)
}

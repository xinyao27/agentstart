mod authority;
mod records;
mod schema;

use std::path::{Path, PathBuf};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use rusqlite::Connection;
use serde_json::Value;
use thiserror::Error;
use tokio::sync::{mpsc, oneshot};

const DATABASE_FILE_NAME: &str = "orchestration.db";
const QUEUE_CAPACITY: usize = 256;

type DatabaseOperation =
    Box<dyn FnOnce(&mut Connection) -> Result<Value, OrchestrationError> + Send + 'static>;

struct DatabaseRequest {
    operation: DatabaseOperation,
    response: oneshot::Sender<Result<Value, OrchestrationError>>,
}

#[derive(Clone)]
pub(crate) struct OrchestrationStore {
    requests: mpsc::Sender<DatabaseRequest>,
}

pub(crate) struct OrchestrationDatabase {
    requests: mpsc::Sender<DatabaseRequest>,
    worker: JoinHandle<()>,
}

#[derive(Debug, Error)]
pub(crate) enum OrchestrationError {
    #[error("{code}: {message}")]
    Domain {
        code: &'static str,
        message: String,
        data: Option<Value>,
    },
    #[error("orchestration database I/O failed at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("orchestration database failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("orchestration database worker is unavailable")]
    WorkerUnavailable,
    #[error("orchestration database worker panicked")]
    WorkerPanicked,
}

impl OrchestrationError {
    pub(crate) fn domain(code: &'static str, message: impl Into<String>) -> Self {
        Self::Domain {
            code,
            message: message.into(),
            data: None,
        }
    }

    pub(crate) fn domain_with_data(
        code: &'static str,
        message: impl Into<String>,
        data: Value,
    ) -> Self {
        Self::Domain {
            code,
            message: message.into(),
            data: Some(data),
        }
    }

    pub(crate) fn rpc_parts(&self) -> Option<(&'static str, &str, Option<Value>)> {
        match self {
            Self::Domain {
                code,
                message,
                data,
            } => Some((code, message, data.clone())),
            _ => None,
        }
    }
}

impl OrchestrationDatabase {
    pub(crate) fn open(user_data_path: &Path) -> Result<Self, OrchestrationError> {
        std::fs::create_dir_all(user_data_path).map_err(|source| OrchestrationError::Io {
            path: user_data_path.to_path_buf(),
            source,
        })?;
        let path = user_data_path.join(DATABASE_FILE_NAME);
        let mut connection = Connection::open(&path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        )?;
        schema::migrate(&mut connection)?;
        harden(&path)?;
        let (requests, mut receiver) = mpsc::channel::<DatabaseRequest>(QUEUE_CAPACITY);
        let worker = thread::Builder::new()
            .name("agentstart-orchestration-database".to_owned())
            .spawn(move || {
                while let Some(request) = receiver.blocking_recv() {
                    let result = (request.operation)(&mut connection);
                    let _ = request.response.send(result);
                }
                let _ = connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)");
            })
            .map_err(|source| OrchestrationError::Io { path, source })?;
        Ok(Self { requests, worker })
    }

    pub(crate) fn store(&self) -> OrchestrationStore {
        OrchestrationStore {
            requests: self.requests.clone(),
        }
    }

    pub(crate) fn close(self) -> Result<(), OrchestrationError> {
        drop(self.requests);
        self.worker
            .join()
            .map_err(|_| OrchestrationError::WorkerPanicked)
    }
}

impl OrchestrationStore {
    pub(crate) async fn execute(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<Value, OrchestrationError> + Send + 'static,
    ) -> Result<Value, OrchestrationError> {
        let (response, receiver) = oneshot::channel();
        self.requests
            .send(DatabaseRequest {
                operation: Box::new(operation),
                response,
            })
            .await
            .map_err(|_| OrchestrationError::WorkerUnavailable)?;
        receiver
            .await
            .map_err(|_| OrchestrationError::WorkerUnavailable)?
    }
}

#[cfg(unix)]
fn harden(path: &Path) -> Result<(), OrchestrationError> {
    use std::os::unix::fs::PermissionsExt;

    for suffix in ["", "-wal", "-shm"] {
        let candidate = PathBuf::from(format!("{}{suffix}", path.display()));
        if candidate.exists() {
            std::fs::set_permissions(&candidate, std::fs::Permissions::from_mode(0o600)).map_err(
                |source| OrchestrationError::Io {
                    path: candidate,
                    source,
                },
            )?;
        }
    }
    Ok(())
}

#[cfg(not(unix))]
fn harden(_path: &Path) -> Result<(), OrchestrationError> {
    Ok(())
}

pub(crate) use authority::OrchestrationAuthority;
pub(crate) use records::*;

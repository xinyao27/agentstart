use std::error::Error;
use std::sync::Arc;

use async_trait::async_trait;
use rusqlite::{Connection, OptionalExtension};
use thiserror::Error;
use tokio::sync::oneshot;

#[derive(Clone, Debug)]
pub(crate) struct DangerousCredential {
    pub(crate) credential_id: String,
    pub(crate) public_key_spki: String,
    pub(crate) user_id: String,
}

#[derive(Clone)]
pub(crate) struct DangerousCredentialStore {
    mailbox: Arc<dyn DangerousCredentialMailbox>,
}

pub(crate) struct DangerousCredentialRequest(DangerousCredentialCommand);

enum DangerousCredentialCommand {
    Read {
        response: oneshot::Sender<Result<Option<DangerousCredential>, DangerousCredentialError>>,
    },
    Remove {
        response: oneshot::Sender<Result<(), DangerousCredentialError>>,
    },
    Save {
        created_at: i64,
        credential: DangerousCredential,
        response: oneshot::Sender<Result<(), DangerousCredentialError>>,
    },
}

#[async_trait]
pub(crate) trait DangerousCredentialMailbox: Send + Sync {
    async fn submit(
        &self,
        request: DangerousCredentialRequest,
    ) -> Result<(), DangerousCredentialMailboxClosed>;
}

pub(crate) struct DangerousCredentialWorker;

#[derive(Debug, Error)]
pub(crate) enum DangerousCredentialError {
    #[error("dangerous approval credential storage failed")]
    Storage(#[source] Box<dyn Error + Send + Sync>),
    #[error("dangerous approval credential worker is unavailable")]
    WorkerUnavailable,
}

#[derive(Debug)]
pub(crate) struct DangerousCredentialMailboxClosed;

impl DangerousCredentialStore {
    pub(crate) fn new(mailbox: Arc<dyn DangerousCredentialMailbox>) -> Self {
        Self { mailbox }
    }

    pub(crate) async fn read(
        &self,
    ) -> Result<Option<DangerousCredential>, DangerousCredentialError> {
        let (response, result) = oneshot::channel();
        self.submit(DangerousCredentialCommand::Read { response })
            .await?;
        receive(result).await
    }

    pub(crate) async fn save(
        &self,
        credential: DangerousCredential,
        created_at: i64,
    ) -> Result<(), DangerousCredentialError> {
        let (response, result) = oneshot::channel();
        self.submit(DangerousCredentialCommand::Save {
            created_at,
            credential,
            response,
        })
        .await?;
        receive(result).await
    }

    pub(crate) async fn remove(&self) -> Result<(), DangerousCredentialError> {
        let (response, result) = oneshot::channel();
        self.submit(DangerousCredentialCommand::Remove { response })
            .await?;
        receive(result).await
    }

    async fn submit(
        &self,
        command: DangerousCredentialCommand,
    ) -> Result<(), DangerousCredentialError> {
        self.mailbox
            .submit(DangerousCredentialRequest(command))
            .await
            .map_err(|_| DangerousCredentialError::WorkerUnavailable)
    }
}

impl DangerousCredentialWorker {
    pub(crate) fn handle(&self, connection: &Connection, request: DangerousCredentialRequest) {
        match request.0 {
            DangerousCredentialCommand::Read { response } => {
                let _ = response.send(read(connection));
            }
            DangerousCredentialCommand::Remove { response } => {
                let _ = response.send(remove(connection));
            }
            DangerousCredentialCommand::Save {
                created_at,
                credential,
                response,
            } => {
                let _ = response.send(save(connection, &credential, created_at));
            }
        }
    }
}

fn read(connection: &Connection) -> Result<Option<DangerousCredential>, DangerousCredentialError> {
    connection
        .query_row(
            "SELECT credential_id, public_key_spki, user_id
             FROM dangerous_credential WHERE id = 1",
            [],
            |row| {
                Ok(DangerousCredential {
                    credential_id: row.get(0)?,
                    public_key_spki: row.get(1)?,
                    user_id: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(DangerousCredentialError::storage)
}

fn save(
    connection: &Connection,
    credential: &DangerousCredential,
    created_at: i64,
) -> Result<(), DangerousCredentialError> {
    connection
        .execute(
            "INSERT INTO dangerous_credential(
               id, credential_id, public_key_spki, user_id, created_at
             ) VALUES (1, ?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET credential_id = excluded.credential_id,
               public_key_spki = excluded.public_key_spki, user_id = excluded.user_id,
               created_at = excluded.created_at",
            rusqlite::params![
                credential.credential_id,
                credential.public_key_spki,
                credential.user_id,
                created_at,
            ],
        )
        .map(|_| ())
        .map_err(DangerousCredentialError::storage)
}

fn remove(connection: &Connection) -> Result<(), DangerousCredentialError> {
    connection
        .execute("DELETE FROM dangerous_credential WHERE id = 1", [])
        .map(|_| ())
        .map_err(DangerousCredentialError::storage)
}

impl DangerousCredentialError {
    fn storage(source: impl Error + Send + Sync + 'static) -> Self {
        Self::Storage(Box::new(source))
    }
}

async fn receive<T>(
    result: oneshot::Receiver<Result<T, DangerousCredentialError>>,
) -> Result<T, DangerousCredentialError> {
    result
        .await
        .map_err(|_| DangerousCredentialError::WorkerUnavailable)?
}

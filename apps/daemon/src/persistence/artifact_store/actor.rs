use rusqlite::Connection;
use tokio::sync::oneshot;

use super::super::database::DatabaseCommand;
use super::{Artifact, ArtifactStore, ArtifactStoreError, records};

pub(in crate::persistence) enum ArtifactStoreCommand {
    ClearWriting {
        response: oneshot::Sender<Result<(), ArtifactStoreError>>,
    },
    Find {
        id: String,
        response: oneshot::Sender<Result<Option<Artifact>, ArtifactStoreError>>,
    },
    Insert {
        artifact: Artifact,
        response: oneshot::Sender<Result<(), ArtifactStoreError>>,
    },
    MarkReady {
        id: String,
        response: oneshot::Sender<Result<(), ArtifactStoreError>>,
    },
    RemoveWriting {
        id: String,
        response: oneshot::Sender<Result<(), ArtifactStoreError>>,
    },
    UpdateByteLength {
        byte_length: i64,
        id: String,
        response: oneshot::Sender<Result<(), ArtifactStoreError>>,
    },
}

pub(in crate::persistence) struct ArtifactStoreWorker;

impl ArtifactStore {
    pub(super) async fn find(&self, id: String) -> Result<Option<Artifact>, ArtifactStoreError> {
        let (response, result) = oneshot::channel();
        self.send(ArtifactStoreCommand::Find { id, response })
            .await?;
        result
            .await
            .map_err(|_| ArtifactStoreError::WorkerUnavailable)?
    }

    pub(super) async fn insert(&self, artifact: Artifact) -> Result<(), ArtifactStoreError> {
        let (response, result) = oneshot::channel();
        self.send(ArtifactStoreCommand::Insert { artifact, response })
            .await?;
        result
            .await
            .map_err(|_| ArtifactStoreError::WorkerUnavailable)?
    }

    pub(super) async fn update_byte_length(
        &self,
        id: String,
        byte_length: i64,
    ) -> Result<(), ArtifactStoreError> {
        let (response, result) = oneshot::channel();
        self.send(ArtifactStoreCommand::UpdateByteLength {
            byte_length,
            id,
            response,
        })
        .await?;
        result
            .await
            .map_err(|_| ArtifactStoreError::WorkerUnavailable)?
    }

    pub(super) async fn mark_ready(&self, id: String) -> Result<(), ArtifactStoreError> {
        let (response, result) = oneshot::channel();
        self.send(ArtifactStoreCommand::MarkReady { id, response })
            .await?;
        result
            .await
            .map_err(|_| ArtifactStoreError::WorkerUnavailable)?
    }

    pub(super) async fn remove_writing(&self, id: String) -> Result<(), ArtifactStoreError> {
        let (response, result) = oneshot::channel();
        self.send(ArtifactStoreCommand::RemoveWriting { id, response })
            .await?;
        result
            .await
            .map_err(|_| ArtifactStoreError::WorkerUnavailable)?
    }

    pub(super) async fn send(
        &self,
        command: ArtifactStoreCommand,
    ) -> Result<(), ArtifactStoreError> {
        self.commands
            .send(DatabaseCommand::ArtifactStore(command))
            .await
            .map_err(|_| ArtifactStoreError::WorkerUnavailable)
    }
}

impl ArtifactStoreWorker {
    pub(in crate::persistence) fn handle(
        &self,
        connection: &Connection,
        command: ArtifactStoreCommand,
    ) {
        match command {
            ArtifactStoreCommand::ClearWriting { response } => {
                let _ = response.send(records::clear_writing(connection));
            }
            ArtifactStoreCommand::Find { id, response } => {
                let _ = response.send(records::find(connection, &id));
            }
            ArtifactStoreCommand::Insert { artifact, response } => {
                let _ = response.send(records::insert(connection, &artifact));
            }
            ArtifactStoreCommand::MarkReady { id, response } => {
                let _ = response.send(records::mark_ready(connection, &id));
            }
            ArtifactStoreCommand::RemoveWriting { id, response } => {
                let _ = response.send(records::remove_writing(connection, &id));
            }
            ArtifactStoreCommand::UpdateByteLength {
                byte_length,
                id,
                response,
            } => {
                let _ = response.send(records::update_byte_length(connection, &id, byte_length));
            }
        }
    }
}

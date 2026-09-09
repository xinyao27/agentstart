use std::io;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;

use super::{
    ArtifactRead, ArtifactStatus, ArtifactStore, ArtifactStoreError, ReadyArtifactFile, files,
    run_file,
};

impl ArtifactStore {
    pub(crate) async fn ready_file(
        &self,
        id: String,
    ) -> Result<Option<ReadyArtifactFile>, ArtifactStoreError> {
        let mut state = self.state.lock().await;
        self.initialize_locked(&mut state).await?;
        self.ready_file_locked(id).await
    }

    pub(crate) async fn ready_path_for_project(
        &self,
        id: String,
        project_id: String,
    ) -> Result<bool, ArtifactStoreError> {
        Ok(self
            .ready_file(id)
            .await?
            .is_some_and(|ready| ready.artifact.project_id == project_id))
    }

    pub(crate) async fn read(
        &self,
        id: String,
        offset: i64,
        limit: usize,
    ) -> Result<ArtifactRead, ArtifactStoreError> {
        let mut state = self.state.lock().await;
        self.initialize_locked(&mut state).await?;
        let ready = self
            .ready_file_locked(id)
            .await?
            .ok_or(ArtifactStoreError::NotFound)?;
        if offset > ready.artifact.byte_length {
            return Err(ArtifactStoreError::ReadOffsetInvalid);
        }
        let remaining = usize::try_from(ready.artifact.byte_length - offset)
            .map_err(ArtifactStoreError::storage)?;
        let length = limit.min(remaining);
        let bytes = run_file({
            let path = ready.path;
            move || {
                let offset = u64::try_from(offset).map_err(io::Error::other)?;
                files::read(&path, offset, length)
            }
        })
        .await?;
        let read_length = i64::try_from(bytes.len()).map_err(ArtifactStoreError::storage)?;
        let next_offset = offset + read_length;
        Ok(ArtifactRead {
            data_base64: BASE64.encode(bytes),
            eof: next_offset >= ready.artifact.byte_length,
            mime_type: ready.artifact.mime_type,
            next_offset,
        })
    }

    pub(super) async fn ready_file_locked(
        &self,
        id: String,
    ) -> Result<Option<ReadyArtifactFile>, ArtifactStoreError> {
        let Some(artifact) = self.find(id.clone()).await? else {
            return Ok(None);
        };
        let path = self.ready_path(&id);
        if artifact.status != ArtifactStatus::Ready
            || !run_file({
                let path = path.clone();
                move || Ok(files::exists(&path))
            })
            .await?
        {
            return Ok(None);
        }
        Ok(Some(ReadyArtifactFile { artifact, path }))
    }
}

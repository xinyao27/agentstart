use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;

use super::{
    Artifact, ArtifactBegin, ArtifactStatus, ArtifactStore, ArtifactStoreError, MAX_ARTIFACT_BYTES,
    MAX_CHUNK_BYTES, files, now_millis, run_file,
};

impl ArtifactStore {
    pub(crate) async fn begin(&self, input: ArtifactBegin) -> Result<Artifact, ArtifactStoreError> {
        let mut state = self.state.lock().await;
        self.initialize_locked(&mut state).await?;
        let artifact = Artifact {
            byte_length: 0,
            created_at: now_millis()?,
            file_name: input.file_name,
            id: random_uuid()?,
            mime_type: input.mime_type,
            project_id: input.project_id,
            status: ArtifactStatus::Writing,
        };
        let path = self.part_path(&artifact.id);
        run_file({
            let path = path.clone();
            move || files::create_part(&path)
        })
        .await?;
        if let Err(error) = self.insert(artifact.clone()).await {
            run_file(move || files::remove_if_present(&path)).await?;
            return Err(error);
        }
        Ok(artifact)
    }

    pub(crate) async fn append_base64(
        &self,
        id: String,
        offset: i64,
        data_base64: String,
    ) -> Result<Artifact, ArtifactStoreError> {
        let mut state = self.state.lock().await;
        self.initialize_locked(&mut state).await?;
        let artifact = self.writing_artifact(&id, offset).await?;
        let bytes = decode_base64(&data_base64)?;
        self.append_locked(artifact, bytes).await
    }

    pub(crate) async fn complete(&self, id: String) -> Result<Artifact, ArtifactStoreError> {
        let mut state = self.state.lock().await;
        self.initialize_locked(&mut state).await?;
        let mut artifact = self
            .find(id.clone())
            .await?
            .ok_or(ArtifactStoreError::NotFound)?;
        if artifact.status == ArtifactStatus::Ready {
            return Ok(artifact);
        }
        let part_path = self.part_path(&id);
        let length = run_file({
            let path = part_path.clone();
            move || files::length(&path)
        })
        .await?;
        if i64::try_from(length).ok() != Some(artifact.byte_length) {
            return Err(ArtifactStoreError::ByteLengthMismatch);
        }
        let ready_path = self.ready_path(&id);
        run_file(move || files::complete(&part_path, &ready_path)).await?;
        self.mark_ready(id).await?;
        artifact.status = ArtifactStatus::Ready;
        Ok(artifact)
    }

    pub(crate) async fn abort(&self, id: String) -> Result<bool, ArtifactStoreError> {
        let mut state = self.state.lock().await;
        self.initialize_locked(&mut state).await?;
        let Some(artifact) = self.find(id.clone()).await? else {
            return Ok(false);
        };
        if artifact.status != ArtifactStatus::Writing {
            return Ok(false);
        }
        let path = self.part_path(&id);
        run_file(move || files::remove_if_present(&path)).await?;
        self.remove_writing(id).await?;
        Ok(true)
    }

    async fn append_locked(
        &self,
        mut artifact: Artifact,
        bytes: Vec<u8>,
    ) -> Result<Artifact, ArtifactStoreError> {
        let byte_length = i64::try_from(bytes.len()).map_err(ArtifactStoreError::storage)?;
        let total_length = artifact
            .byte_length
            .checked_add(byte_length)
            .ok_or(ArtifactStoreError::ChunkSizeInvalid)?;
        if bytes.is_empty() || bytes.len() > MAX_CHUNK_BYTES || total_length > MAX_ARTIFACT_BYTES {
            return Err(ArtifactStoreError::ChunkSizeInvalid);
        }
        let path = self.part_path(&artifact.id);
        run_file(move || files::append(&path, &bytes)).await?;
        self.update_byte_length(artifact.id.clone(), total_length)
            .await?;
        artifact.byte_length = total_length;
        Ok(artifact)
    }

    async fn writing_artifact(
        &self,
        id: &str,
        offset: i64,
    ) -> Result<Artifact, ArtifactStoreError> {
        let artifact = self
            .find(id.to_owned())
            .await?
            .ok_or(ArtifactStoreError::NotFound)?;
        if artifact.status != ArtifactStatus::Writing || artifact.byte_length != offset {
            return Err(ArtifactStoreError::AppendOffsetConflict);
        }
        Ok(artifact)
    }
}

fn decode_base64(value: &str) -> Result<Vec<u8>, ArtifactStoreError> {
    if value.is_empty() || !value.len().is_multiple_of(4) {
        return Err(ArtifactStoreError::Base64Invalid);
    }
    let bytes = BASE64
        .decode(value)
        .map_err(|_| ArtifactStoreError::Base64Invalid)?;
    if BASE64.encode(&bytes) != value {
        return Err(ArtifactStoreError::Base64Invalid);
    }
    Ok(bytes)
}

fn random_uuid() -> Result<String, ArtifactStoreError> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes)?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    ))
}

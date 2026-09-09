use std::fs;
use std::io;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;

use super::{
    VisualRegressionCapture, VisualRegressionCaptureRow, VisualRegressionStore,
    VisualRegressionStoreError,
};
use crate::persistence::{ArtifactBegin, ArtifactStore};

const ARTIFACT_CHUNK_BYTES: usize = 384 * 1_024;
const PNG_SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

pub(super) async fn hydrate_capture(
    artifacts: &ArtifactStore,
    store: &VisualRegressionStore,
    row: VisualRegressionCaptureRow,
) -> Result<VisualRegressionCapture, VisualRegressionStoreError> {
    if let Some(image_artifact_id) = row.image_artifact_id.clone() {
        return Ok(row.with_artifact(image_artifact_id));
    }
    let bytes = read_legacy_capture(store, &row.id).await?;
    let artifact = artifacts
        .begin(ArtifactBegin {
            file_name: format!("visual-regression-{}.png", row.id),
            mime_type: "image/png".to_owned(),
            project_id: row.project_id.clone(),
        })
        .await?;
    let artifact_id = artifact.id;
    let migration = async {
        let mut offset = 0_i64;
        for chunk in bytes.chunks(ARTIFACT_CHUNK_BYTES) {
            artifacts
                .append_base64(artifact_id.clone(), offset, BASE64.encode(chunk))
                .await?;
            offset += i64::try_from(chunk.len()).expect("artifact chunk length fits i64");
        }
        artifacts.complete(artifact_id.clone()).await?;
        store
            .bind_artifact(row.id.clone(), artifact_id.clone())
            .await?;
        Ok::<(), VisualRegressionStoreError>(())
    }
    .await;
    if let Err(error) = migration {
        // Why: Bun always attempts abort after a post-begin failure; an abort failure replaces the
        // original error, while aborting an already-complete artifact is a successful no-op.
        artifacts.abort(artifact_id.clone()).await?;
        return Err(error);
    }
    Ok(row.with_artifact(artifact_id))
}

async fn read_legacy_capture(
    store: &VisualRegressionStore,
    capture_id: &str,
) -> Result<Vec<u8>, VisualRegressionStoreError> {
    let path = store.legacy_path(capture_id);
    tokio::task::spawn_blocking(move || {
        if !path.exists() {
            return Err(VisualRegressionStoreError::LegacyFileMissing);
        }
        let bytes = fs::read(path)?;
        if !bytes.starts_with(&PNG_SIGNATURE) {
            return Err(VisualRegressionStoreError::LegacyFileInvalid);
        }
        Ok(bytes)
    })
    .await?
}

impl From<io::Error> for VisualRegressionStoreError {
    fn from(source: io::Error) -> Self {
        Self::LegacyFileIo(source)
    }
}

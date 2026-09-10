use std::io;
use std::path::PathBuf;
use std::time::SystemTimeError;

use thiserror::Error;

use super::base64::decode_node_base64;
use super::identity::{now_millis, random_uuid};

const MAX_IMAGE_BYTES: usize = 18 * 1_024 * 1_024;

#[derive(Clone, Copy)]
pub(crate) struct ClipboardImageFiles;

#[derive(Debug, Error)]
pub(crate) enum ClipboardImageFileError {
    #[error("Clipboard image is too large")]
    TooLarge,
    #[error("clipboard image filename clock failed: {0}")]
    Clock(#[from] SystemTimeError),
    #[error("clipboard image filename entropy failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("clipboard image write failed: {0}")]
    Io(#[from] io::Error),
    #[error("clipboard image decode task failed: {0}")]
    Task(#[from] tokio::task::JoinError),
}

impl ClipboardImageFiles {
    pub(crate) const fn new() -> Self {
        Self
    }

    pub(crate) async fn save_base64(
        self,
        content_base64: String,
    ) -> Result<PathBuf, ClipboardImageFileError> {
        let bytes = tokio::task::spawn_blocking(move || decode_node_base64(content_base64)).await?;
        if bytes.len() > MAX_IMAGE_BYTES {
            return Err(ClipboardImageFileError::TooLarge);
        }
        let path = std::env::temp_dir().join(format!(
            "agentstart-paste-{}-{}.png",
            now_millis()?,
            random_uuid()?
        ));
        tokio::fs::write(&path, bytes).await?;
        Ok(path)
    }
}

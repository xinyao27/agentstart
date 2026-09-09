use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use super::{LocalDownloadError, publish};

pub(super) struct FileTransfer {
    cancelled: AtomicBool,
    destination_path: PathBuf,
    destination_path_text: String,
    owner_id: String,
    state: Mutex<FileTransferState>,
    temp_path: PathBuf,
}

struct FileTransferState {
    file: Option<File>,
    phase: TransferPhase,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum TransferPhase {
    Active,
    Finishing,
    Closed,
}

impl FileTransfer {
    pub(super) fn new(
        owner_id: String,
        destination_path: PathBuf,
        destination_path_text: String,
        temp_path: PathBuf,
        file: File,
    ) -> Self {
        Self {
            cancelled: AtomicBool::new(false),
            destination_path,
            destination_path_text,
            owner_id,
            state: Mutex::new(FileTransferState {
                file: Some(file),
                phase: TransferPhase::Active,
            }),
            temp_path,
        }
    }

    pub(super) fn owner_id(&self) -> &str {
        &self.owner_id
    }

    pub(super) fn destination_path(&self) -> &Path {
        &self.destination_path
    }

    pub(super) fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
    }

    pub(super) async fn append(&self, content: &[u8]) -> Result<(), LocalDownloadError> {
        let mut state = self.state.lock().await;
        ensure_active(state.phase, &self.cancelled)?;
        let result = state
            .file
            .as_mut()
            .ok_or(LocalDownloadError::InvalidState)?
            .write_all(content)
            .await;
        if let Err(error) = result {
            state.file = None;
            state.phase = TransferPhase::Closed;
            self.cancel();
            return Err(LocalDownloadError::Io(error));
        }
        Ok(())
    }

    pub(super) async fn finish(
        &self,
        request_cancelled: &AtomicBool,
    ) -> Result<String, LocalDownloadError> {
        let mut state = self.state.lock().await;
        ensure_active(state.phase, &self.cancelled)?;
        state.phase = TransferPhase::Finishing;
        let file = state.file.take().ok_or(LocalDownloadError::InvalidState)?;
        file.sync_all().await?;
        drop(file);
        ensure_not_cancelled(&self.cancelled, request_cancelled)?;
        publish::rename_exclusive(self.temp_path.clone(), self.destination_path.clone()).await?;
        state.phase = TransferPhase::Closed;
        Ok(self.destination_path_text.clone())
    }

    pub(super) async fn cleanup(&self) -> Result<(), io::Error> {
        let mut state = self.state.lock().await;
        state.phase = TransferPhase::Closed;
        state.file = None;
        match tokio::fs::remove_file(&self.temp_path).await {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }
}

fn ensure_active(phase: TransferPhase, cancelled: &AtomicBool) -> Result<(), LocalDownloadError> {
    ensure_not_cancelled(cancelled, &AtomicBool::new(false))?;
    if phase != TransferPhase::Active {
        return Err(LocalDownloadError::InvalidState);
    }
    Ok(())
}

fn ensure_not_cancelled(
    transfer_cancelled: &AtomicBool,
    request_cancelled: &AtomicBool,
) -> Result<(), LocalDownloadError> {
    if is_cancelled(transfer_cancelled, request_cancelled) {
        Err(LocalDownloadError::Cancelled)
    } else {
        Ok(())
    }
}

fn is_cancelled(transfer_cancelled: &AtomicBool, request_cancelled: &AtomicBool) -> bool {
    transfer_cancelled.load(Ordering::Acquire) || request_cancelled.load(Ordering::Acquire)
}

pub(super) async fn finish_owned(
    transfer: Arc<FileTransfer>,
    request_cancelled: Arc<AtomicBool>,
) -> Result<String, LocalDownloadError> {
    transfer.finish(&request_cancelled).await
}

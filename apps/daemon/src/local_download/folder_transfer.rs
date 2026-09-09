use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use tokio::fs::{File, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use super::{FolderChunk, LocalDownloadError, publish};

pub(super) struct FolderTransfer {
    cancelled: AtomicBool,
    destination_path: PathBuf,
    destination_path_text: String,
    owner_id: String,
    state: Mutex<FolderTransferState>,
    temp_path: PathBuf,
}

struct FolderTransferState {
    active_file: Option<ActiveFolderFile>,
    phase: TransferPhase,
}

struct ActiveFolderFile {
    file: File,
    path_segments: Vec<String>,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum TransferPhase {
    Active,
    Finishing,
    Closed,
}

impl FolderTransfer {
    pub(super) fn new(
        owner_id: String,
        destination_path: PathBuf,
        destination_path_text: String,
        temp_path: PathBuf,
    ) -> Self {
        Self {
            cancelled: AtomicBool::new(false),
            destination_path,
            destination_path_text,
            owner_id,
            state: Mutex::new(FolderTransferState {
                active_file: None,
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

    pub(super) async fn create_directory(
        &self,
        path_segments: &[String],
    ) -> Result<(), LocalDownloadError> {
        let state = self.state.lock().await;
        ensure_active(state.phase, &self.cancelled)?;
        if state.active_file.is_some() {
            return Err(LocalDownloadError::InvalidState);
        }
        tokio::fs::create_dir(join_segments(&self.temp_path, path_segments))
            .await
            .map_err(LocalDownloadError::from)
    }

    pub(super) async fn append(&self, input: FolderChunk<'_>) -> Result<(), LocalDownloadError> {
        let mut state = self.state.lock().await;
        ensure_active(state.phase, &self.cancelled)?;
        if input.first {
            if state.active_file.is_some() {
                return Err(LocalDownloadError::InvalidState);
            }
            let file = match OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(join_segments(&self.temp_path, input.path_segments))
                .await
            {
                Ok(file) => file,
                Err(error) => return self.fail(&mut state, error),
            };
            state.active_file = Some(ActiveFolderFile {
                file,
                path_segments: input.path_segments.to_vec(),
            });
        }
        let active = state
            .active_file
            .as_mut()
            .filter(|active| active.path_segments == input.path_segments)
            .ok_or(LocalDownloadError::InvalidState)?;
        if let Err(error) = active.file.write_all(input.content).await {
            return self.fail(&mut state, error);
        }
        if input.last {
            let active = state
                .active_file
                .take()
                .ok_or(LocalDownloadError::InvalidState)?;
            if let Err(error) = active.file.sync_all().await {
                return self.fail(&mut state, error);
            }
        }
        Ok(())
    }

    pub(super) async fn finish(
        &self,
        request_cancelled: &AtomicBool,
    ) -> Result<String, LocalDownloadError> {
        let mut state = self.state.lock().await;
        ensure_active(state.phase, &self.cancelled)?;
        if state.active_file.is_some() {
            return Err(LocalDownloadError::InvalidState);
        }
        state.phase = TransferPhase::Finishing;
        ensure_not_cancelled(&self.cancelled, request_cancelled)?;
        publish::rename_exclusive(self.temp_path.clone(), self.destination_path.clone()).await?;
        state.phase = TransferPhase::Closed;
        Ok(self.destination_path_text.clone())
    }

    pub(super) async fn cleanup(&self) -> Result<(), io::Error> {
        let mut state = self.state.lock().await;
        state.phase = TransferPhase::Closed;
        state.active_file = None;
        match tokio::fs::remove_dir_all(&self.temp_path).await {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }

    fn fail(
        &self,
        state: &mut FolderTransferState,
        error: std::io::Error,
    ) -> Result<(), LocalDownloadError> {
        state.active_file = None;
        state.phase = TransferPhase::Closed;
        self.cancel();
        Err(LocalDownloadError::Io(error))
    }
}

fn ensure_active(phase: TransferPhase, cancelled: &AtomicBool) -> Result<(), LocalDownloadError> {
    if cancelled.load(Ordering::Acquire) {
        return Err(LocalDownloadError::Cancelled);
    }
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

fn join_segments(root: &Path, segments: &[String]) -> PathBuf {
    segments
        .iter()
        .fold(root.to_owned(), |path, segment| path.join(segment))
}

pub(super) async fn finish_owned(
    transfer: Arc<FolderTransfer>,
    request_cancelled: Arc<AtomicBool>,
) -> Result<String, LocalDownloadError> {
    transfer.finish(&request_cancelled).await
}

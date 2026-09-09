mod file_transfer;
mod filename;
mod folder_transfer;
mod input;
mod publish;
mod registry;
mod start;

use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

use thiserror::Error;
use tokio::sync::oneshot;

use input::{
    ensure_not_cancelled, validate_file_chunk, validate_folder_chunk, validate_owner,
    validate_path_segments, validate_suggested_name, validate_transfer_id,
};
use registry::{Transfer, TransferRegistry};

const DOWNLOAD_SESSION_TTL: Duration = Duration::from_secs(30 * 60);
const CLEANUP_RETRY_INITIAL: Duration = Duration::from_millis(100);
const CLEANUP_RETRY_MAX: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub(crate) struct LocalDownloadAuthority {
    downloads_path: PathBuf,
    registry: TransferRegistry,
}

pub(crate) struct LocalDownloadSession {
    pub(crate) destination_path: String,
    pub(crate) transfer_id: String,
}

pub(crate) struct FolderChunk<'a> {
    pub(crate) content: &'a [u8],
    pub(crate) first: bool,
    pub(crate) last: bool,
    pub(crate) path_segments: &'a [String],
    pub(crate) transfer_id: &'a str,
}

#[derive(Debug, Error)]
pub(crate) enum LocalDownloadError {
    #[error("local download input is invalid: {0}")]
    InvalidInput(&'static str),
    #[error("local download session was not found")]
    SessionNotFound,
    #[error("local download session is not ready for this operation")]
    InvalidState,
    #[error("local download was cancelled")]
    Cancelled,
    #[error("too many local downloads are active")]
    ResourceExhausted,
    #[error("local download path cannot be represented as UTF-8")]
    PathEncoding,
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error("local download transaction task failed: {0}")]
    Task(#[from] tokio::task::JoinError),
}

impl LocalDownloadAuthority {
    pub(crate) fn new(home: &Path) -> Self {
        Self {
            downloads_path: home.join("Downloads"),
            registry: TransferRegistry::new(),
        }
    }

    pub(crate) async fn start_file(
        &self,
        owner_id: &str,
        suggested_name: &str,
        request_cancelled: Arc<AtomicBool>,
        start_call_id: u64,
    ) -> Result<LocalDownloadSession, LocalDownloadError> {
        validate_owner(owner_id)?;
        validate_suggested_name(suggested_name)?;
        let authority = self.clone();
        let owner_id = owner_id.to_owned();
        let suggested_name = suggested_name.to_owned();
        tokio::spawn(async move {
            authority
                .start_file_transaction(owner_id, suggested_name, request_cancelled, start_call_id)
                .await
        })
        .await?
    }

    pub(crate) async fn append_file_chunk(
        &self,
        owner_id: &str,
        transfer_id: &str,
        content: &[u8],
        request_cancelled: Arc<AtomicBool>,
    ) -> Result<(), LocalDownloadError> {
        validate_transfer_id(transfer_id)?;
        validate_file_chunk(content)?;
        let transfer = self.registry.file(owner_id, transfer_id)?;
        let registry = self.registry.clone();
        let transfer_id = transfer_id.to_owned();
        let content = content.to_vec();
        tokio::spawn(async move {
            let result = transfer
                .append(&content)
                .await
                .and_then(|()| ensure_not_cancelled(&request_cancelled));
            if result.as_ref().is_err_and(is_terminal_operation_error) {
                transfer.cancel();
                if let Some(cleanup) = registry.remove_file(&transfer_id, &transfer) {
                    cleanup.cleanup().await;
                }
            }
            result
        })
        .await?
    }

    pub(crate) async fn finish_file(
        &self,
        owner_id: &str,
        transfer_id: &str,
        request_cancelled: Arc<AtomicBool>,
    ) -> Result<String, LocalDownloadError> {
        validate_transfer_id(transfer_id)?;
        let transfer = self.registry.file(owner_id, transfer_id)?;
        let registry = self.registry.clone();
        let transfer_id = transfer_id.to_owned();
        tokio::spawn(async move {
            let result = file_transfer::finish_owned(transfer.clone(), request_cancelled).await;
            if let Some(cleanup) = registry.remove_file(&transfer_id, &transfer) {
                if result.is_err() {
                    cleanup.cleanup().await;
                } else {
                    cleanup.complete();
                }
            }
            result
        })
        .await?
    }

    pub(crate) async fn cancel_file(
        &self,
        owner_id: &str,
        transfer_id: &str,
    ) -> Result<(), LocalDownloadError> {
        validate_transfer_id(transfer_id)?;
        let transfer = match self.registry.file(owner_id, transfer_id) {
            Ok(transfer) => transfer,
            Err(LocalDownloadError::SessionNotFound) => return Ok(()),
            Err(error) => return Err(error),
        };
        transfer.cancel();
        if let Some(cleanup) = self.registry.remove_file(transfer_id, &transfer) {
            tokio::spawn(async move { cleanup.cleanup().await }).await?;
        }
        Ok(())
    }

    pub(crate) fn rollback_file_response(&self, owner_id: &str, transfer_id: &str) {
        let Ok(transfer) = self.registry.file(owner_id, transfer_id) else {
            return;
        };
        transfer.cancel();
        if let Some(cleanup) = self.registry.remove_file(transfer_id, &transfer) {
            tokio::spawn(async move { cleanup.cleanup().await });
        }
    }

    pub(crate) async fn start_folder(
        &self,
        owner_id: &str,
        suggested_name: &str,
        request_cancelled: Arc<AtomicBool>,
        start_call_id: u64,
    ) -> Result<LocalDownloadSession, LocalDownloadError> {
        validate_owner(owner_id)?;
        validate_suggested_name(suggested_name)?;
        let authority = self.clone();
        let owner_id = owner_id.to_owned();
        let suggested_name = suggested_name.to_owned();
        tokio::spawn(async move {
            authority
                .start_folder_transaction(
                    owner_id,
                    suggested_name,
                    request_cancelled,
                    start_call_id,
                )
                .await
        })
        .await?
    }

    pub(crate) async fn create_folder_directory(
        &self,
        owner_id: &str,
        transfer_id: &str,
        path_segments: &[String],
        request_cancelled: Arc<AtomicBool>,
    ) -> Result<(), LocalDownloadError> {
        validate_transfer_id(transfer_id)?;
        let path_segments = validate_path_segments(path_segments)?;
        let transfer = self.registry.folder(owner_id, transfer_id)?;
        let registry = self.registry.clone();
        let transfer_id = transfer_id.to_owned();
        tokio::spawn(async move {
            let result = transfer
                .create_directory(&path_segments)
                .await
                .and_then(|()| ensure_not_cancelled(&request_cancelled));
            if result.as_ref().is_err_and(is_terminal_operation_error) {
                transfer.cancel();
                if let Some(cleanup) = registry.remove_folder(&transfer_id, &transfer) {
                    cleanup.cleanup().await;
                }
            }
            result
        })
        .await?
    }

    pub(crate) async fn append_folder_file_chunk(
        &self,
        owner_id: &str,
        input: FolderChunk<'_>,
        request_cancelled: Arc<AtomicBool>,
    ) -> Result<(), LocalDownloadError> {
        validate_transfer_id(input.transfer_id)?;
        validate_folder_chunk(input.content)?;
        let path_segments = validate_path_segments(input.path_segments)?;
        let transfer = self.registry.folder(owner_id, input.transfer_id)?;
        let registry = self.registry.clone();
        let transfer_id = input.transfer_id.to_owned();
        let content = input.content.to_vec();
        let first = input.first;
        let last = input.last;
        tokio::spawn(async move {
            let result = transfer
                .append(FolderChunk {
                    content: &content,
                    first,
                    last,
                    path_segments: &path_segments,
                    transfer_id: &transfer_id,
                })
                .await
                .and_then(|()| ensure_not_cancelled(&request_cancelled));
            if result.as_ref().is_err_and(is_terminal_operation_error) {
                transfer.cancel();
                if let Some(cleanup) = registry.remove_folder(&transfer_id, &transfer) {
                    cleanup.cleanup().await;
                }
            }
            result
        })
        .await?
    }

    pub(crate) async fn finish_folder(
        &self,
        owner_id: &str,
        transfer_id: &str,
        request_cancelled: Arc<AtomicBool>,
    ) -> Result<String, LocalDownloadError> {
        validate_transfer_id(transfer_id)?;
        let transfer = self.registry.folder(owner_id, transfer_id)?;
        let registry = self.registry.clone();
        let transfer_id = transfer_id.to_owned();
        tokio::spawn(async move {
            let result = folder_transfer::finish_owned(transfer.clone(), request_cancelled).await;
            if let Some(cleanup) = registry.remove_folder(&transfer_id, &transfer) {
                if result.is_err() {
                    cleanup.cleanup().await;
                } else {
                    cleanup.complete();
                }
            }
            result
        })
        .await?
    }

    pub(crate) async fn cancel_folder(
        &self,
        owner_id: &str,
        transfer_id: &str,
    ) -> Result<(), LocalDownloadError> {
        validate_transfer_id(transfer_id)?;
        let transfer = match self.registry.folder(owner_id, transfer_id) {
            Ok(transfer) => transfer,
            Err(LocalDownloadError::SessionNotFound) => return Ok(()),
            Err(error) => return Err(error),
        };
        transfer.cancel();
        if let Some(cleanup) = self.registry.remove_folder(transfer_id, &transfer) {
            tokio::spawn(async move { cleanup.cleanup().await }).await?;
        }
        Ok(())
    }

    pub(crate) fn rollback_folder_response(&self, owner_id: &str, transfer_id: &str) {
        let Ok(transfer) = self.registry.folder(owner_id, transfer_id) else {
            return;
        };
        transfer.cancel();
        if let Some(cleanup) = self.registry.remove_folder(transfer_id, &transfer) {
            tokio::spawn(async move { cleanup.cleanup().await });
        }
    }

    pub(crate) fn close_connection(&self, owner_id: &str) {
        for transfer in self.registry.take_owner(owner_id) {
            tokio::spawn(cleanup_transfer(transfer));
        }
    }

    pub(crate) fn cancel_start_call(&self, owner_id: &str, call_id: u64) {
        let transfers = self.registry.cancel_start(owner_id, call_id);
        if transfers.is_empty() {
            return;
        }
        for transfer in transfers {
            tokio::spawn(cleanup_transfer(transfer));
        }
    }

    pub(crate) fn confirm_start_call(&self, owner_id: &str, call_id: u64) {
        self.registry.confirm_start(owner_id, call_id);
    }

    fn expire(
        &self,
        transfer_id: String,
        transfer: Transfer,
        expiry_cancelled: oneshot::Receiver<()>,
    ) {
        let registry = self.registry.clone();
        tokio::spawn(async move {
            tokio::select! {
                biased;
                _ = expiry_cancelled => {}
                () = tokio::time::sleep(DOWNLOAD_SESSION_TTL) => {
                    if let Some(expired) = registry.expire(&transfer_id, &transfer) {
                        cleanup_transfer(expired).await;
                    }
                }
            }
        });
    }
}

async fn cleanup_transfer(cleanup: registry::TransferCleanup) {
    cleanup.cleanup().await;
}

async fn cleanup_transfer_path(transfer: &Transfer) {
    transfer.cancel();
    let mut retry_delay = CLEANUP_RETRY_INITIAL;
    loop {
        if transfer.cleanup().await.is_ok() {
            return;
        }
        tokio::time::sleep(retry_delay).await;
        retry_delay = retry_delay.saturating_mul(2).min(CLEANUP_RETRY_MAX);
    }
}

fn is_terminal_operation_error(error: &LocalDownloadError) -> bool {
    matches!(
        error,
        LocalDownloadError::Cancelled | LocalDownloadError::Io(_)
    )
}

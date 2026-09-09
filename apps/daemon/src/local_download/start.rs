use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use tokio::fs::OpenOptions;
use tokio::sync::oneshot;

use super::file_transfer::FileTransfer;
use super::folder_transfer::FolderTransfer;
use super::input::{
    destination_exists_error, ensure_not_cancelled, path_exists, path_string, random_uuid,
    sibling_transfer_path,
};
use super::registry::{Reservation, ReservationError, Transfer};
use super::{
    LocalDownloadAuthority, LocalDownloadError, LocalDownloadSession, cleanup_transfer_path,
    filename,
};

const UNIQUE_DESTINATION_ATTEMPTS: usize = 10_000;

impl LocalDownloadAuthority {
    pub(super) async fn start_file_transaction(
        &self,
        owner_id: String,
        suggested_name: String,
        cancelled: Arc<AtomicBool>,
        start_call_id: u64,
    ) -> Result<LocalDownloadSession, LocalDownloadError> {
        ensure_not_cancelled(&cancelled)?;
        tokio::fs::create_dir_all(&self.downloads_path).await?;
        let mut reservation = self
            .reserve_unique_destination(
                &owner_id,
                &suggested_name,
                cancelled.clone(),
                start_call_id,
            )
            .await?;
        let transfer_id = reservation.transfer_id().to_owned();
        let destination_path = reservation.destination_path().to_owned();
        let destination_path_text = path_string(&destination_path)?;
        let temp_path = sibling_transfer_path(&destination_path, &transfer_id);
        let file = match OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)
            .await
        {
            Ok(file) => file,
            Err(error) => return Err(LocalDownloadError::Io(error)),
        };
        let transfer = Arc::new(FileTransfer::new(
            owner_id,
            destination_path,
            destination_path_text.clone(),
            temp_path,
            file,
        ));
        let registered = Transfer::File(transfer.clone());
        let (expiry_cancel, expiry_cancelled) = oneshot::channel();
        if let Err(error) = ensure_not_cancelled(&cancelled)
            .and_then(|()| reservation.commit(registered.clone(), expiry_cancel))
        {
            tokio::spawn(async move {
                cleanup_transfer_path(&registered).await;
                drop(reservation);
            });
            return Err(error);
        }
        self.expire(transfer_id.clone(), registered, expiry_cancelled);
        Ok(LocalDownloadSession {
            destination_path: destination_path_text,
            transfer_id,
        })
    }

    pub(super) async fn start_folder_transaction(
        &self,
        owner_id: String,
        suggested_name: String,
        cancelled: Arc<AtomicBool>,
        start_call_id: u64,
    ) -> Result<LocalDownloadSession, LocalDownloadError> {
        ensure_not_cancelled(&cancelled)?;
        tokio::fs::create_dir_all(&self.downloads_path).await?;
        let mut reservation = self
            .reserve_folder_destination(
                &owner_id,
                &suggested_name,
                cancelled.clone(),
                start_call_id,
            )
            .await?;
        let transfer_id = reservation.transfer_id().to_owned();
        let destination_path = reservation.destination_path().to_owned();
        let destination_path_text = path_string(&destination_path)?;
        let temp_path = sibling_transfer_path(&destination_path, &transfer_id);
        if let Err(error) = tokio::fs::create_dir(&temp_path).await {
            return Err(LocalDownloadError::Io(error));
        }
        let transfer = Arc::new(FolderTransfer::new(
            owner_id,
            destination_path,
            destination_path_text.clone(),
            temp_path,
        ));
        let registered = Transfer::Folder(transfer.clone());
        let (expiry_cancel, expiry_cancelled) = oneshot::channel();
        if let Err(error) = ensure_not_cancelled(&cancelled)
            .and_then(|()| reservation.commit(registered.clone(), expiry_cancel))
        {
            tokio::spawn(async move {
                cleanup_transfer_path(&registered).await;
                drop(reservation);
            });
            return Err(error);
        }
        self.expire(transfer_id.clone(), registered, expiry_cancelled);
        Ok(LocalDownloadSession {
            destination_path: destination_path_text,
            transfer_id,
        })
    }

    async fn reserve_unique_destination(
        &self,
        owner_id: &str,
        suggested_name: &str,
        cancelled: Arc<AtomicBool>,
        start_call_id: u64,
    ) -> Result<Reservation, LocalDownloadError> {
        let sanitized = filename::sanitize(suggested_name);
        let suggested_path = Path::new(&sanitized);
        let extension = suggested_path
            .extension()
            .map(|extension| format!(".{}", extension.to_string_lossy()))
            .unwrap_or_default();
        let stem = suggested_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy();
        for suffix in 0..UNIQUE_DESTINATION_ATTEMPTS {
            ensure_not_cancelled(&cancelled)?;
            let filename = if suffix == 0 {
                sanitized.clone()
            } else {
                format!("{stem} ({suffix}){extension}")
            };
            let destination_path = self.downloads_path.join(filename);
            if path_exists(&destination_path).await? {
                continue;
            }
            match self.reserve(owner_id, destination_path, cancelled.clone(), start_call_id)? {
                Some(reservation) => return Ok(reservation),
                None => continue,
            }
        }
        Err(LocalDownloadError::ResourceExhausted)
    }

    async fn reserve_folder_destination(
        &self,
        owner_id: &str,
        suggested_name: &str,
        cancelled: Arc<AtomicBool>,
        start_call_id: u64,
    ) -> Result<Reservation, LocalDownloadError> {
        let destination_path = self.downloads_path.join(filename::sanitize(suggested_name));
        if path_exists(&destination_path).await? {
            return Err(destination_exists_error());
        }
        self.reserve(owner_id, destination_path, cancelled, start_call_id)?
            .ok_or_else(destination_exists_error)
    }

    fn reserve(
        &self,
        owner_id: &str,
        destination_path: PathBuf,
        cancelled: Arc<AtomicBool>,
        start_call_id: u64,
    ) -> Result<Option<Reservation>, LocalDownloadError> {
        path_string(&destination_path)?;
        for _ in 0..UNIQUE_DESTINATION_ATTEMPTS {
            let transfer_id = random_uuid()?;
            match self.registry.reserve(
                transfer_id,
                owner_id,
                destination_path.clone(),
                cancelled.clone(),
                start_call_id,
            ) {
                Ok(reservation) => return Ok(Some(reservation)),
                Err(ReservationError::TransferIdUnavailable) => continue,
                Err(ReservationError::DestinationUnavailable) => return Ok(None),
                Err(ReservationError::Capacity) => {
                    return Err(LocalDownloadError::ResourceExhausted);
                }
            }
        }
        Err(LocalDownloadError::ResourceExhausted)
    }
}

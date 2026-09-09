use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::oneshot;

use super::LocalDownloadError;
use super::file_transfer::FileTransfer;
use super::folder_transfer::FolderTransfer;

const MAX_ACTIVE_TRANSFERS: usize = 256;
const MAX_ACTIVE_TRANSFERS_PER_OWNER: usize = 32;

#[derive(Clone)]
pub(super) struct TransferRegistry {
    inner: Arc<Mutex<RegistryState>>,
}

#[derive(Clone)]
pub(super) enum Transfer {
    File(Arc<FileTransfer>),
    Folder(Arc<FolderTransfer>),
}

pub(super) struct TransferCleanup {
    registry: TransferRegistry,
    transfer: Option<Transfer>,
    transfer_id: String,
}

pub(super) enum ReservationError {
    Capacity,
    DestinationUnavailable,
    TransferIdUnavailable,
}

pub(super) struct Reservation {
    destination_path: PathBuf,
    is_active: bool,
    registry: TransferRegistry,
    transfer_id: String,
}

struct RegistryState {
    cleanups: HashMap<String, PendingCleanup>,
    destinations: HashMap<PathBuf, String>,
    reservations: HashMap<String, PendingTransfer>,
    transfers: HashMap<String, RegisteredTransfer>,
}

struct PendingCleanup {
    destination_path: PathBuf,
    owner_id: String,
}

struct PendingTransfer {
    cancelled: Arc<AtomicBool>,
    destination_path: PathBuf,
    owner_id: String,
    start_call_id: u64,
}

struct RegisteredTransfer {
    expiry_cancel: oneshot::Sender<()>,
    start_call_id: Option<u64>,
    transfer: Transfer,
}

impl TransferRegistry {
    pub(super) fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(RegistryState {
                cleanups: HashMap::new(),
                destinations: HashMap::new(),
                reservations: HashMap::new(),
                transfers: HashMap::new(),
            })),
        }
    }

    pub(super) fn reserve(
        &self,
        transfer_id: String,
        owner_id: &str,
        destination_path: PathBuf,
        cancelled: Arc<AtomicBool>,
        start_call_id: u64,
    ) -> Result<Reservation, ReservationError> {
        let mut state = lock_state(&self.inner);
        if state.transfers.contains_key(&transfer_id)
            || state.reservations.contains_key(&transfer_id)
            || state.cleanups.contains_key(&transfer_id)
        {
            return Err(ReservationError::TransferIdUnavailable);
        }
        if state.destinations.contains_key(&destination_path) {
            return Err(ReservationError::DestinationUnavailable);
        }
        let active_count = state.transfers.len() + state.reservations.len() + state.cleanups.len();
        let owner_count = state
            .transfers
            .values()
            .filter(|registered| registered.transfer.owner_id() == owner_id)
            .count()
            + state
                .reservations
                .values()
                .filter(|reservation| reservation.owner_id == owner_id)
                .count()
            + state
                .cleanups
                .values()
                .filter(|cleanup| cleanup.owner_id == owner_id)
                .count();
        if active_count >= MAX_ACTIVE_TRANSFERS || owner_count >= MAX_ACTIVE_TRANSFERS_PER_OWNER {
            return Err(ReservationError::Capacity);
        }
        state
            .destinations
            .insert(destination_path.clone(), transfer_id.clone());
        state.reservations.insert(
            transfer_id.clone(),
            PendingTransfer {
                cancelled,
                destination_path: destination_path.clone(),
                owner_id: owner_id.to_owned(),
                start_call_id,
            },
        );
        Ok(Reservation {
            destination_path,
            is_active: true,
            registry: self.clone(),
            transfer_id,
        })
    }

    pub(super) fn file(
        &self,
        owner_id: &str,
        transfer_id: &str,
    ) -> Result<Arc<FileTransfer>, LocalDownloadError> {
        match self.transfer(transfer_id) {
            Some(Transfer::File(transfer)) if transfer.owner_id() == owner_id => Ok(transfer),
            _ => Err(LocalDownloadError::SessionNotFound),
        }
    }

    pub(super) fn folder(
        &self,
        owner_id: &str,
        transfer_id: &str,
    ) -> Result<Arc<FolderTransfer>, LocalDownloadError> {
        match self.transfer(transfer_id) {
            Some(Transfer::Folder(transfer)) if transfer.owner_id() == owner_id => Ok(transfer),
            _ => Err(LocalDownloadError::SessionNotFound),
        }
    }

    pub(super) fn remove_file(
        &self,
        transfer_id: &str,
        transfer: &Arc<FileTransfer>,
    ) -> Option<TransferCleanup> {
        self.remove_matching(transfer_id, |current| {
            matches!(current, Transfer::File(candidate) if Arc::ptr_eq(candidate, transfer))
        })
    }

    pub(super) fn remove_folder(
        &self,
        transfer_id: &str,
        transfer: &Arc<FolderTransfer>,
    ) -> Option<TransferCleanup> {
        self.remove_matching(transfer_id, |current| {
            matches!(current, Transfer::Folder(candidate) if Arc::ptr_eq(candidate, transfer))
        })
    }

    pub(super) fn expire(&self, transfer_id: &str, transfer: &Transfer) -> Option<TransferCleanup> {
        self.remove_matching(transfer_id, |current| current.same_identity(transfer))
    }

    pub(super) fn take_owner(&self, owner_id: &str) -> Vec<TransferCleanup> {
        let mut state = lock_state(&self.inner);
        cancel_reservations(&mut state, |reservation| reservation.owner_id == owner_id);
        take_registered(self, &mut state, |registered| {
            registered.transfer.owner_id() == owner_id
        })
    }

    pub(super) fn cancel_start(&self, owner_id: &str, call_id: u64) -> Vec<TransferCleanup> {
        let mut state = lock_state(&self.inner);
        cancel_reservations(&mut state, |reservation| {
            reservation.owner_id == owner_id && reservation.start_call_id == call_id
        });
        take_registered(self, &mut state, |registered| {
            registered.transfer.owner_id() == owner_id && registered.start_call_id == Some(call_id)
        })
    }

    pub(super) fn confirm_start(&self, owner_id: &str, call_id: u64) {
        let mut state = lock_state(&self.inner);
        for registered in state.transfers.values_mut() {
            if registered.transfer.owner_id() == owner_id
                && registered.start_call_id == Some(call_id)
            {
                registered.start_call_id = None;
            }
        }
    }

    fn transfer(&self, transfer_id: &str) -> Option<Transfer> {
        lock_state(&self.inner)
            .transfers
            .get(transfer_id)
            .map(|registered| registered.transfer.clone())
    }

    fn remove_matching(
        &self,
        transfer_id: &str,
        predicate: impl FnOnce(&Transfer) -> bool,
    ) -> Option<TransferCleanup> {
        let mut state = lock_state(&self.inner);
        let registered = state.transfers.get(transfer_id)?;
        if !predicate(&registered.transfer) {
            return None;
        }
        let registered = state.transfers.remove(transfer_id)?;
        Some(begin_cleanup(
            self,
            &mut state,
            transfer_id.to_owned(),
            registered,
        ))
    }

    fn release_reservation(&self, transfer_id: &str) {
        let mut state = lock_state(&self.inner);
        let Some(reservation) = state.reservations.remove(transfer_id) else {
            return;
        };
        state.destinations.remove(&reservation.destination_path);
    }

    fn complete_reservation(
        &self,
        transfer_id: &str,
        transfer: Transfer,
        expiry_cancel: oneshot::Sender<()>,
    ) -> Result<(), LocalDownloadError> {
        let mut state = lock_state(&self.inner);
        let Some(reservation) = state.reservations.get(transfer_id) else {
            return Err(LocalDownloadError::Cancelled);
        };
        if reservation.cancelled.load(Ordering::Acquire) {
            return Err(LocalDownloadError::Cancelled);
        }
        if state.transfers.contains_key(transfer_id)
            || state.cleanups.contains_key(transfer_id)
            || reservation.owner_id != transfer.owner_id()
            || reservation.destination_path != transfer.destination_path()
        {
            return Err(LocalDownloadError::InvalidState);
        }
        let start_call_id = reservation.start_call_id;
        state.reservations.remove(transfer_id);
        state.transfers.insert(
            transfer_id.to_owned(),
            RegisteredTransfer {
                expiry_cancel,
                start_call_id: Some(start_call_id),
                transfer,
            },
        );
        Ok(())
    }

    fn finish_cleanup(&self, transfer_id: &str) {
        let mut state = lock_state(&self.inner);
        let Some(cleanup) = state.cleanups.remove(transfer_id) else {
            return;
        };
        if state
            .destinations
            .get(&cleanup.destination_path)
            .is_some_and(|reserved_by| reserved_by == transfer_id)
        {
            state.destinations.remove(&cleanup.destination_path);
        }
    }
}

impl Reservation {
    pub(super) fn destination_path(&self) -> &Path {
        &self.destination_path
    }

    pub(super) fn transfer_id(&self) -> &str {
        &self.transfer_id
    }

    pub(super) fn commit(
        &mut self,
        transfer: Transfer,
        expiry_cancel: oneshot::Sender<()>,
    ) -> Result<(), LocalDownloadError> {
        let result = self
            .registry
            .complete_reservation(&self.transfer_id, transfer, expiry_cancel);
        if result.is_ok() {
            self.is_active = false;
        }
        result
    }
}

impl Drop for Reservation {
    fn drop(&mut self) {
        if self.is_active {
            self.registry.release_reservation(&self.transfer_id);
        }
    }
}

impl Transfer {
    pub(super) fn cancel(&self) {
        match self {
            Self::File(transfer) => transfer.cancel(),
            Self::Folder(transfer) => transfer.cancel(),
        }
    }

    pub(super) async fn cleanup(&self) -> Result<(), std::io::Error> {
        match self {
            Self::File(transfer) => transfer.cleanup().await,
            Self::Folder(transfer) => transfer.cleanup().await,
        }
    }

    pub(super) fn owner_id(&self) -> &str {
        match self {
            Self::File(transfer) => transfer.owner_id(),
            Self::Folder(transfer) => transfer.owner_id(),
        }
    }

    pub(super) fn destination_path(&self) -> &Path {
        match self {
            Self::File(transfer) => transfer.destination_path(),
            Self::Folder(transfer) => transfer.destination_path(),
        }
    }

    fn same_identity(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::File(left), Self::File(right)) => Arc::ptr_eq(left, right),
            (Self::Folder(left), Self::Folder(right)) => Arc::ptr_eq(left, right),
            _ => false,
        }
    }
}

impl TransferCleanup {
    pub(super) async fn cleanup(mut self) {
        if let Some(transfer) = self.transfer.take() {
            super::cleanup_transfer_path(&transfer).await;
        }
        self.registry.finish_cleanup(&self.transfer_id);
    }

    pub(super) fn complete(mut self) {
        self.transfer = None;
        self.registry.finish_cleanup(&self.transfer_id);
    }
}

fn cancel_reservations(state: &mut RegistryState, predicate: impl Fn(&PendingTransfer) -> bool) {
    for reservation in state.reservations.values() {
        if predicate(reservation) {
            reservation.cancelled.store(true, Ordering::Release);
        }
    }
}

fn take_registered(
    registry: &TransferRegistry,
    state: &mut RegistryState,
    predicate: impl Fn(&RegisteredTransfer) -> bool,
) -> Vec<TransferCleanup> {
    let transfer_ids = state
        .transfers
        .iter()
        .filter_map(|(id, registered)| predicate(registered).then_some(id.clone()))
        .collect::<Vec<_>>();
    transfer_ids
        .into_iter()
        .filter_map(|transfer_id| {
            let registered = state.transfers.remove(&transfer_id)?;
            Some(begin_cleanup(registry, state, transfer_id, registered))
        })
        .collect()
}

fn begin_cleanup(
    registry: &TransferRegistry,
    state: &mut RegistryState,
    transfer_id: String,
    registered: RegisteredTransfer,
) -> TransferCleanup {
    registered.transfer.cancel();
    let destination_path = registered.transfer.destination_path().to_owned();
    let owner_id = registered.transfer.owner_id().to_owned();
    let _ = registered.expiry_cancel.send(());
    state.cleanups.insert(
        transfer_id.clone(),
        PendingCleanup {
            destination_path,
            owner_id,
        },
    );
    TransferCleanup {
        registry: registry.clone(),
        transfer: Some(registered.transfer),
        transfer_id,
    }
}

fn lock_state(state: &Mutex<RegistryState>) -> MutexGuard<'_, RegistryState> {
    state
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

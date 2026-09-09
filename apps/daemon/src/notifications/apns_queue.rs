use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard};

use thiserror::Error;
use tokio::sync::{Mutex as AsyncMutex, mpsc, oneshot};
use tokio::task::JoinHandle;

use super::apns::{ApnsNotification, ApnsPublisher};
use crate::mobile::{MobileDeviceStore, MobilePresence};
use crate::persistence::WorkspaceJournal;

const MAX_PENDING_PUSHES: usize = 256;
const QUEUE_CAPACITY: usize = MAX_PENDING_PUSHES + 1;

pub(crate) struct ApnsDelivery {
    pending: Arc<AtomicUsize>,
    state: Mutex<DeliveryState>,
    task: AsyncMutex<Option<JoinHandle<()>>>,
}

enum Command {
    Push(ApnsNotification),
    Shutdown(oneshot::Sender<()>),
}

struct DeliveryState {
    is_closed: bool,
    sender: mpsc::Sender<Command>,
}

#[derive(Debug, Error)]
pub(crate) enum ApnsDeliveryStartError {
    #[error("APNS HTTP client initialization failed: {0}")]
    Http(#[from] reqwest::Error),
}

impl ApnsDelivery {
    pub(crate) fn start(
        devices: MobileDeviceStore,
        presence: MobilePresence,
        journal: WorkspaceJournal,
        endpoint: Option<String>,
        token: Option<String>,
    ) -> Result<Self, ApnsDeliveryStartError> {
        let publisher = ApnsPublisher::new(devices, presence, journal, endpoint, token)?;
        let (sender, receiver) = mpsc::channel(QUEUE_CAPACITY);
        let pending = Arc::new(AtomicUsize::new(0));
        let task = tokio::spawn(run(receiver, pending.clone(), publisher));
        Ok(Self {
            pending,
            state: Mutex::new(DeliveryState {
                is_closed: false,
                sender,
            }),
            task: AsyncMutex::new(Some(task)),
        })
    }

    pub(crate) fn enqueue(&self, notification: ApnsNotification) -> bool {
        let state = lock(&self.state);
        if state.is_closed {
            return false;
        }
        if !reserve(&self.pending) {
            return false;
        }
        if state.sender.try_send(Command::Push(notification)).is_err() {
            self.pending.fetch_sub(1, Ordering::AcqRel);
            return false;
        }
        true
    }

    pub(crate) async fn shutdown(&self) {
        let (complete, completed) = oneshot::channel();
        let sent = {
            let mut state = lock(&self.state);
            if state.is_closed {
                false
            } else {
                state.is_closed = true;
                state.sender.try_send(Command::Shutdown(complete)).is_ok()
            }
        };
        if sent {
            let _ = completed.await;
        }
        if let Some(task) = self.task.lock().await.take() {
            let _ = task.await;
        }
    }
}

async fn run(
    mut receiver: mpsc::Receiver<Command>,
    pending: Arc<AtomicUsize>,
    publisher: ApnsPublisher,
) {
    while let Some(command) = receiver.recv().await {
        match command {
            Command::Push(notification) => {
                if let Err(error) = publisher.publish(&notification).await {
                    eprintln!("[daemon] APNS notification delivery failed: {error}");
                    publisher.record_failure(&notification, &error).await;
                }
                pending.fetch_sub(1, Ordering::AcqRel);
            }
            Command::Shutdown(complete) => {
                let _ = complete.send(());
                break;
            }
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn reserve(pending: &AtomicUsize) -> bool {
    pending
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
            (count < MAX_PENDING_PUSHES).then_some(count + 1)
        })
        .is_ok()
}

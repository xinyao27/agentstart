use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use tokio::sync::{mpsc, watch};

use super::super::RuntimeAuthorization;
use crate::transport::e2ee::E2EE_FRAME_OVERHEAD_BYTES;

const MAX_QUEUED_BYTES: usize = 8 * 1024 * 1024;
const MAX_QUEUED_MESSAGES: usize = 1_024;

pub(crate) struct RuntimeAuthenticatedChannel {
    pub(crate) authorization: RuntimeAuthorization,
    pub(crate) connection_id: String,
    pub(crate) incoming: mpsc::Receiver<Vec<u8>>,
    pub(crate) outgoing: RuntimeOutbound,
    pub(crate) peer_id: String,
}

#[derive(Clone)]
pub(crate) struct RuntimeOutbound {
    close: watch::Sender<Option<CloseRequest>>,
    queue: mpsc::Sender<QueuedFrame>,
    state: Arc<OutboundState>,
}

pub(super) struct OutboundReceiver {
    close: watch::Receiver<Option<CloseRequest>>,
    queue: mpsc::Receiver<QueuedFrame>,
    state: Arc<OutboundState>,
}

pub(super) enum OutboundEvent {
    Close(Option<CloseRequest>),
    Frame(Option<QueuedFrame>),
}

pub(super) struct QueuedFrame {
    pub(super) bytes: Vec<u8>,
    pub(super) wire_bytes: usize,
}

#[derive(Clone)]
pub(super) struct CloseRequest {
    pub(super) code: u16,
    pub(super) reason: String,
}

struct OutboundState {
    closed: AtomicBool,
    queued_bytes: AtomicUsize,
}

pub(super) fn outbound_channel() -> (RuntimeOutbound, OutboundReceiver) {
    let (queue, receiver) = mpsc::channel(MAX_QUEUED_MESSAGES);
    let (close, close_receiver) = watch::channel(None);
    let state = Arc::new(OutboundState {
        closed: AtomicBool::new(false),
        queued_bytes: AtomicUsize::new(0),
    });
    (
        RuntimeOutbound {
            close,
            queue,
            state: state.clone(),
        },
        OutboundReceiver {
            close: close_receiver,
            queue: receiver,
            state,
        },
    )
}

impl RuntimeOutbound {
    pub(crate) fn send_binary(&self, bytes: Vec<u8>) -> Result<(), ()> {
        if self.state.closed.load(Ordering::Acquire) {
            return Err(());
        }
        let wire_bytes = bytes
            .len()
            .checked_add(E2EE_FRAME_OVERHEAD_BYTES)
            .ok_or(())?;
        if !self.reserve(wire_bytes) {
            self.close(1011, "Runtime send backpressure exceeded");
            return Err(());
        }
        match self.queue.try_send(QueuedFrame { bytes, wire_bytes }) {
            Ok(()) => Ok(()),
            Err(_) => {
                self.state
                    .queued_bytes
                    .fetch_sub(wire_bytes, Ordering::AcqRel);
                self.close(1011, "Runtime send backpressure exceeded");
                Err(())
            }
        }
    }

    pub(crate) fn close(&self, code: u16, reason: impl Into<String>) {
        if !self.state.closed.swap(true, Ordering::AcqRel) {
            let _ = self.close.send(Some(CloseRequest {
                code,
                reason: reason.into(),
            }));
        }
    }

    fn reserve(&self, bytes: usize) -> bool {
        let mut current = self.state.queued_bytes.load(Ordering::Acquire);
        loop {
            let Some(next) = current.checked_add(bytes) else {
                return false;
            };
            if next > MAX_QUEUED_BYTES {
                return false;
            }
            match self.state.queued_bytes.compare_exchange_weak(
                current,
                next,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => return true,
                Err(observed) => current = observed,
            }
        }
    }
}

impl OutboundReceiver {
    pub(super) async fn next(&mut self) -> OutboundEvent {
        tokio::select! {
            biased;
            close = close_requested(&mut self.close) => OutboundEvent::Close(close),
            frame = self.queue.recv() => OutboundEvent::Frame(frame),
        }
    }

    pub(super) fn release(&self, bytes: usize) {
        self.state.queued_bytes.fetch_sub(bytes, Ordering::AcqRel);
    }

    pub(super) fn finish(&self) {
        self.state.closed.store(true, Ordering::Release);
        self.state.queued_bytes.store(0, Ordering::Release);
    }
}

async fn close_requested(
    close: &mut watch::Receiver<Option<CloseRequest>>,
) -> Option<CloseRequest> {
    if let Some(request) = close.borrow().clone() {
        return Some(request);
    }
    while close.changed().await.is_ok() {
        if let Some(request) = close.borrow().clone() {
            return Some(request);
        }
    }
    None
}

impl Drop for OutboundReceiver {
    fn drop(&mut self) {
        self.finish();
    }
}

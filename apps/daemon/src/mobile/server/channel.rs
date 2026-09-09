use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use thiserror::Error;
use tokio::sync::{mpsc, watch};

use crate::mobile::MobileAuthorization;
use crate::transport::e2ee::E2EE_FRAME_OVERHEAD_BYTES;

const MAX_QUEUED_BYTES: usize = 8 * 1024 * 1024;
const MAX_QUEUED_MESSAGES: usize = 1_024;

pub enum MobileRpcMessage {
    Binary(Vec<u8>),
}

pub struct MobileAuthenticatedChannel {
    pub authorization: MobileAuthorization,
    pub connection_id: String,
    pub device_id: String,
    pub incoming: mpsc::Receiver<MobileRpcMessage>,
    pub outgoing: MobileOutbound,
}

#[derive(Clone)]
pub struct MobileOutbound {
    close: watch::Sender<Option<CloseRequest>>,
    queue: mpsc::Sender<QueuedMessage>,
    state: Arc<OutboundState>,
}

pub(super) struct OutboundReceiver {
    close: watch::Receiver<Option<CloseRequest>>,
    queue: mpsc::Receiver<QueuedMessage>,
    state: Arc<OutboundState>,
}

pub(super) enum OutboundEvent {
    Close(Option<CloseRequest>),
    Message(Option<QueuedMessage>),
}

pub(super) struct QueuedMessage {
    pub(super) message: MobileRpcMessage,
    wire_bytes: usize,
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

#[derive(Debug, Error)]
pub enum MobileOutboundError {
    #[error("mobile socket backpressure limit exceeded")]
    Backpressure,
    #[error("mobile socket is closed")]
    Closed,
}

pub(super) fn outbound_channel() -> (MobileOutbound, OutboundReceiver) {
    let (queue, receiver) = mpsc::channel(MAX_QUEUED_MESSAGES);
    let (close, close_receiver) = watch::channel(None);
    let state = Arc::new(OutboundState {
        closed: AtomicBool::new(false),
        queued_bytes: AtomicUsize::new(0),
    });
    (
        MobileOutbound {
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

impl MobileOutbound {
    pub fn send_binary(&self, payload: Vec<u8>) -> Result<(), MobileOutboundError> {
        self.enqueue(MobileRpcMessage::Binary(payload))
    }

    pub fn close(&self, code: u16, reason: impl Into<String>) {
        self.request_close(CloseRequest {
            code,
            reason: reason.into(),
        });
    }

    fn enqueue(&self, message: MobileRpcMessage) -> Result<(), MobileOutboundError> {
        if self.state.closed.load(Ordering::Acquire) {
            return Err(MobileOutboundError::Closed);
        }
        let wire_bytes = wire_bytes(&message).ok_or(MobileOutboundError::Backpressure)?;
        if !self.reserve(wire_bytes) {
            self.request_close(CloseRequest {
                code: 1011,
                reason: "Mobile protocol send failed".to_owned(),
            });
            return Err(MobileOutboundError::Backpressure);
        }
        let result = self.queue.try_send(QueuedMessage {
            message,
            wire_bytes,
        });
        if let Err(error) = result {
            self.state
                .queued_bytes
                .fetch_sub(wire_bytes, Ordering::AcqRel);
            return match error {
                mpsc::error::TrySendError::Full(_) => {
                    self.request_close(CloseRequest {
                        code: 1011,
                        reason: "Mobile protocol send failed".to_owned(),
                    });
                    Err(MobileOutboundError::Backpressure)
                }
                mpsc::error::TrySendError::Closed(_) => Err(MobileOutboundError::Closed),
            };
        }
        Ok(())
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

    fn request_close(&self, request: CloseRequest) {
        if !self.state.closed.swap(true, Ordering::AcqRel) {
            let _ = self.close.send(Some(request));
        }
    }
}

impl OutboundReceiver {
    pub(super) async fn next(&mut self) -> OutboundEvent {
        tokio::select! {
            biased;
            close = close_requested(&mut self.close) => OutboundEvent::Close(close),
            message = self.queue.recv() => OutboundEvent::Message(message),
        }
    }

    pub(super) fn release(&self, wire_bytes: usize) {
        self.state
            .queued_bytes
            .fetch_sub(wire_bytes, Ordering::AcqRel);
    }

    pub(super) fn finish(&self) {
        self.state.closed.store(true, Ordering::Release);
        self.state.queued_bytes.store(0, Ordering::Release);
    }
}

impl QueuedMessage {
    pub(super) fn into_parts(self) -> (MobileRpcMessage, usize) {
        (self.message, self.wire_bytes)
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

fn wire_bytes(message: &MobileRpcMessage) -> Option<usize> {
    let MobileRpcMessage::Binary(payload) = message;
    payload.len().checked_add(E2EE_FRAME_OVERHEAD_BYTES)
}

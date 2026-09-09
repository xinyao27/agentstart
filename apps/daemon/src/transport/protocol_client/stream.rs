use std::marker::PhantomData;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use prost::Message;
use tokio::sync::{mpsc, oneshot};

use super::ProtocolPeerError;
use super::connection::ConsumedCredit;

pub struct RawProtocolStream {
    cancellation: CallCancellation,
    credit_tx: mpsc::Sender<ConsumedCredit>,
    item_rx: mpsc::Receiver<Result<Vec<u8>, ProtocolPeerError>>,
}

pub struct ProtocolStream<Response> {
    raw: RawProtocolStream,
    response: PhantomData<Response>,
}

impl RawProtocolStream {
    pub(super) fn new(
        call_id: u64,
        item_rx: mpsc::Receiver<Result<Vec<u8>, ProtocolPeerError>>,
        cancel_tx: mpsc::UnboundedSender<u64>,
        credit_tx: mpsc::Sender<ConsumedCredit>,
        completion: CallCompletion,
    ) -> Self {
        Self {
            cancellation: CallCancellation::active(call_id, cancel_tx, completion),
            credit_tx,
            item_rx,
        }
    }

    pub(super) fn call_id(&self) -> Result<u64, ProtocolPeerError> {
        self.cancellation.call_id()
    }

    pub async fn receive(&mut self) -> Result<Option<Vec<u8>>, ProtocolPeerError> {
        let credit_permit = self
            .credit_tx
            .reserve()
            .await
            .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        let Some(item) = self.item_rx.recv().await else {
            self.cancellation.disarm();
            return Ok(None);
        };
        let payload = match item {
            Ok(payload) => payload,
            Err(error) => {
                self.cancellation.disarm();
                return Err(error);
            }
        };
        let credit_bytes = u64::try_from(payload.len())
            .map_err(|_| ProtocolPeerError::Protocol("response_too_large"))?;
        let (restored_tx, restored_rx) = oneshot::channel();
        credit_permit.send(ConsumedCredit {
            call_id: self.cancellation.call_id()?,
            credit_bytes,
            restored_tx,
        });
        restored_rx
            .await
            .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        Ok(Some(payload))
    }

    pub fn cancel(mut self) -> Result<(), ProtocolPeerError> {
        self.cancellation.cancel()
    }
}

impl<Response> ProtocolStream<Response>
where
    Response: Message + Default,
{
    pub(super) fn new(raw: RawProtocolStream) -> Self {
        Self {
            raw,
            response: PhantomData,
        }
    }

    pub async fn receive(&mut self) -> Result<Option<Response>, ProtocolPeerError> {
        let Some(payload) = self.raw.receive().await? else {
            return Ok(None);
        };
        match Response::decode(payload.as_slice()) {
            Ok(response) => Ok(Some(response)),
            Err(_) => {
                self.raw.cancellation.cancel()?;
                Err(ProtocolPeerError::Protocol("stream_response_invalid"))
            }
        }
    }

    pub fn cancel(self) -> Result<(), ProtocolPeerError> {
        self.raw.cancel()
    }
}

pub(super) struct CallCancellation {
    call_id: Option<u64>,
    cancel_tx: mpsc::UnboundedSender<u64>,
    completion: CallCompletion,
}

#[derive(Clone)]
pub(super) struct CallCompletion {
    is_finished: Arc<AtomicBool>,
}

impl CallCompletion {
    pub(super) fn new() -> Self {
        Self {
            is_finished: Arc::new(AtomicBool::new(false)),
        }
    }

    pub(super) fn finish(&self) -> bool {
        !self.is_finished.swap(true, Ordering::AcqRel)
    }
}

impl CallCancellation {
    pub(super) fn pending(cancel_tx: mpsc::UnboundedSender<u64>) -> Self {
        Self {
            call_id: None,
            cancel_tx,
            completion: CallCompletion::new(),
        }
    }

    fn active(
        call_id: u64,
        cancel_tx: mpsc::UnboundedSender<u64>,
        completion: CallCompletion,
    ) -> Self {
        Self {
            call_id: Some(call_id),
            cancel_tx,
            completion,
        }
    }

    pub(super) fn call_id(&self) -> Result<u64, ProtocolPeerError> {
        self.call_id
            .ok_or(ProtocolPeerError::Protocol("call_not_active"))
    }

    pub(super) fn disarm(&mut self) {
        self.call_id = None;
        self.completion.finish();
    }

    pub(super) fn activate(&mut self, call_id: u64) {
        self.call_id = Some(call_id);
    }

    fn cancel(&mut self) -> Result<(), ProtocolPeerError> {
        if let Some(call_id) = self.call_id.take()
            && self.completion.finish()
        {
            self.cancel_tx
                .send(call_id)
                .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        }
        Ok(())
    }
}

impl Drop for CallCancellation {
    fn drop(&mut self) {
        if let Some(call_id) = self.call_id.take()
            && self.completion.finish()
        {
            // Why: the receiver closes only after the connection marks every call finished.
            let _ = self.cancel_tx.send(call_id);
        }
    }
}

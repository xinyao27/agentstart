use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{Semaphore, oneshot, watch};
use tokio::time::{Instant, timeout_at};
use yiru_protocol::method_metadata::MethodMetadata;

use super::connection::ClientCommand;
use super::{ProtocolClient, ProtocolPeerError, RawProtocolStream, call_deadline, deadline_error};

pub struct RawDuplexWriter {
    closed: watch::Receiver<bool>,
    call_id: u64,
    client: ProtocolClient,
    credit: Arc<Semaphore>,
    deadline: Instant,
    ended: bool,
}

pub(super) struct DuplexCredit {
    pub(super) credit: Arc<Semaphore>,
    closed: watch::Sender<bool>,
}

impl Drop for DuplexCredit {
    fn drop(&mut self) {
        self.credit.close();
        self.closed.send_replace(true);
    }
}

impl ProtocolClient {
    pub(crate) async fn duplex_raw(
        &self,
        metadata: &'static MethodMetadata,
        payload: Vec<u8>,
        call_timeout: Duration,
    ) -> Result<(RawDuplexWriter, RawProtocolStream), ProtocolPeerError> {
        if !metadata.client_streaming || !metadata.server_streaming {
            return Err(ProtocolPeerError::Protocol("duplex_method_required"));
        }
        let deadline = call_deadline(call_timeout)?;
        let credit = Arc::new(Semaphore::new(0));
        let (closed_tx, closed) = watch::channel(false);
        let stream = self
            .open_stream(
                metadata,
                payload,
                call_timeout,
                Some(DuplexCredit {
                    credit: credit.clone(),
                    closed: closed_tx,
                }),
            )
            .await?;
        let writer = RawDuplexWriter {
            closed,
            call_id: stream.call_id()?,
            client: self.clone(),
            credit,
            deadline,
            ended: false,
        };
        Ok((writer, stream))
    }
}

impl RawDuplexWriter {
    pub async fn send(&mut self, payload: Vec<u8>) -> Result<(), ProtocolPeerError> {
        if self.ended || payload.len() > self.client.max_request_bytes {
            return Err(ProtocolPeerError::Protocol("duplex_payload_invalid"));
        }
        if *self.closed.borrow() {
            return Err(cancelled());
        }
        tokio::select! {
            biased;
            _ = self.closed.changed() => Err(cancelled()),
            result = send_payload(&self.client, &self.credit, self.call_id, self.deadline, payload) => result,
        }
    }

    pub async fn end(&mut self) -> Result<(), ProtocolPeerError> {
        if self.ended {
            return Err(ProtocolPeerError::Protocol("duplex_already_ended"));
        }
        self.ended = true;
        let (completion_tx, completion_rx) = oneshot::channel();
        timeout_at(
            self.deadline,
            self.client.command_tx.send(ClientCommand::DuplexEnd {
                call_id: self.call_id,
                completion_tx,
            }),
        )
        .await
        .map_err(|_| deadline_error())?
        .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        completion_rx
            .await
            .map_err(|_| ProtocolPeerError::ConnectionFailed)?
    }
}

async fn send_payload(
    client: &ProtocolClient,
    credit_window: &Arc<Semaphore>,
    call_id: u64,
    deadline: Instant,
    payload: Vec<u8>,
) -> Result<(), ProtocolPeerError> {
    let bytes = u32::try_from(payload.len())
        .map_err(|_| ProtocolPeerError::Protocol("request_too_large"))?;
    let credit = timeout_at(deadline, credit_window.clone().acquire_many_owned(bytes))
        .await
        .map_err(|_| deadline_error())?
        .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
    let budget = client
        .reserve_request_budget(payload.len(), deadline)
        .await?;
    let outbound = client.outbound.reserve_request(deadline).await?;
    let (completion_tx, completion_rx) = oneshot::channel();
    let command = ClientCommand::DuplexPayload {
        call_id,
        payload,
        budget,
        outbound,
        completion_tx,
    };
    timeout_at(deadline, client.command_tx.send(command))
        .await
        .map_err(|_| deadline_error())?
        .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
    // Why: admission transfers ownership to the connection even if this future is cancelled.
    credit.forget();
    completion_rx
        .await
        .map_err(|_| ProtocolPeerError::ConnectionFailed)?
}

fn cancelled() -> ProtocolPeerError {
    ProtocolPeerError::Remote(super::StatusDisplay(super::protocol_status(
        yiru_protocol::protocol::v1::StatusCode::Cancelled,
        "Duplex call ended",
    )))
}

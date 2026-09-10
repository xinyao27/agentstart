use std::sync::atomic::{AtomicUsize, Ordering};

use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    TerminalMultiplexReady, TerminalServiceMultiplexEvent, TerminalServiceMultiplexRequest,
    terminal_service_multiplex_event, terminal_service_multiplex_request,
};
use agentstart_protocol::transport::{decode, encode};
use tokio::sync::watch;

use super::*;
use crate::rpc::protocol_call::{ProtocolCallContext, status};

const QUEUED_BYTES: usize = 4 * 1024 * 1024;

pub(super) struct Input<'a>(&'a ProtocolCallContext);

impl Input<'_> {
    pub(super) async fn receive(&self) -> Result<Option<Vec<u8>>, SessionError> {
        let Some(payload) = self
            .0
            .receive_duplex_payload()
            .await
            .map_err(protocol_error)?
        else {
            return Ok(None);
        };
        let request =
            decode::<TerminalServiceMultiplexRequest>(&payload).map_err(protocol_error)?;
        match request.content {
            Some(terminal_service_multiplex_request::Content::Frame(frame)) => Ok(Some(frame)),
            _ => Err(SessionError::Protocol(
                "Terminal duplex input must contain a frame".to_owned(),
            )),
        }
    }
}

pub(super) struct Output {
    sender: mpsc::Sender<QueuedFrame>,
    queued: Arc<AtomicUsize>,
    close: watch::Sender<Option<String>>,
}

pub(super) struct QueuedFrame {
    event: Option<TerminalServiceMultiplexEvent>,
    bytes: usize,
    queued: Arc<AtomicUsize>,
}

impl Drop for QueuedFrame {
    fn drop(&mut self) {
        self.queued.fetch_sub(self.bytes, Ordering::AcqRel);
    }
}

impl Output {
    pub(super) fn buffered_bytes(&self) -> usize {
        self.queued.load(Ordering::Acquire)
    }

    pub(super) fn close(&self, _code: u16, reason: &str) {
        self.close.send_replace(Some(reason.to_owned()));
    }

    pub(super) async fn ready(&self) -> Result<(), SessionError> {
        self.enqueue(
            terminal_service_multiplex_event::Content::Ready(TerminalMultiplexReady {}),
            0,
        )
    }

    pub(super) fn send_binary(&self, frame: &[u8]) -> Result<(), SessionError> {
        self.enqueue(
            terminal_service_multiplex_event::Content::Frame(frame.to_vec()),
            frame.len(),
        )
    }

    fn enqueue(
        &self,
        content: terminal_service_multiplex_event::Content,
        bytes: usize,
    ) -> Result<(), SessionError> {
        let Self { sender, queued, .. } = self;
        if queued
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
                current
                    .checked_add(bytes)
                    .filter(|value| *value <= QUEUED_BYTES)
            })
            .is_err()
        {
            return Err(SessionError::TerminalDuplexUnavailable);
        }
        sender
            .try_send(QueuedFrame {
                event: Some(TerminalServiceMultiplexEvent {
                    content: Some(content),
                }),
                bytes,
                queued: queued.clone(),
            })
            .map_err(|_| SessionError::TerminalDuplexUnavailable)
    }
}

pub(in crate::rpc::terminal) async fn run_protocol(
    authority: TerminalSessionAuthority,
    connection_id: String,
    request_id: String,
    context: &ProtocolCallContext,
    mut admission_close: watch::Receiver<Option<crate::terminal_session::TerminalMultiplexClose>>,
) -> Result<(), Status> {
    let (sender, mut receiver) = mpsc::channel::<QueuedFrame>(256);
    let (close, mut closed) = watch::channel(None::<String>);
    let output = Output {
        sender,
        queued: Arc::new(AtomicUsize::new(0)),
        close,
    };
    let lane = if context.peer_kind() == agentstart_protocol::protocol::v1::PeerKind::IosApp {
        "mobile"
    } else {
        "runtime"
    };
    let run = super::run_session(
        authority,
        connection_id,
        request_id,
        Input(context),
        output,
        lane,
    );
    let forward = async {
        while let Some(mut frame) = receiver.recv().await {
            if let Some(event) = frame.event.take() {
                context.send_stream_payload(encode(&event)).await?;
            }
        }
        Ok::<(), Status>(())
    };
    tokio::select! {
        result = run => result.map_err(|error| status(StatusCode::Internal, &error.to_string())),
        result = forward => result,
        _ = closed.changed() => Err(status(StatusCode::FailedPrecondition, closed.borrow().as_deref().unwrap_or("Terminal duplex closed"))),
        _ = admission_close.changed() => Err(status(StatusCode::Cancelled, "Terminal duplex ownership changed")),
    }
}

fn protocol_error(error: Status) -> SessionError {
    SessionError::Protocol(error.message)
}

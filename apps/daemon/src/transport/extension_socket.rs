use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, close_code};
use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, watch};
use tokio::time::timeout;
use yiru_protocol::protocol::v1::PeerKind;

use crate::rpc::AuthenticatedChannel;
use crate::rpc::channel::{ExtensionOutboundEvent, RpcMessage, extension_outbound_channel};

pub(super) const MAX_INBOUND_MESSAGE_BYTES: usize = 1024 * 1024;
pub(super) const MAX_OUTBOUND_BACKPRESSURE_BYTES: usize = 4 * 1024 * 1024;
const INCOMING_FRAME_CAPACITY: usize = 16;
const SOCKET_CLOSE_TIMEOUT: Duration = Duration::from_secs(2);
const SOCKET_SEND_TIMEOUT: Duration = Duration::from_secs(10);

pub(super) async fn run_socket(
    socket: WebSocket,
    accepted: mpsc::Sender<AuthenticatedChannel>,
    mut socket_shutdown: watch::Receiver<bool>,
    peer_kind: PeerKind,
) {
    let (incoming_tx, incoming) = mpsc::channel(INCOMING_FRAME_CAPACITY);
    let (outgoing, mut outgoing_rx) = extension_outbound_channel();
    let channel = AuthenticatedChannel::extension(incoming, outgoing, peer_kind);
    let (mut sink, mut stream) = socket.split();
    let accepted_result = tokio::select! {
        biased;
        () = shutdown_requested(&mut socket_shutdown) => {
            close_sink(&mut sink, close_code::AWAY, "Daemon shutting down").await;
            return;
        }
        result = accepted.send(channel) => result,
    };
    drop(accepted);
    if accepted_result.is_err() {
        close_sink(&mut sink, close_code::ERROR, "Runtime peer unavailable").await;
        return;
    }

    let mut pending_incoming = None;
    loop {
        let event = tokio::select! {
            biased;
            () = shutdown_requested(&mut socket_shutdown) => ConnectionEvent::Shutdown,
            outgoing = outgoing_rx.next() => ConnectionEvent::Outbound(outgoing),
            permit = incoming_tx.clone().reserve_owned(), if pending_incoming.is_some() => {
                match permit {
                    Ok(permit) => {
                        if let Some(frame) = pending_incoming.take() { permit.send(frame); }
                        continue;
                    }
                    Err(_) => break,
                }
            }
            incoming = stream.next(), if pending_incoming.is_none() => ConnectionEvent::Incoming(incoming),
        };
        let keep_running = match event {
            ConnectionEvent::Shutdown => {
                close_sink(&mut sink, close_code::AWAY, "Daemon shutting down").await;
                false
            }
            ConnectionEvent::Incoming(message) => {
                handle_incoming(
                    message,
                    &incoming_tx,
                    &mut sink,
                    &mut socket_shutdown,
                    &mut pending_incoming,
                )
                .await
            }
            ConnectionEvent::Outbound(event) => {
                handle_outgoing(event, &mut sink, &mut socket_shutdown).await
            }
        };
        if !keep_running {
            break;
        }
    }
}

enum ConnectionEvent {
    Incoming(Option<Result<Message, axum::Error>>),
    Outbound(ExtensionOutboundEvent),
    Shutdown,
}

async fn handle_incoming(
    message: Option<Result<Message, axum::Error>>,
    incoming_tx: &mpsc::Sender<RpcMessage>,
    sink: &mut SplitSink<WebSocket, Message>,
    shutdown: &mut watch::Receiver<bool>,
    pending_incoming: &mut Option<RpcMessage>,
) -> bool {
    let decoded = match message {
        Some(Ok(Message::Text(frame))) => decode_text(frame.as_str()),
        Some(Ok(Message::Binary(frame))) => decode_binary(&frame),
        Some(Ok(Message::Ping(payload))) => {
            return match send_message(sink, Message::Pong(payload), shutdown).await {
                SendOutcome::Sent => true,
                SendOutcome::Failed => false,
                SendOutcome::Shutdown => {
                    close_sink(sink, close_code::AWAY, "Daemon shutting down").await;
                    false
                }
            };
        }
        Some(Ok(Message::Pong(_))) => return true,
        Some(Ok(Message::Close(_))) | None | Some(Err(_)) => return false,
    };
    match incoming_tx.try_send(decoded) {
        Ok(()) => true,
        Err(mpsc::error::TrySendError::Full(frame)) => {
            // Why: a full ingress queue must not stall outgoing credit or shutdown.
            *pending_incoming = Some(frame);
            true
        }
        Err(mpsc::error::TrySendError::Closed(_)) => {
            close_sink(sink, close_code::ERROR, "Runtime peer unavailable").await;
            false
        }
    }
}

async fn handle_outgoing(
    event: ExtensionOutboundEvent,
    sink: &mut SplitSink<WebSocket, Message>,
    shutdown: &mut watch::Receiver<bool>,
) -> bool {
    // Why: the queued message holds the outbound backpressure reservation until it drops, so it
    // stays alive across the send rather than being unwrapped early.
    let mut queued = match event {
        ExtensionOutboundEvent::Close(Some(request)) => {
            close_sink(sink, request.code, &request.reason).await;
            return false;
        }
        ExtensionOutboundEvent::Close(None) => {
            close_sink(sink, close_code::ERROR, "Runtime peer unavailable").await;
            return false;
        }
        ExtensionOutboundEvent::Message(queued) => queued,
    };
    let Some(message) = queued.take_message().and_then(encode_outbound) else {
        close_sink(sink, close_code::ERROR, "Runtime send failed").await;
        return false;
    };
    match send_message(sink, message, shutdown).await {
        SendOutcome::Sent => true,
        SendOutcome::Failed => {
            close_sink(sink, close_code::ERROR, "Runtime send failed").await;
            false
        }
        SendOutcome::Shutdown => {
            close_sink(sink, close_code::AWAY, "Daemon shutting down").await;
            false
        }
    }
}

fn decode_text(frame: &str) -> RpcMessage {
    RpcMessage::Text(frame.to_owned())
}

fn decode_binary(frame: &[u8]) -> RpcMessage {
    RpcMessage::Binary(frame.to_vec())
}

fn encode_outbound(message: RpcMessage) -> Option<Message> {
    match message {
        RpcMessage::Binary(bytes) => Some(Message::Binary(bytes.into())),
        RpcMessage::Text(text) => Some(Message::Text(text.into())),
    }
}

enum SendOutcome {
    Failed,
    Sent,
    Shutdown,
}

async fn send_message(
    sink: &mut SplitSink<WebSocket, Message>,
    message: Message,
    shutdown: &mut watch::Receiver<bool>,
) -> SendOutcome {
    tokio::select! {
        biased;
        () = shutdown_requested(shutdown) => SendOutcome::Shutdown,
        result = timeout(SOCKET_SEND_TIMEOUT, sink.send(message)) => match result {
            Ok(Ok(())) => SendOutcome::Sent,
            Ok(Err(_)) | Err(_) => SendOutcome::Failed,
        },
    }
}

async fn shutdown_requested(shutdown: &mut watch::Receiver<bool>) {
    if *shutdown.borrow() {
        return;
    }
    while shutdown.changed().await.is_ok() {
        if *shutdown.borrow() {
            return;
        }
    }
}

async fn close_sink(sink: &mut SplitSink<WebSocket, Message>, code: u16, reason: &str) {
    let _ = timeout(SOCKET_CLOSE_TIMEOUT, async {
        let _ = sink
            .send(Message::Close(Some(CloseFrame {
                code,
                reason: reason.into(),
            })))
            .await;
        let _ = sink.close().await;
    })
    .await;
}

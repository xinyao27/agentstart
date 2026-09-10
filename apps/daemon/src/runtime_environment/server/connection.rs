use std::time::Duration;

use agentstart_protocol::transport::has_frame_preamble;
use axum::extract::ws::{CloseFrame, Message, WebSocket, close_code};
use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{OwnedSemaphorePermit, watch};
use tokio::time::timeout;

use super::RuntimeAdmissionState;
use super::channel::OutboundEvent;
use super::establishment::{EstablishedRuntimeConnection, EstablishmentFailure, establish};

const MAX_AGENTSTART_FRAME_BYTES: usize = 1024 * 1024;
const ESTABLISHMENT_TIMEOUT: Duration = Duration::from_secs(15);
const SOCKET_CLOSE_TIMEOUT: Duration = Duration::from_secs(2);
const SOCKET_SEND_TIMEOUT: Duration = Duration::from_secs(10);

pub(super) async fn run_socket(
    mut socket: WebSocket,
    state: RuntimeAdmissionState,
    pending_handshake: OwnedSemaphorePermit,
) {
    let mut shutdown = state.shutdown.subscribe();
    let connection_id = match random_connection_id() {
        Ok(id) => id,
        Err(()) => {
            close_socket(&mut socket, close_code::ERROR, "Runtime connection failed").await;
            return;
        }
    };
    let establishment = timeout(
        ESTABLISHMENT_TIMEOUT,
        establish(&mut socket, &state, &mut shutdown, connection_id),
    )
    .await;
    drop(pending_handshake);
    match establishment {
        Ok(Ok(connection)) => run_authenticated(socket, shutdown, connection).await,
        Ok(Err(EstablishmentFailure::Capacity)) => {
            close_socket(&mut socket, 1013, "Runtime connection capacity reached").await;
        }
        Ok(Err(EstablishmentFailure::Shutdown)) => {
            close_socket(&mut socket, close_code::AWAY, "Daemon shutting down").await;
        }
        Ok(Err(EstablishmentFailure::Closed)) => {}
        Ok(Err(EstablishmentFailure::Internal)) => {
            close_socket(
                &mut socket,
                close_code::ERROR,
                "Runtime service unavailable",
            )
            .await;
        }
        Ok(Err(EstablishmentFailure::PeerUnavailable)) => {
            close_socket(&mut socket, close_code::ERROR, "Runtime peer unavailable").await;
        }
        Ok(Err(EstablishmentFailure::Invalid)) => {
            close_socket(
                &mut socket,
                close_code::UNSUPPORTED,
                "Invalid runtime message",
            )
            .await;
        }
        Ok(Err(EstablishmentFailure::Unauthorized)) => {
            close_socket(
                &mut socket,
                close_code::POLICY,
                "Runtime authorization rejected",
            )
            .await;
        }
        Err(_) => {
            close_socket(
                &mut socket,
                close_code::POLICY,
                "Runtime authentication timed out",
            )
            .await;
        }
    }
}

async fn run_authenticated(
    socket: WebSocket,
    mut shutdown: watch::Receiver<bool>,
    mut connection: EstablishedRuntimeConnection,
) {
    let (mut sink, mut stream) = socket.split();
    let mut pending_incoming = None;
    loop {
        let event = tokio::select! {
            biased;
            () = shutdown_requested(&mut shutdown) => ConnectionEvent::Shutdown,
            outbound = connection.outbound.next() => ConnectionEvent::Outbound(outbound),
            permit = connection.incoming.clone().reserve_owned(), if pending_incoming.is_some() => {
                match permit {
                    Ok(permit) => {
                        if let Some(frame) = pending_incoming.take() { permit.send(frame); }
                        continue;
                    }
                    Err(_) => break,
                }
            }
            message = stream.next(), if pending_incoming.is_none() => ConnectionEvent::Incoming(message),
        };
        let keep_running = match event {
            ConnectionEvent::Shutdown => {
                close_sink(&mut sink, close_code::AWAY, "Daemon shutting down").await;
                false
            }
            ConnectionEvent::Incoming(message) => {
                handle_incoming(
                    message,
                    &mut connection,
                    &mut sink,
                    &mut shutdown,
                    &mut pending_incoming,
                )
                .await
            }
            ConnectionEvent::Outbound(outbound) => {
                handle_outgoing(outbound, &mut connection, &mut sink, &mut shutdown).await
            }
        };
        if !keep_running {
            break;
        }
    }
    connection.outbound.finish();
}

enum ConnectionEvent {
    Incoming(Option<Result<Message, axum::Error>>),
    Outbound(OutboundEvent),
    Shutdown,
}

async fn handle_incoming(
    message: Option<Result<Message, axum::Error>>,
    connection: &mut EstablishedRuntimeConnection,
    sink: &mut SplitSink<WebSocket, Message>,
    shutdown: &mut watch::Receiver<bool>,
    pending_incoming: &mut Option<Vec<u8>>,
) -> bool {
    let plaintext = match message {
        Some(Ok(Message::Binary(frame))) => connection.session.open_binary(&frame).ok(),
        Some(Ok(Message::Ping(payload))) => {
            return matches!(
                send_message(sink, Message::Pong(payload), shutdown).await,
                SendOutcome::Sent
            );
        }
        Some(Ok(Message::Pong(_))) => return true,
        Some(Ok(Message::Text(_))) => None,
        Some(Ok(Message::Close(_))) | None | Some(Err(_)) => return false,
    };
    let Some(plaintext) = plaintext
        .filter(|bytes| bytes.len() <= MAX_AGENTSTART_FRAME_BYTES && has_frame_preamble(bytes))
    else {
        close_sink(
            sink,
            close_code::UNSUPPORTED,
            "Binary AgentStart frame required",
        )
        .await;
        return false;
    };
    match connection.incoming.try_send(plaintext) {
        Ok(()) => true,
        Err(tokio::sync::mpsc::error::TrySendError::Full(frame)) => {
            // Why: pause reads without blocking outbound credit and cancellation frames.
            *pending_incoming = Some(frame);
            true
        }
        Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => {
            close_sink(sink, close_code::ERROR, "Runtime peer unavailable").await;
            false
        }
    }
}

async fn handle_outgoing(
    event: OutboundEvent,
    connection: &mut EstablishedRuntimeConnection,
    sink: &mut SplitSink<WebSocket, Message>,
    shutdown: &mut watch::Receiver<bool>,
) -> bool {
    match event {
        OutboundEvent::Close(Some(request)) => {
            close_sink(sink, request.code, &request.reason).await;
            false
        }
        OutboundEvent::Close(None) | OutboundEvent::Frame(None) => {
            close_sink(sink, close_code::ERROR, "Runtime send failed").await;
            false
        }
        OutboundEvent::Frame(Some(frame)) => {
            let wire_bytes = frame.wire_bytes;
            let encrypted = connection.session.seal_binary(&frame.bytes);
            let outcome = match encrypted {
                Ok(encrypted) => {
                    send_message(sink, Message::Binary(encrypted.into()), shutdown).await
                }
                Err(_) => SendOutcome::Failed,
            };
            connection.outbound.release(wire_bytes);
            if matches!(outcome, SendOutcome::Failed) {
                close_sink(sink, close_code::ERROR, "Runtime send failed").await;
            }
            matches!(outcome, SendOutcome::Sent)
        }
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

pub(super) async fn shutdown_requested(shutdown: &mut watch::Receiver<bool>) {
    if *shutdown.borrow() {
        return;
    }
    while shutdown.changed().await.is_ok() {
        if *shutdown.borrow() {
            return;
        }
    }
}

async fn close_socket(socket: &mut WebSocket, code: u16, reason: &str) {
    let _ = timeout(SOCKET_CLOSE_TIMEOUT, async {
        let _ = socket
            .send(Message::Close(Some(close_frame(code, reason))))
            .await;
        let _ = socket.close().await;
    })
    .await;
}

async fn close_sink(sink: &mut SplitSink<WebSocket, Message>, code: u16, reason: &str) {
    let _ = timeout(SOCKET_CLOSE_TIMEOUT, async {
        let _ = sink
            .send(Message::Close(Some(close_frame(code, reason))))
            .await;
        let _ = sink.close().await;
    })
    .await;
}

fn close_frame(code: u16, reason: &str) -> CloseFrame {
    CloseFrame {
        code,
        reason: truncate_reason(reason).into(),
    }
}

fn truncate_reason(reason: &str) -> &str {
    let mut end = reason.len().min(123);
    while !reason.is_char_boundary(end) {
        end -= 1;
    }
    &reason[..end]
}

fn random_connection_id() -> Result<String, ()> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| ())?;
    Ok(format!(
        "runtime-{}",
        bytes
            .into_iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    ))
}

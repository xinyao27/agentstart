use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, close_code};
use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{OwnedSemaphorePermit, watch};
use tokio::time::timeout;

use super::admission::AdmissionState;
use super::channel::{MobileRpcMessage, OutboundEvent, QueuedMessage};
use super::establishment::{EstablishedConnection, EstablishmentFailure, establish};
use super::wire;

const ESTABLISHMENT_TIMEOUT: Duration = Duration::from_secs(15);
const SOCKET_CLOSE_TIMEOUT: Duration = Duration::from_secs(2);
const SOCKET_SEND_TIMEOUT: Duration = Duration::from_secs(10);

pub(super) async fn run_socket(
    mut socket: WebSocket,
    state: AdmissionState,
    pending_handshake: OwnedSemaphorePermit,
) {
    let mut shutdown = state.shutdown.subscribe();
    let connection_id = match random_uuid() {
        Ok(id) => id,
        Err(()) => {
            close_socket(&mut socket, close_code::ERROR, "Mobile connection failed").await;
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
            close_socket(&mut socket, 1013, "Mobile connection capacity reached").await;
        }
        Ok(Err(EstablishmentFailure::Shutdown)) => {
            close_socket(&mut socket, close_code::AWAY, "Daemon shutting down").await;
        }
        Ok(Err(EstablishmentFailure::Closed)) => {}
        Ok(Err(EstablishmentFailure::PeerUnavailable)) => {
            close_socket(
                &mut socket,
                close_code::ERROR,
                "Mobile RPC peer unavailable",
            )
            .await;
        }
        Ok(Err(EstablishmentFailure::Invalid)) => {
            close_socket(
                &mut socket,
                close_code::UNSUPPORTED,
                "Invalid mobile message",
            )
            .await;
        }
        Err(_) => {
            close_socket(
                &mut socket,
                close_code::POLICY,
                "Mobile authentication timed out",
            )
            .await;
        }
    }
}

async fn run_authenticated(
    socket: WebSocket,
    mut shutdown: watch::Receiver<bool>,
    mut connection: EstablishedConnection,
) {
    let (mut sink, mut stream) = socket.split();
    let mut pending_incoming = None;
    loop {
        let event = tokio::select! {
            biased;
            () = shutdown_requested(&mut shutdown) => ConnectionEvent::Shutdown,
            () = connection.authorization.revoked() => ConnectionEvent::Revoked,
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
        match event {
            ConnectionEvent::Shutdown => {
                close_sink(&mut sink, close_code::AWAY, "Daemon shutting down").await;
                break;
            }
            ConnectionEvent::Revoked => {
                close_sink(
                    &mut sink,
                    close_code::POLICY,
                    "Mobile device authorization was revoked",
                )
                .await;
                break;
            }
            ConnectionEvent::Incoming(message) => {
                if !handle_incoming(message, &mut connection, &mut sink, &mut pending_incoming)
                    .await
                {
                    break;
                }
            }
            ConnectionEvent::Outbound(outbound) => match outbound {
                OutboundEvent::Close(Some(request)) => {
                    close_sink(&mut sink, request.code, &request.reason).await;
                    break;
                }
                OutboundEvent::Close(None) | OutboundEvent::Message(None) => {
                    close_sink(&mut sink, close_code::ERROR, "Mobile RPC send failed").await;
                    break;
                }
                OutboundEvent::Message(Some(message)) => {
                    if !handle_outgoing(message, &mut connection, &mut sink).await {
                        break;
                    }
                }
            },
        }
    }
    connection.outbound.finish();
}

enum ConnectionEvent {
    Incoming(Option<Result<Message, axum::Error>>),
    Outbound(OutboundEvent),
    Revoked,
    Shutdown,
}

async fn handle_incoming(
    message: Option<Result<Message, axum::Error>>,
    connection: &mut EstablishedConnection,
    sink: &mut SplitSink<WebSocket, Message>,
    pending_incoming: &mut Option<MobileRpcMessage>,
) -> bool {
    let decoded = match message {
        Some(Ok(Message::Text(_))) => None,
        Some(Ok(Message::Binary(frame))) => connection
            .session
            .open_binary(&frame)
            .ok()
            .and_then(wire::decode_binary),
        Some(Ok(Message::Ping(payload))) => {
            return timeout(SOCKET_SEND_TIMEOUT, sink.send(Message::Pong(payload)))
                .await
                .is_ok_and(|result| result.is_ok());
        }
        Some(Ok(Message::Pong(_))) => return true,
        Some(Ok(Message::Close(_))) | None | Some(Err(_)) => return false,
    };
    let Some(decoded) = decoded else {
        close_sink(sink, close_code::UNSUPPORTED, "Invalid mobile message").await;
        return false;
    };
    match connection.incoming.try_send(decoded) {
        Ok(()) => true,
        Err(tokio::sync::mpsc::error::TrySendError::Full(frame)) => {
            // Why: retain one frame while still allowing outbound traffic and revocation.
            *pending_incoming = Some(frame);
            true
        }
        Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => {
            close_sink(sink, close_code::ERROR, "Mobile RPC peer unavailable").await;
            false
        }
    }
}

async fn handle_outgoing(
    queued: QueuedMessage,
    connection: &mut EstablishedConnection,
    sink: &mut SplitSink<WebSocket, Message>,
) -> bool {
    let (rpc_message, wire_bytes) = queued.into_parts();
    let message = match rpc_message {
        MobileRpcMessage::Binary(plaintext) => connection
            .session
            .seal_binary(&plaintext)
            .map(|frame| Message::Binary(frame.into())),
    };
    let sent = match message {
        Ok(message) => timeout(SOCKET_SEND_TIMEOUT, sink.send(message))
            .await
            .is_ok_and(|result| result.is_ok()),
        Err(_) => false,
    };
    connection.outbound.release(wire_bytes);
    if !sent {
        close_sink(sink, close_code::ERROR, "Mobile RPC send failed").await;
    }
    sent
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

fn random_uuid() -> Result<String, ()> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| ())?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    ))
}

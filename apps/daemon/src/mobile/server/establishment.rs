use axum::extract::ws::{Message, WebSocket};
use serde::Serialize;
use tokio::sync::{mpsc, watch};

use super::admission::AdmissionState;
use super::channel::{
    MobileAuthenticatedChannel, MobileRpcMessage, OutboundReceiver, outbound_channel,
};
use super::connection::shutdown_requested;
use super::connections::MobileConnectionLease;
use crate::mobile::e2ee::MobileE2eeSession;
use crate::mobile::presence::MobilePresenceLease;
use crate::mobile::{MobileAuthorization, authenticate};

const INCOMING_CHANNEL_CAPACITY: usize = 16;
const MAX_ESTABLISHMENT_MESSAGE_BYTES: usize = 8 * 1024;
const PROTOBUF_RPC_CAPABILITY: &str = "yiru-protobuf-v2";

pub(super) struct EstablishedConnection {
    pub(super) _admission: MobileConnectionLease,
    pub(super) authorization: MobileAuthorization,
    pub(super) _presence: MobilePresenceLease,
    pub(super) incoming: mpsc::Sender<MobileRpcMessage>,
    pub(super) outbound: OutboundReceiver,
    pub(super) session: MobileE2eeSession,
}

pub(super) enum EstablishmentFailure {
    Capacity,
    Closed,
    Invalid,
    PeerUnavailable,
    Shutdown,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthenticatedResponse<'a> {
    capabilities: [&'static str; 1],
    runtime_id: &'a str,
    transcript_hash_b64: &'a str,
    r#type: &'static str,
    v: u8,
}

pub(super) async fn establish(
    socket: &mut WebSocket,
    state: &AdmissionState,
    shutdown: &mut watch::Receiver<bool>,
    connection_id: String,
) -> Result<EstablishedConnection, EstablishmentFailure> {
    let Message::Text(hello) = receive_application_message(socket, shutdown).await? else {
        return Err(EstablishmentFailure::Invalid);
    };
    let mut session = MobileE2eeSession::create(hello.as_str(), &state.keypair)
        .map_err(|_| EstablishmentFailure::Invalid)?;
    socket
        .send(Message::Text(session.ready_text().to_owned().into()))
        .await
        .map_err(|_| EstablishmentFailure::Closed)?;

    let Message::Text(auth_frame) = receive_application_message(socket, shutdown).await? else {
        return Err(EstablishmentFailure::Invalid);
    };
    let plaintext = session
        .open_text(auth_frame.as_str())
        .map_err(|_| EstablishmentFailure::Invalid)?;
    let authorization = authenticate(&state.devices, &plaintext, session.transcript_hash_b64())
        .await
        .map_err(|_| EstablishmentFailure::Invalid)?;
    let device_id = authorization.device_id().to_owned();
    let admission = state
        .connections
        .register(device_id.clone())
        .map_err(|()| EstablishmentFailure::Capacity)?;
    let response = serde_json::to_string(&AuthenticatedResponse {
        capabilities: [PROTOBUF_RPC_CAPABILITY],
        runtime_id: &state.runtime_id,
        transcript_hash_b64: session.transcript_hash_b64(),
        r#type: "e2ee_authenticated",
        v: 2,
    })
    .map_err(|_| EstablishmentFailure::Invalid)?;

    let (incoming_sender, incoming) = mpsc::channel(INCOMING_CHANNEL_CAPACITY);
    let (outgoing, outbound) = outbound_channel();
    let authenticated = MobileAuthenticatedChannel {
        authorization: authorization.clone(),
        connection_id: connection_id.clone(),
        device_id: device_id.clone(),
        incoming,
        outgoing,
    };
    let presence = state.presence.connect(connection_id, device_id);
    tokio::select! {
        biased;
        () = shutdown_requested(shutdown) => return Err(EstablishmentFailure::Shutdown),
        result = state.accepted.send(authenticated) => {
            result.map_err(|_| EstablishmentFailure::PeerUnavailable)?;
        }
    }
    let encrypted = session
        .seal_text(&response)
        .map_err(|_| EstablishmentFailure::Invalid)?;
    socket
        .send(Message::Text(encrypted.into()))
        .await
        .map_err(|_| EstablishmentFailure::Closed)?;
    Ok(EstablishedConnection {
        _admission: admission,
        authorization,
        _presence: presence,
        incoming: incoming_sender,
        outbound,
        session,
    })
}

async fn receive_application_message(
    socket: &mut WebSocket,
    shutdown: &mut watch::Receiver<bool>,
) -> Result<Message, EstablishmentFailure> {
    loop {
        let message = tokio::select! {
            biased;
            () = shutdown_requested(shutdown) => return Err(EstablishmentFailure::Shutdown),
            message = socket.recv() => message,
        };
        match message {
            Some(Ok(Message::Ping(payload))) => socket
                .send(Message::Pong(payload))
                .await
                .map_err(|_| EstablishmentFailure::Closed)?,
            Some(Ok(Message::Pong(_))) => {}
            Some(Ok(Message::Close(_))) | None | Some(Err(_)) => {
                return Err(EstablishmentFailure::Closed);
            }
            Some(Ok(message @ (Message::Text(_) | Message::Binary(_)))) => {
                if application_message_bytes(&message) > MAX_ESTABLISHMENT_MESSAGE_BYTES {
                    return Err(EstablishmentFailure::Invalid);
                }
                return Ok(message);
            }
        }
    }
}

fn application_message_bytes(message: &Message) -> usize {
    match message {
        Message::Text(text) => text.len(),
        Message::Binary(bytes) => bytes.len(),
        Message::Ping(_) | Message::Pong(_) | Message::Close(_) => 0,
    }
}

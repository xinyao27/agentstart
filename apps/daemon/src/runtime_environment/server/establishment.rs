use axum::extract::ws::{Message, WebSocket};
use tokio::sync::{mpsc, watch};

use super::RuntimeAdmissionState;
use super::channel::{OutboundReceiver, RuntimeAuthenticatedChannel, outbound_channel};
use super::connection::shutdown_requested;
use crate::runtime_environment::wire::{RuntimeAuthRequest, RuntimeAuthResponse};
use crate::runtime_environment::{RuntimeConnectionLease, RuntimeEnvironmentError};
use crate::transport::e2ee::{E2eeError, EncryptedSession, RUNTIME_PROFILE, ServerHandshake};

const INCOMING_CHANNEL_CAPACITY: usize = 16;

pub(super) struct EstablishedRuntimeConnection {
    pub(super) _lease: RuntimeConnectionLease,
    pub(super) incoming: mpsc::Sender<Vec<u8>>,
    pub(super) outbound: OutboundReceiver,
    pub(super) session: EncryptedSession,
}

pub(super) enum EstablishmentFailure {
    Capacity,
    Closed,
    Internal,
    Invalid,
    PeerUnavailable,
    Shutdown,
    Unauthorized,
}

pub(super) async fn establish(
    socket: &mut WebSocket,
    state: &RuntimeAdmissionState,
    shutdown: &mut watch::Receiver<bool>,
    connection_id: String,
) -> Result<EstablishedRuntimeConnection, EstablishmentFailure> {
    let Message::Text(hello) = receive_application_message(socket, shutdown).await? else {
        return Err(EstablishmentFailure::Invalid);
    };
    if hello.len() > super::super::MAX_HANDSHAKE_TEXT_BYTES {
        return Err(EstablishmentFailure::Invalid);
    }
    let handshake = ServerHandshake::accept(
        hello.as_str(),
        state
            .authority
            .secret_key()
            .map_err(|_| EstablishmentFailure::Internal)?,
        RUNTIME_PROFILE,
    )
    .map_err(handshake_failure)?;
    let ready_text = handshake.ready_text.clone();
    let mut session = EncryptedSession::responder(handshake);
    socket
        .send(Message::Text(ready_text.into()))
        .await
        .map_err(|_| EstablishmentFailure::Closed)?;

    let Message::Text(auth_frame) = receive_application_message(socket, shutdown).await? else {
        return Err(EstablishmentFailure::Invalid);
    };
    if auth_frame.len() > super::super::MAX_HANDSHAKE_TEXT_BYTES {
        return Err(EstablishmentFailure::Invalid);
    }
    let plaintext = session
        .open_text(auth_frame.as_str())
        .map_err(|_| EstablishmentFailure::Invalid)?;
    let auth = serde_json::from_str::<RuntimeAuthRequest>(&plaintext)
        .map_err(|_| EstablishmentFailure::Invalid)?;
    if auth.r#type != "e2ee_auth"
        || auth.v != 2
        || auth.token.is_empty()
        || auth.token.len() > 256
        || !auth.token.is_ascii()
        || auth.transcript_hash_b64 != session.transcript_hash_b64()
    {
        return Err(EstablishmentFailure::Invalid);
    }
    let authorization = state
        .authority
        .authenticate(&auth.token)
        .ok_or(EstablishmentFailure::Unauthorized)?;
    authorization
        .note_seen()
        .await
        .map_err(authorization_failure)?;
    let peer_id = authorization.peer_id().to_owned();
    let response = serde_json::to_string(&RuntimeAuthResponse {
        runtime_id: state.runtime_id.to_string(),
        transcript_hash_b64: session.transcript_hash_b64().to_owned(),
        r#type: "e2ee_authenticated".to_owned(),
        v: 2,
    })
    .map_err(|_| EstablishmentFailure::Internal)?;

    let (incoming_sender, incoming) = mpsc::channel(INCOMING_CHANNEL_CAPACITY);
    let (outgoing, outbound) = outbound_channel();
    let accepted = state
        .accepted
        .clone()
        .try_reserve_owned()
        .map_err(|_| EstablishmentFailure::PeerUnavailable)?;
    let mut lease = state
        .authority
        .register_connection(&authorization, connection_id.clone(), outgoing.clone())
        .await
        .map_err(|error| match error {
            RuntimeEnvironmentError::ConnectionCapacity => EstablishmentFailure::Capacity,
            RuntimeEnvironmentError::PeerNotFound(_) => EstablishmentFailure::Unauthorized,
            _ => EstablishmentFailure::Internal,
        })?;
    let authenticated = RuntimeAuthenticatedChannel {
        authorization,
        connection_id,
        incoming,
        outgoing,
        peer_id,
    };
    let encrypted = session
        .seal_text(&response)
        .map_err(|_| EstablishmentFailure::Internal)?;
    tokio::select! {
        biased;
        () = shutdown_requested(shutdown) => return Err(EstablishmentFailure::Shutdown),
        () = lease.revoked() => return Err(EstablishmentFailure::Unauthorized),
        result = socket.send(Message::Text(encrypted.into())) => {
            result.map_err(|_| EstablishmentFailure::Closed)?;
        }
    }
    accepted.send(authenticated);
    Ok(EstablishedRuntimeConnection {
        _lease: lease,
        incoming: incoming_sender,
        outbound,
        session,
    })
}

fn handshake_failure(error: E2eeError) -> EstablishmentFailure {
    match error {
        E2eeError::Cryptography | E2eeError::FrameInvalid | E2eeError::HelloInvalid => {
            EstablishmentFailure::Invalid
        }
        E2eeError::CounterExhausted | E2eeError::Random(_) | E2eeError::Serialization(_) => {
            EstablishmentFailure::Internal
        }
    }
}

fn authorization_failure(error: RuntimeEnvironmentError) -> EstablishmentFailure {
    if matches!(error, RuntimeEnvironmentError::PeerNotFound(_)) {
        EstablishmentFailure::Unauthorized
    } else {
        EstablishmentFailure::Internal
    }
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
            Some(Ok(message @ (Message::Text(_) | Message::Binary(_)))) => return Ok(message),
        }
    }
}

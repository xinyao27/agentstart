use async_trait::async_trait;
use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use super::records::is_valid_runtime_id;
use super::wire::{RuntimeAuthRequestRef, RuntimeAuthResponse};
use crate::transport::e2ee::{
    ClientHandshake, EncryptedReceiver, EncryptedSession, EncryptedWriter, RUNTIME_PROFILE,
};
use crate::transport::{
    FrameTransport, FrameTransportEvent, FrameTransportReader, FrameTransportWriter,
    ProtocolPeerError,
};

const MAX_WRITE_BUFFER_BYTES: usize = 8 * 1024 * 1024;

pub(super) struct RuntimeWebSocket {
    session: EncryptedSession,
    socket: WebSocketStream<MaybeTlsStream<TcpStream>>,
}

type RuntimeSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub(super) struct RuntimeWebSocketReader {
    session: EncryptedReceiver,
    stream: SplitStream<RuntimeSocket>,
}

pub(super) struct RuntimeWebSocketWriter {
    session: EncryptedWriter,
    sink: SplitSink<RuntimeSocket, Message>,
}

impl RuntimeWebSocket {
    pub(super) async fn connect(
        endpoint: &str,
        token: &str,
        pinned_public_key: [u8; 32],
    ) -> Result<(Self, String), ProtocolPeerError> {
        let config = WebSocketConfig::default()
            .write_buffer_size(0)
            .max_write_buffer_size(MAX_WRITE_BUFFER_BYTES)
            .max_message_size(Some(super::MAX_RUNTIME_MESSAGE_BYTES))
            .max_frame_size(Some(super::MAX_RUNTIME_MESSAGE_BYTES));
        let (mut socket, _) =
            tokio_tungstenite::connect_async_with_config(endpoint, Some(config), true)
                .await
                .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        let handshake = ClientHandshake::create(RUNTIME_PROFILE)
            .map_err(|_| ProtocolPeerError::Protocol("runtime_e2ee_failed"))?;
        socket
            .send(Message::Text(handshake.hello_text().to_owned().into()))
            .await
            .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        let ready = receive_text(&mut socket).await?;
        let schedule = handshake
            .accept_ready(&ready, pinned_public_key)
            .map_err(|_| ProtocolPeerError::Protocol("runtime_e2ee_failed"))?;
        let mut session = EncryptedSession::initiator(schedule);
        let auth = serde_json::to_string(&RuntimeAuthRequestRef {
            token,
            transcript_hash_b64: session.transcript_hash_b64(),
            r#type: "e2ee_auth",
            v: 2,
        })
        .map_err(|_| ProtocolPeerError::Protocol("runtime_auth_failed"))?;
        let encrypted = session
            .seal_text(&auth)
            .map_err(|_| ProtocolPeerError::Protocol("runtime_e2ee_failed"))?;
        socket
            .send(Message::Text(encrypted.into()))
            .await
            .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        let encrypted_response = receive_text(&mut socket).await?;
        let response = session
            .open_text(&encrypted_response)
            .map_err(|_| ProtocolPeerError::Protocol("runtime_e2ee_failed"))?;
        let response = serde_json::from_str::<RuntimeAuthResponse>(&response)
            .map_err(|_| ProtocolPeerError::Protocol("runtime_auth_failed"))?;
        if response.r#type != "e2ee_authenticated"
            || response.v != 2
            || !is_valid_runtime_id(&response.runtime_id)
            || response.transcript_hash_b64 != session.transcript_hash_b64()
        {
            return Err(ProtocolPeerError::Protocol("runtime_auth_failed"));
        }
        Ok((Self { session, socket }, response.runtime_id))
    }
}

#[async_trait]
impl FrameTransport for RuntimeWebSocket {
    type Reader = RuntimeWebSocketReader;
    type Writer = RuntimeWebSocketWriter;

    async fn close(&mut self) {
        let _ = self.socket.close(None).await;
    }

    async fn receive(&mut self) -> Result<Vec<u8>, ProtocolPeerError> {
        loop {
            let message = self
                .socket
                .next()
                .await
                .ok_or(ProtocolPeerError::ConnectionFailed)?
                .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
            match message {
                Message::Binary(frame) => {
                    return self
                        .session
                        .open_binary(&frame)
                        .map_err(|_| ProtocolPeerError::Protocol("runtime_e2ee_failed"));
                }
                Message::Ping(payload) => self
                    .socket
                    .send(Message::Pong(payload))
                    .await
                    .map_err(|_| ProtocolPeerError::ConnectionFailed)?,
                Message::Pong(_) => {}
                Message::Close(_) => return Err(ProtocolPeerError::ConnectionFailed),
                Message::Text(_) | Message::Frame(_) => {
                    return Err(ProtocolPeerError::Protocol("binary_frame_expected"));
                }
            }
        }
    }

    async fn send(&mut self, frame: Vec<u8>) -> Result<(), ProtocolPeerError> {
        let encrypted = self
            .session
            .seal_binary(&frame)
            .map_err(|_| ProtocolPeerError::Protocol("runtime_e2ee_failed"))?;
        self.socket
            .send(Message::Binary(encrypted.into()))
            .await
            .map_err(|_| ProtocolPeerError::ConnectionFailed)
    }

    fn split(self) -> (Self::Reader, Self::Writer) {
        let (session, writer_session) = self.session.split();
        let (sink, stream) = self.socket.split();
        (
            RuntimeWebSocketReader { session, stream },
            RuntimeWebSocketWriter {
                session: writer_session,
                sink,
            },
        )
    }
}

#[async_trait]
impl FrameTransportReader for RuntimeWebSocketReader {
    async fn receive(&mut self) -> Result<FrameTransportEvent, ProtocolPeerError> {
        loop {
            let message = self
                .stream
                .next()
                .await
                .ok_or(ProtocolPeerError::ConnectionFailed)?
                .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
            match message {
                Message::Binary(frame) => {
                    let plaintext = self
                        .session
                        .open_binary(&frame)
                        .map_err(|_| ProtocolPeerError::Protocol("runtime_e2ee_failed"))?;
                    return Ok(FrameTransportEvent::Frame(plaintext));
                }
                Message::Ping(payload) => {
                    return Ok(FrameTransportEvent::Ping(payload.to_vec()));
                }
                Message::Pong(_) => {}
                Message::Close(_) => return Err(ProtocolPeerError::ConnectionFailed),
                Message::Text(_) | Message::Frame(_) => {
                    return Err(ProtocolPeerError::Protocol("binary_frame_expected"));
                }
            }
        }
    }
}

#[async_trait]
impl FrameTransportWriter for RuntimeWebSocketWriter {
    async fn close(&mut self) {
        let _ = self.sink.close().await;
    }

    async fn pong(&mut self, payload: Vec<u8>) -> Result<(), ProtocolPeerError> {
        self.sink
            .send(Message::Pong(payload.into()))
            .await
            .map_err(|_| ProtocolPeerError::ConnectionFailed)
    }

    async fn send(&mut self, frame: Vec<u8>) -> Result<(), ProtocolPeerError> {
        let encrypted = self
            .session
            .seal_binary(&frame)
            .map_err(|_| ProtocolPeerError::Protocol("runtime_e2ee_failed"))?;
        self.sink
            .send(Message::Binary(encrypted.into()))
            .await
            .map_err(|_| ProtocolPeerError::ConnectionFailed)
    }
}

async fn receive_text(
    socket: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
) -> Result<String, ProtocolPeerError> {
    loop {
        let message = socket
            .next()
            .await
            .ok_or(ProtocolPeerError::ConnectionFailed)?
            .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        match message {
            Message::Text(text) if text.len() <= super::MAX_HANDSHAKE_TEXT_BYTES => {
                return Ok(text.to_string());
            }
            Message::Text(_) => {
                return Err(ProtocolPeerError::Protocol("runtime_handshake_too_large"));
            }
            Message::Ping(payload) => socket
                .send(Message::Pong(payload))
                .await
                .map_err(|_| ProtocolPeerError::ConnectionFailed)?,
            Message::Pong(_) => {}
            Message::Close(_) => return Err(ProtocolPeerError::ConnectionFailed),
            Message::Binary(_) | Message::Frame(_) => {
                return Err(ProtocolPeerError::Protocol("text_frame_expected"));
            }
        }
    }
}

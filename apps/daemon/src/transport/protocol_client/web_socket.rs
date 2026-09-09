use async_trait::async_trait;
use futures_util::stream::{SplitSink, SplitStream};
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use super::{
    FrameTransport, FrameTransportEvent, FrameTransportReader, FrameTransportWriter,
    MAX_FRAME_BYTES, ProtocolPeerError,
};

const MAX_WRITE_BUFFER_BYTES: usize = 2 * 1024 * 1024;

pub(super) struct LocalWebSocket {
    socket: WebSocketStream<MaybeTlsStream<TcpStream>>,
}

type LocalSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub(super) struct LocalWebSocketReader {
    stream: SplitStream<LocalSocket>,
}

pub(super) struct LocalWebSocketWriter {
    sink: SplitSink<LocalSocket, Message>,
}

impl LocalWebSocket {
    pub(super) async fn connect(
        endpoint: &str,
        auth_token: &str,
        protocol_version: u32,
    ) -> Result<Self, ProtocolPeerError> {
        let mut endpoint =
            url::Url::parse(endpoint).map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        endpoint
            .query_pairs_mut()
            .append_pair("protocolVersion", &protocol_version.to_string())
            .append_pair("token", auth_token);
        let config = WebSocketConfig::default()
            .write_buffer_size(0)
            .max_write_buffer_size(MAX_WRITE_BUFFER_BYTES)
            .max_message_size(Some(MAX_FRAME_BYTES as usize))
            .max_frame_size(Some(MAX_FRAME_BYTES as usize));
        let (socket, _) =
            tokio_tungstenite::connect_async_with_config(endpoint.as_str(), Some(config), false)
                .await
                .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        Ok(Self { socket })
    }
}

#[async_trait]
impl FrameTransport for LocalWebSocket {
    type Reader = LocalWebSocketReader;
    type Writer = LocalWebSocketWriter;

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
                Message::Binary(frame) => return Ok(frame.to_vec()),
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
        self.socket
            .send(Message::Binary(frame.into()))
            .await
            .map_err(|_| ProtocolPeerError::ConnectionFailed)
    }

    fn split(self) -> (Self::Reader, Self::Writer) {
        let (sink, stream) = self.socket.split();
        (
            LocalWebSocketReader { stream },
            LocalWebSocketWriter { sink },
        )
    }
}

#[async_trait]
impl FrameTransportReader for LocalWebSocketReader {
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
                    return Ok(FrameTransportEvent::Frame(frame.to_vec()));
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
impl FrameTransportWriter for LocalWebSocketWriter {
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
        self.sink
            .send(Message::Binary(frame.into()))
            .await
            .map_err(|_| ProtocolPeerError::ConnectionFailed)
    }
}

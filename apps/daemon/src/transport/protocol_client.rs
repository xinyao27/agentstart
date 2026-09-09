use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use getrandom::fill;
use prost::Message;
use thiserror::Error;
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc, oneshot};
use tokio::time::{Instant, timeout};
use yiru_protocol::CURRENT_PROTOCOL_VERSION;
use yiru_protocol::method_metadata::{MethodMetadata, ServerStreamMethod, UnaryMethod};
use yiru_protocol::protocol::v1::frame::Body;
use yiru_protocol::protocol::v1::{Frame, Hello, PeerKind, Status, StatusCode, Welcome};
use yiru_protocol::transport::{FRAME_PREAMBLE_BYTES, decode_frame, encode_frame};

mod connection;
mod duplex;
mod outbound;
mod stream;
mod web_socket;

pub use duplex::RawDuplexWriter;
pub use stream::{ProtocolStream, RawProtocolStream};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const INITIAL_CALL_CREDIT_BYTES: u64 = 1024 * 1024;
const MAX_CALL_CREDIT_BYTES: u64 = 4 * 1024 * 1024;
const MAX_ACTIVE_CALLS: usize = 64;
const MAX_BUFFERED_REQUEST_BYTES: usize = 16 * 1024 * 1024;
const MAX_COMMANDS: usize = 64;
const MAX_FRAME_BYTES: u32 = 1024 * 1024;
const MAX_KEEP_ALIVE_INTERVAL_MS: u32 = 5 * 60 * 1000;
const MIN_KEEP_ALIVE_INTERVAL_MS: u32 = 1000;
const REQUEST_ENCODE_OVERHEAD_BYTES: usize = 4 * 1024;

pub(crate) type LocalProtocolClient = ProtocolClient;

#[derive(Clone, Debug, Error)]
pub enum ProtocolPeerError {
    #[error("daemon_connection_timeout")]
    ConnectionTimeout,
    #[error("daemon_connection_failed")]
    ConnectionFailed,
    #[error("daemon_runtime_id_mismatch")]
    RuntimeMismatch,
    #[error("daemon_protocol_error:{0}")]
    Protocol(&'static str),
    #[error("{0}")]
    Remote(StatusDisplay),
}

#[derive(Clone, Debug)]
pub struct StatusDisplay(Status);

#[async_trait]
pub trait FrameTransport: Send + 'static {
    type Reader: FrameTransportReader;
    type Writer: FrameTransportWriter;

    async fn close(&mut self);
    async fn receive(&mut self) -> Result<Vec<u8>, ProtocolPeerError>;
    async fn send(&mut self, frame: Vec<u8>) -> Result<(), ProtocolPeerError>;
    fn split(self) -> (Self::Reader, Self::Writer);
}

#[async_trait]
pub trait FrameTransportReader: Send + 'static {
    async fn receive(&mut self) -> Result<FrameTransportEvent, ProtocolPeerError>;
}

#[async_trait]
pub trait FrameTransportWriter: Send + 'static {
    async fn close(&mut self);
    async fn pong(&mut self, payload: Vec<u8>) -> Result<(), ProtocolPeerError>;
    async fn send(&mut self, frame: Vec<u8>) -> Result<(), ProtocolPeerError>;
}

pub enum FrameTransportEvent {
    Frame(Vec<u8>),
    Ping(Vec<u8>),
}

pub struct PeerIdentity {
    initial_call_credit_bytes: u64,
    max_frame_bytes: u32,
    name: String,
    peer_kind: PeerKind,
    version: String,
}

#[derive(Clone)]
pub struct ProtocolClient {
    cancel_tx: mpsc::UnboundedSender<u64>,
    command_tx: mpsc::Sender<connection::ClientCommand>,
    credit_tx: mpsc::Sender<connection::ConsumedCredit>,
    max_request_bytes: usize,
    outbound: outbound::Outbound,
    request_budget: Arc<Semaphore>,
    runtime_id: Arc<str>,
}

impl StatusDisplay {
    pub fn status(&self) -> &Status {
        &self.0
    }
}

impl std::fmt::Display for StatusDisplay {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0.message)
    }
}

impl ProtocolPeerError {
    pub fn remote_status(&self) -> Option<&Status> {
        match self {
            Self::Remote(display) => Some(display.status()),
            Self::ConnectionTimeout
            | Self::ConnectionFailed
            | Self::RuntimeMismatch
            | Self::Protocol(_) => None,
        }
    }
}

impl PeerIdentity {
    pub fn new(
        peer_kind: PeerKind,
        name: impl Into<String>,
        version: impl Into<String>,
        max_frame_bytes: u32,
        initial_call_credit_bytes: u64,
    ) -> Result<Self, ProtocolPeerError> {
        let name = name.into();
        let version = version.into();
        if peer_kind == PeerKind::Unspecified
            || name.is_empty()
            || version.is_empty()
            || max_frame_bytes < FRAME_PREAMBLE_BYTES as u32
            || max_frame_bytes > MAX_FRAME_BYTES
            || initial_call_credit_bytes == 0
            || initial_call_credit_bytes > MAX_CALL_CREDIT_BYTES
        {
            return Err(ProtocolPeerError::Protocol("peer_identity_invalid"));
        }
        Ok(Self {
            initial_call_credit_bytes,
            max_frame_bytes,
            name,
            peer_kind,
            version,
        })
    }
}

impl ProtocolClient {
    pub async fn connect(
        endpoint: &str,
        auth_token: &str,
        bootstrap_protocol_version: u32,
        bootstrap_runtime_id: &str,
        expected_runtime_id: Option<&str>,
    ) -> Result<Self, ProtocolPeerError> {
        if bootstrap_protocol_version != CURRENT_PROTOCOL_VERSION {
            return Err(ProtocolPeerError::Protocol(
                "bootstrap_protocol_version_mismatch",
            ));
        }
        if expected_runtime_id.is_some_and(|expected| expected != bootstrap_runtime_id) {
            return Err(ProtocolPeerError::RuntimeMismatch);
        }
        let transport = timeout(
            CONNECT_TIMEOUT,
            web_socket::LocalWebSocket::connect(endpoint, auth_token, bootstrap_protocol_version),
        )
        .await
        .map_err(|_| ProtocolPeerError::ConnectionTimeout)??;
        let identity = PeerIdentity::new(
            PeerKind::Cli,
            "yiru-cli",
            env!("CARGO_PKG_VERSION"),
            MAX_FRAME_BYTES,
            INITIAL_CALL_CREDIT_BYTES,
        )?;
        Self::negotiate(transport, identity, Some(bootstrap_runtime_id)).await
    }

    pub async fn negotiate<T>(
        mut transport: T,
        identity: PeerIdentity,
        expected_runtime_id: Option<&str>,
    ) -> Result<Self, ProtocolPeerError>
    where
        T: FrameTransport,
    {
        let hello = Hello {
            supported_protocol_versions: vec![CURRENT_PROTOCOL_VERSION],
            peer_kind: identity.peer_kind as i32,
            peer_name: identity.name,
            peer_version: identity.version,
            peer_instance_id: peer_instance_id()?,
            max_frame_bytes: identity.max_frame_bytes,
            initial_call_credit_bytes: identity.initial_call_credit_bytes,
            supported_transport_features: Vec::new(),
        };
        send_negotiation_frame(&mut transport, Body::Hello(hello), identity.max_frame_bytes)
            .await?;
        let welcome = timeout(
            CONNECT_TIMEOUT,
            receive_welcome(&mut transport, identity.max_frame_bytes),
        )
        .await
        .map_err(|_| ProtocolPeerError::ConnectionTimeout)??;
        let is_expected_runtime =
            expected_runtime_id.is_none_or(|expected| expected == welcome.runtime_id);
        if welcome.protocol_version != CURRENT_PROTOCOL_VERSION
            || welcome.max_frame_bytes < FRAME_PREAMBLE_BYTES as u32
            || welcome.max_frame_bytes > MAX_FRAME_BYTES
            || welcome.initial_call_credit_bytes == 0
            || welcome.initial_call_credit_bytes > MAX_CALL_CREDIT_BYTES
            || !(MIN_KEEP_ALIVE_INTERVAL_MS..=MAX_KEEP_ALIVE_INTERVAL_MS)
                .contains(&welcome.keep_alive_interval_ms)
            || welcome.daemon_version.is_empty()
            || welcome.runtime_id.is_empty()
            || welcome.session_id.is_empty()
            || !welcome.enabled_transport_features.is_empty()
            || !is_expected_runtime
        {
            let _ = timeout(CONNECT_TIMEOUT, transport.close()).await;
            return if !is_expected_runtime {
                Err(ProtocolPeerError::RuntimeMismatch)
            } else {
                Err(ProtocolPeerError::Protocol("welcome_invalid"))
            };
        }
        let runtime_id: Arc<str> = Arc::from(welcome.runtime_id.as_str());
        let max_request_bytes = usize::try_from(
            welcome
                .initial_call_credit_bytes
                .min(u64::from(welcome.max_frame_bytes)),
        )
        .map_err(|_| ProtocolPeerError::Protocol("welcome_invalid"))?;
        let (reader, writer) = transport.split();
        let (outbound, writer_done) = outbound::Outbound::spawn(writer);
        let (command_tx, command_rx) = mpsc::channel(MAX_COMMANDS);
        let (cancel_tx, cancel_rx) = mpsc::unbounded_channel();
        let (credit_tx, credit_rx) = mpsc::channel(MAX_ACTIVE_CALLS);
        let actor = connection::ProtocolConnection::new(
            connection::ConnectionChannels {
                cancel_rx,
                command_rx,
                credit_rx,
                outbound: outbound.clone(),
                reader,
                writer_done,
            },
            identity.initial_call_credit_bytes,
            identity.max_frame_bytes,
            welcome,
        )?;
        tokio::spawn(actor.run());
        Ok(Self {
            cancel_tx,
            command_tx,
            credit_tx,
            max_request_bytes,
            outbound,
            request_budget: Arc::new(Semaphore::new(MAX_BUFFERED_REQUEST_BYTES)),
            runtime_id,
        })
    }

    pub fn runtime_id(&self) -> &str {
        &self.runtime_id
    }

    pub async fn unary<Method>(
        &self,
        request: &Method::Request,
        call_timeout: Duration,
    ) -> Result<Method::Response, ProtocolPeerError>
    where
        Method: UnaryMethod,
    {
        let response = self
            .unary_raw(Method::METADATA, request.encode_to_vec(), call_timeout)
            .await?;
        Method::Response::decode(response.as_slice())
            .map_err(|_| ProtocolPeerError::Protocol("response_invalid"))
    }

    pub(crate) async fn unary_raw(
        &self,
        metadata: &'static MethodMetadata,
        payload: Vec<u8>,
        call_timeout: Duration,
    ) -> Result<Vec<u8>, ProtocolPeerError> {
        let deadline = call_deadline(call_timeout)?;
        let encoded_len = payload.len();
        if encoded_len > self.max_request_bytes {
            return Err(ProtocolPeerError::Protocol("request_too_large"));
        }
        let budget = self.reserve_request_budget(encoded_len, deadline).await?;
        let (admission_tx, admission_rx) = oneshot::channel();
        let (result_tx, result_rx) = oneshot::channel();
        let command = connection::ClientCommand::StartUnary {
            admission_tx,
            budget,
            deadline,
            metadata,
            payload,
            result_tx,
            timeout_ms: call_timeout_ms(call_timeout)?,
        };
        tokio::time::timeout_at(deadline, self.command_tx.send(command))
            .await
            .map_err(|_| deadline_error())?
            .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        let mut cancellation = stream::CallCancellation::pending(self.cancel_tx.clone());
        let call_id = admission_rx
            .await
            .map_err(|_| ProtocolPeerError::ConnectionFailed)??;
        cancellation.activate(call_id);
        let result = result_rx.await;
        cancellation.disarm();
        result.map_err(|_| ProtocolPeerError::ConnectionFailed)?
    }

    pub async fn server_stream<Method>(
        &self,
        request: &Method::Request,
        call_timeout: Duration,
    ) -> Result<ProtocolStream<Method::Item>, ProtocolPeerError>
    where
        Method: ServerStreamMethod,
    {
        let raw = self
            .server_stream_raw(Method::METADATA, request.encode_to_vec(), call_timeout)
            .await?;
        Ok(ProtocolStream::new(raw))
    }

    pub(crate) async fn server_stream_raw(
        &self,
        metadata: &'static MethodMetadata,
        payload: Vec<u8>,
        call_timeout: Duration,
    ) -> Result<RawProtocolStream, ProtocolPeerError> {
        self.open_stream(metadata, payload, call_timeout, None)
            .await
    }

    async fn open_stream(
        &self,
        metadata: &'static MethodMetadata,
        payload: Vec<u8>,
        call_timeout: Duration,
        duplex_credit: Option<duplex::DuplexCredit>,
    ) -> Result<RawProtocolStream, ProtocolPeerError> {
        let deadline = call_deadline(call_timeout)?;
        let encoded_len = payload.len();
        if encoded_len > self.max_request_bytes {
            return Err(ProtocolPeerError::Protocol("request_too_large"));
        }
        let budget = self.reserve_request_budget(encoded_len, deadline).await?;
        let (admission_tx, admission_rx) = oneshot::channel();
        let (item_tx, item_rx) = mpsc::channel(connection::STREAM_QUEUE_CAPACITY);
        let completion = stream::CallCompletion::new();
        let command = connection::ClientCommand::StartStream {
            admission_tx,
            budget,
            completion: completion.clone(),
            duplex_credit,
            deadline,
            item_tx,
            metadata,
            payload,
            timeout_ms: call_timeout_ms(call_timeout)?,
        };
        tokio::time::timeout_at(deadline, self.command_tx.send(command))
            .await
            .map_err(|_| deadline_error())?
            .map_err(|_| ProtocolPeerError::ConnectionFailed)?;
        let call_id = admission_rx
            .await
            .map_err(|_| ProtocolPeerError::ConnectionFailed)??;
        Ok(RawProtocolStream::new(
            call_id,
            item_rx,
            self.cancel_tx.clone(),
            self.credit_tx.clone(),
            completion,
        ))
    }

    pub async fn close(&self) {
        let (closed_tx, closed_rx) = oneshot::channel();
        if timeout(
            CONNECT_TIMEOUT,
            self.command_tx
                .send(connection::ClientCommand::Close { closed_tx }),
        )
        .await
        .is_ok_and(|result| result.is_ok())
        {
            let _ = timeout(CONNECT_TIMEOUT, closed_rx).await;
        }
    }

    async fn reserve_request_budget(
        &self,
        encoded_len: usize,
        deadline: Instant,
    ) -> Result<OwnedSemaphorePermit, ProtocolPeerError> {
        let bytes = encoded_len
            .checked_mul(2)
            .and_then(|value| value.checked_add(REQUEST_ENCODE_OVERHEAD_BYTES))
            .and_then(|value| u32::try_from(value).ok())
            .ok_or(ProtocolPeerError::Protocol("request_too_large"))?;
        tokio::time::timeout_at(
            deadline,
            self.request_budget.clone().acquire_many_owned(bytes),
        )
        .await
        .map_err(|_| deadline_error())?
        .map_err(|_| ProtocolPeerError::ConnectionFailed)
    }
}

async fn send_negotiation_frame<T>(
    transport: &mut T,
    body: Body,
    max_frame_bytes: u32,
) -> Result<(), ProtocolPeerError>
where
    T: FrameTransport,
{
    let bytes = encode_frame(&Frame {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        sequence: 1,
        body: Some(body),
    })
    .map_err(|_| ProtocolPeerError::Protocol("frame_encode_failed"))?;
    if bytes.len() > max_frame_bytes as usize {
        return Err(ProtocolPeerError::Protocol("frame_too_large"));
    }
    timeout(CONNECT_TIMEOUT, transport.send(bytes))
        .await
        .map_err(|_| ProtocolPeerError::ConnectionTimeout)?
}

async fn receive_welcome<T>(
    transport: &mut T,
    local_max_frame_bytes: u32,
) -> Result<Welcome, ProtocolPeerError>
where
    T: FrameTransport,
{
    let bytes = transport.receive().await?;
    if bytes.len() > local_max_frame_bytes as usize {
        return Err(ProtocolPeerError::Protocol("frame_too_large"));
    }
    let frame = decode_frame(&bytes)
        .map_err(|_| ProtocolPeerError::Protocol("frame_invalid"))?
        .ok_or(ProtocolPeerError::Protocol("frame_preamble_missing"))?;
    if frame.sequence != 1 {
        return Err(ProtocolPeerError::Protocol("incoming_sequence_invalid"));
    }
    match frame.body {
        Some(Body::Welcome(welcome)) => Ok(welcome),
        Some(Body::GoAway(go_away)) => Err(ProtocolPeerError::Remote(StatusDisplay(
            go_away.status.unwrap_or_else(|| {
                protocol_status(StatusCode::Unavailable, "daemon_connection_closed")
            }),
        ))),
        Some(_) => Err(ProtocolPeerError::Protocol("welcome_expected")),
        None => Err(ProtocolPeerError::Protocol("frame_body_missing")),
    }
}

fn peer_instance_id() -> Result<String, ProtocolPeerError> {
    let mut bytes = [0_u8; 16];
    fill(&mut bytes).map_err(|_| ProtocolPeerError::Protocol("peer_identity_unavailable"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn call_deadline(call_timeout: Duration) -> Result<Instant, ProtocolPeerError> {
    if call_timeout_ms(call_timeout).is_err() {
        return Err(ProtocolPeerError::Protocol("call_timeout_invalid"));
    }
    Instant::now()
        .checked_add(call_timeout)
        .ok_or(ProtocolPeerError::Protocol("deadline_invalid"))
}

fn call_timeout_ms(call_timeout: Duration) -> Result<u32, ProtocolPeerError> {
    u32::try_from(call_timeout.as_millis())
        .ok()
        .filter(|value| *value != 0)
        .ok_or(ProtocolPeerError::Protocol("call_timeout_invalid"))
}

fn deadline_error() -> ProtocolPeerError {
    ProtocolPeerError::Remote(StatusDisplay(protocol_status(
        StatusCode::DeadlineExceeded,
        "daemon_request_timeout",
    )))
}

pub(super) fn protocol_status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

use agentstart_protocol::CURRENT_PROTOCOL_VERSION;
use agentstart_protocol::protocol::v1::frame::Body;
use agentstart_protocol::protocol::v1::{
    Frame, GoAway, Hello, Payload, PeerKind, Ping, Pong, Status, StatusCode, TransportFeature,
    Welcome,
};
use agentstart_protocol::transport::{
    FRAME_PREAMBLE_BYTES, decode_frame, encode_frame, has_frame_preamble,
};
use tokio::time::{Duration, Instant};

use super::channel::RpcOutgoing;
use super::session::SessionError;

pub(super) const INITIAL_CALL_CREDIT_BYTES: u64 = 4 * 1024 * 1024;
pub(super) const MAX_FRAME_BYTES: u32 = 1024 * 1024;
const KEEP_ALIVE_INTERVAL_MS: u32 = 20_000;

pub(super) enum ConnectionReceive {
    Body(Body),
    Consumed,
    Unrecognized,
}

pub(super) struct ProtocolConnection {
    awaiting_pong: Option<ExpectedPong>,
    expected_peer_kind: PeerKind,
    incoming_sequence: u64,
    is_negotiated: bool,
    next_ping_at: Option<Instant>,
    outgoing_sequence: u64,
    peer_call_credit_bytes: u64,
    peer_max_frame_bytes: u32,
    ping_nonce: u64,
    welcome: Welcome,
}

struct ExpectedPong {
    deadline: Instant,
    nonce: u64,
}

impl ProtocolConnection {
    pub(super) fn new(welcome: Welcome, expected_peer_kind: PeerKind) -> Self {
        Self {
            awaiting_pong: None,
            expected_peer_kind,
            incoming_sequence: 0,
            is_negotiated: false,
            next_ping_at: None,
            outgoing_sequence: 0,
            peer_call_credit_bytes: 0,
            peer_max_frame_bytes: 0,
            ping_nonce: 0,
            welcome,
        }
    }

    pub(super) fn receive(
        &mut self,
        bytes: &[u8],
        outgoing: &RpcOutgoing,
    ) -> Result<ConnectionReceive, SessionError> {
        if bytes.len() > MAX_FRAME_BYTES as usize {
            return if has_frame_preamble(bytes) {
                Err(protocol_error("Frame exceeds daemon maximum"))
            } else {
                Ok(ConnectionReceive::Unrecognized)
            };
        }
        let frame = match decode_frame(bytes) {
            Ok(Some(frame)) => frame,
            Ok(None) => return Ok(ConnectionReceive::Unrecognized),
            Err(error) => return Err(protocol_error(&error.to_string())),
        };
        let Some(body) = frame.body else {
            return Err(protocol_error("Protocol frame has no body"));
        };
        if !self.is_negotiated {
            let Body::Hello(hello) = body else {
                return Err(protocol_error("Hello must be the first protocol frame"));
            };
            self.negotiate(frame.sequence, hello, outgoing)?;
            return Ok(ConnectionReceive::Consumed);
        }
        self.advance_incoming_sequence(frame.sequence)?;
        let received = match body {
            Body::Ping(ping) => {
                self.send(Body::Pong(Pong { nonce: ping.nonce }), outgoing)?;
                ConnectionReceive::Consumed
            }
            Body::Pong(pong) => {
                self.accept_pong(pong)?;
                ConnectionReceive::Consumed
            }
            Body::Hello(_) | Body::Welcome(_) | Body::GoAway(_) => {
                return Err(protocol_error(
                    "Frame is invalid for an established session",
                ));
            }
            body => ConnectionReceive::Body(body),
        };
        self.note_peer_activity(Instant::now());
        Ok(received)
    }

    pub(super) fn maintain(
        &mut self,
        now: Instant,
        outgoing: &RpcOutgoing,
    ) -> Result<(), SessionError> {
        if self
            .awaiting_pong
            .as_ref()
            .is_some_and(|expected| expected.deadline <= now)
        {
            return Err(protocol_error("Peer did not answer the keepalive ping"));
        }
        if self.awaiting_pong.is_none() && self.next_ping_at.is_some_and(|deadline| deadline <= now)
        {
            self.send_ping(now, outgoing)?;
        }
        Ok(())
    }

    pub(super) fn next_maintenance_at(&self) -> Option<Instant> {
        self.awaiting_pong
            .as_ref()
            .map(|expected| expected.deadline)
            .or(self.next_ping_at)
    }

    pub(super) fn peer_call_credit_bytes(&self) -> u64 {
        self.peer_call_credit_bytes
    }

    pub(super) fn peer_kind(&self) -> PeerKind {
        self.expected_peer_kind
    }

    pub(super) fn routed_calls_enabled(&self) -> bool {
        self.welcome
            .enabled_transport_features
            .contains(&(TransportFeature::RoutedCalls as i32))
    }

    pub(super) fn reverse_calls_enabled(&self) -> bool {
        self.welcome
            .enabled_transport_features
            .contains(&(TransportFeature::ReverseCalls as i32))
    }

    pub(super) fn send_payload(
        &mut self,
        call_id: u64,
        data: Vec<u8>,
        outgoing: &RpcOutgoing,
    ) -> Result<bool, SessionError> {
        let (sequence, bytes) = self.encode_next(Body::Payload(Payload { call_id, data }))?;
        if self.peer_max_frame_bytes != 0 && bytes.len() > self.peer_max_frame_bytes as usize {
            return Ok(false);
        }
        outgoing
            .send_binary(bytes)
            .map_err(|_| SessionError::ChannelClosed)?;
        self.outgoing_sequence = sequence;
        Ok(true)
    }

    pub(super) fn send(&mut self, body: Body, outgoing: &RpcOutgoing) -> Result<(), SessionError> {
        let (sequence, bytes) = self.encode_next(body)?;
        if self.peer_max_frame_bytes != 0 && bytes.len() > self.peer_max_frame_bytes as usize {
            return Err(protocol_error("Frame exceeds peer maximum"));
        }
        outgoing
            .send_binary(bytes)
            .map_err(|_| SessionError::ChannelClosed)?;
        self.outgoing_sequence = sequence;
        Ok(())
    }

    fn encode_next(&self, body: Body) -> Result<(u64, Vec<u8>), SessionError> {
        let sequence = self
            .outgoing_sequence
            .checked_add(1)
            .ok_or_else(|| protocol_error("Daemon sequence overflowed"))?;
        let bytes = encode_frame(&Frame {
            protocol_version: CURRENT_PROTOCOL_VERSION,
            sequence,
            body: Some(body),
        })
        .map_err(|error| protocol_error(&error.to_string()))?;
        Ok((sequence, bytes))
    }

    fn negotiate(
        &mut self,
        sequence: u64,
        hello: Hello,
        outgoing: &RpcOutgoing,
    ) -> Result<(), SessionError> {
        if sequence != 1 {
            return Err(protocol_error("Hello must be the first peer frame"));
        }
        if !hello
            .supported_protocol_versions
            .contains(&CURRENT_PROTOCOL_VERSION)
        {
            self.send_go_away(outgoing, "No compatible protocol version")?;
            return Err(protocol_error("Peer has no compatible protocol version"));
        }
        if hello.max_frame_bytes < FRAME_PREAMBLE_BYTES as u32
            || hello.initial_call_credit_bytes == 0
            || hello.peer_name.is_empty()
            || hello.peer_version.is_empty()
            || hello.peer_instance_id.is_empty()
            || !transport_features_are_valid(&hello.supported_transport_features)
            || PeerKind::try_from(hello.peer_kind) != Ok(self.expected_peer_kind)
            || !is_client_peer(self.expected_peer_kind)
        {
            return Err(protocol_error("Hello contains invalid peer metadata"));
        }
        self.incoming_sequence = sequence;
        self.peer_call_credit_bytes = hello.initial_call_credit_bytes;
        self.peer_max_frame_bytes = hello.max_frame_bytes.min(MAX_FRAME_BYTES);
        self.welcome.enabled_transport_features =
            if self.expected_peer_kind == PeerKind::ChromeExtension {
                [
                    TransportFeature::RoutedCalls,
                    TransportFeature::ReverseCalls,
                ]
                .into_iter()
                .filter(|feature| {
                    hello
                        .supported_transport_features
                        .contains(&(*feature as i32))
                })
                .map(|feature| feature as i32)
                .collect()
            } else {
                Vec::new()
            };
        self.send(Body::Welcome(self.welcome.clone()), outgoing)?;
        self.is_negotiated = true;
        self.next_ping_at = Some(next_keep_alive(Instant::now())?);
        Ok(())
    }

    fn accept_pong(&mut self, pong: Pong) -> Result<(), SessionError> {
        let Some(expected) = self.awaiting_pong.take() else {
            return Err(protocol_error("Peer sent an unsolicited Pong"));
        };
        if pong.nonce != expected.nonce {
            self.awaiting_pong = Some(expected);
            return Err(protocol_error("Peer sent a Pong with the wrong nonce"));
        }
        Ok(())
    }

    fn note_peer_activity(&mut self, now: Instant) {
        if self.awaiting_pong.is_none() {
            self.next_ping_at = now.checked_add(keep_alive_interval());
        }
    }

    fn send_ping(&mut self, now: Instant, outgoing: &RpcOutgoing) -> Result<(), SessionError> {
        let nonce = self
            .ping_nonce
            .checked_add(1)
            .ok_or_else(|| protocol_error("Keepalive nonce overflowed"))?;
        self.send(Body::Ping(Ping { nonce }), outgoing)?;
        self.ping_nonce = nonce;
        self.next_ping_at = None;
        self.awaiting_pong = Some(ExpectedPong {
            deadline: next_keep_alive(now)?,
            nonce,
        });
        Ok(())
    }

    fn advance_incoming_sequence(&mut self, sequence: u64) -> Result<(), SessionError> {
        let expected = self
            .incoming_sequence
            .checked_add(1)
            .ok_or_else(|| protocol_error("Peer sequence overflowed"))?;
        if sequence != expected {
            return Err(protocol_error("Peer sequence is not contiguous"));
        }
        self.incoming_sequence = sequence;
        Ok(())
    }

    fn send_go_away(&mut self, outgoing: &RpcOutgoing, message: &str) -> Result<(), SessionError> {
        self.send(
            Body::GoAway(GoAway {
                status: Some(Status {
                    code: StatusCode::Unimplemented as i32,
                    message: message.to_owned(),
                    details: Vec::new(),
                }),
            }),
            outgoing,
        )
    }
}

fn is_client_peer(peer_kind: PeerKind) -> bool {
    matches!(
        peer_kind,
        PeerKind::ChromeExtension | PeerKind::IosApp | PeerKind::Cli | PeerKind::Daemon
    )
}

fn transport_features_are_valid(features: &[i32]) -> bool {
    features.iter().enumerate().all(|(index, feature)| {
        let Ok(feature) = TransportFeature::try_from(*feature) else {
            // Why: Hello is an offer. A newer peer's optional feature must not prevent an older
            // daemon from negotiating the known intersection.
            return true;
        };
        feature != TransportFeature::Unspecified && !features[..index].contains(&(feature as i32))
    })
}

fn keep_alive_interval() -> Duration {
    Duration::from_millis(u64::from(KEEP_ALIVE_INTERVAL_MS))
}

fn next_keep_alive(now: Instant) -> Result<Instant, SessionError> {
    now.checked_add(keep_alive_interval())
        .ok_or_else(|| protocol_error("Keepalive deadline cannot be represented"))
}

fn protocol_error(message: &str) -> SessionError {
    SessionError::Protocol(message.to_owned())
}

pub(super) fn keep_alive_interval_ms() -> u32 {
    KEEP_ALIVE_INTERVAL_MS
}

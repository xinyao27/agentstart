use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::{Semaphore, broadcast, mpsc};
use tokio::task::AbortHandle;

use crate::terminal_session::{
    TerminalClient, TerminalClientType, TerminalSessionAuthority, TerminalSessionError,
    TerminalSnapshotResult, TerminalStreamEvent,
};

use super::super::session::SessionError;

mod admission;
mod delivery;
mod frame;
mod input_control;
mod snapshot;
mod telemetry;
mod transport;
pub(super) use transport::run_protocol;

use telemetry::{
    FlushReason, FrameDirection, SAMPLE_INTERVAL, TerminalMultiplexStreamTelemetry,
    TerminalMultiplexTelemetry,
};

const ACK_BYTES: usize = 24;
const CONNECTION_IN_FLIGHT_BYTES: usize = 32 * 1024 * 1024;
const CREDIT_BYTES: usize = 16;
const DEFAULT_MAX_FRAME_BYTES: usize = 64 * 1024;
const EPOCH_BYTES: usize = 24;
const FRAME_HEADER_BYTES: usize = 40;
const HEARTBEAT: Duration = Duration::from_secs(15);
const HEARTBEAT_BYTES: usize = 16;
const MAX_PENDING_BYTES: usize = 8 * 1024 * 1024;
const MAX_STREAMS: usize = 1_024;
const OUTPUT_FRAME_BYTES: usize = 32 * 1024;
const SNAPSHOT_BUILD_CONCURRENCY: usize = 4;

const OP_EPOCH: u8 = 0x01;
const OP_HEARTBEAT: u8 = 0x02;
const OP_SUBSCRIBE: u8 = 0x10;
const OP_SUBSCRIBED: u8 = 0x11;
const OP_UNSUBSCRIBE: u8 = 0x12;
const OP_END: u8 = 0x13;
const OP_ERROR: u8 = 0x14;
const OP_OUTPUT: u8 = 0x15;
const OP_ACK: u8 = 0x16;
const OP_CREDIT: u8 = 0x17;
const OP_INPUT: u8 = 0x18;
const OP_RESIZE: u8 = 0x19;
const OP_RESIZED: u8 = 0x1a;
const OP_CLAIM_VIEWPORT: u8 = 0x1b;
const OP_SNAPSHOT_REQUEST: u8 = 0x1c;
const OP_SNAPSHOT_START: u8 = 0x1d;
const OP_SNAPSHOT_CHUNK: u8 = 0x1e;
const OP_SNAPSHOT_END: u8 = 0x1f;
const OP_VISIBILITY_GATE: u8 = 0x20;
const OP_REVEAL_SNAPSHOT: u8 = 0x21;
const OP_CLEAR_BUFFER: u8 = 0x23;
const OP_MODEL_RESTORE: u8 = 0x24;
const OP_SIGNAL: u8 = 0x25;
const OP_KILL: u8 = 0x26;

struct MultiplexSession<'a> {
    authority: TerminalSessionAuthority,
    binary: transport::Input<'a>,
    connection_id: String,
    connection_in_flight: usize,
    epoch: u64,
    generation: u32,
    heartbeat_id: u32,
    heartbeat_pending: HashMap<u32, u64>,
    is_closed: bool,
    last_authenticated: Instant,
    last_snapshot_id: u32,
    last_stream_id: u32,
    outgoing: transport::Output,
    phase: Phase,
    request_id: String,
    snapshot_permits: Arc<Semaphore>,
    stream_events: mpsc::Receiver<StreamEvent>,
    stream_event_sender: mpsc::Sender<StreamEvent>,
    streams: HashMap<u32, Stream>,
    telemetry: RefCell<TerminalMultiplexTelemetry>,
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum Phase {
    Heartbeat,
    Offer,
    Ready,
}

struct Stream {
    client: TerminalClient,
    credit_bytes: usize,
    delivery_interested: bool,
    delivery_visible: bool,
    exit_pending: Option<(i32, u64)>,
    forwarder: AbortHandle,
    handle: String,
    in_flight: VecDeque<SentOutput>,
    input_sequence: u64,
    last_ack_sequence: u64,
    last_sent_sequence: u64,
    pending: VecDeque<PendingOutput>,
    pending_bytes: usize,
    snapshot: snapshot::SnapshotCoordinator,
    state_version: u32,
    telemetry: TerminalMultiplexStreamTelemetry,
}

struct PendingOutput {
    bytes: Vec<u8>,
    end_sequence: u64,
}

struct SentOutput {
    bytes: usize,
    end_sequence: u64,
    sent_at: Instant,
}

enum StreamEvent {
    Provider {
        event: Result<TerminalStreamEvent, broadcast::error::RecvError>,
        route_id: u32,
    },
    Snapshot(snapshot::SnapshotBuilt),
}

struct Frame {
    correlation_id: u32,
    epoch: u64,
    opcode: u8,
    payload: Vec<u8>,
    route_id: u32,
    sequence: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubscribeRecord {
    capabilities: SubscribeCapabilities,
    client: SubscribeClient,
    delivery: SubscribeDelivery,
    last_parsed_seq: String,
    snapshot_max_bytes: u64,
    terminal: String,
    transport_generation: String,
    viewport: Option<Viewport>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SubscribeCapabilities {
    #[serde(rename = "dualScreenSnapshot")]
    dual_screen_snapshot: u8,
    #[serde(rename = "explicitWriteAck")]
    explicit_write_ack: u8,
    #[serde(rename = "parseAck")]
    parse_ack: u8,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SubscribeClient {
    id: String,
    r#type: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SubscribeDelivery {
    interested: bool,
    priority: String,
    visible: bool,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields)]
struct Viewport {
    cols: u16,
    rows: u16,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ResizeRecord {
    cols: u16,
    reason: String,
    rows: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotRequestRecord {
    requested_scrollback_rows: u64,
    snapshot_max_bytes: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RevealSnapshotRecord {
    state_version: u32,
}

async fn run_session<'a>(
    authority: TerminalSessionAuthority,
    connection_id: String,
    request_id: String,
    binary: transport::Input<'a>,
    outgoing: transport::Output,
    lane: &'static str,
) -> Result<(), SessionError> {
    let epoch = frame::random_nonzero_u64().map_err(|_| SessionError::TerminalDuplexUnavailable)?;
    let generation = frame::random_u32().map_err(|_| SessionError::TerminalDuplexUnavailable)?;
    let (stream_event_sender, stream_events) = mpsc::channel(512);
    let telemetry = TerminalMultiplexTelemetry::new(authority.diagnostics_trace(), lane)
        .map_err(|_| SessionError::TerminalDuplexUnavailable)?;
    let mut session = MultiplexSession {
        authority,
        binary,
        connection_id,
        connection_in_flight: 0,
        epoch,
        generation,
        heartbeat_id: 0,
        heartbeat_pending: HashMap::new(),
        is_closed: false,
        last_authenticated: Instant::now(),
        last_snapshot_id: frame::random_u32()
            .map_err(|_| SessionError::TerminalDuplexUnavailable)?,
        last_stream_id: 0,
        outgoing,
        phase: Phase::Offer,
        request_id,
        snapshot_permits: Arc::new(Semaphore::new(SNAPSHOT_BUILD_CONCURRENCY)),
        stream_events,
        stream_event_sender,
        streams: HashMap::new(),
        telemetry: RefCell::new(telemetry),
    };
    let mut heartbeat = tokio::time::interval(HEARTBEAT);
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    heartbeat.tick().await;
    let mut telemetry_interval = tokio::time::interval(SAMPLE_INTERVAL);
    telemetry_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    telemetry_interval.tick().await;
    let result = if let Err(failure) = session.send_epoch() {
        Err(failure)
    } else {
        loop {
            tokio::select! {
                frame = session.binary.receive() => {
                    let Some(frame) = frame? else {
                        break Ok(());
                    };
                    if let Err(failure) = session.handle_binary(frame).await {
                        break Err(failure);
                    }
                }
                event = session.stream_events.recv() => {
                    let Some(event) = event else {
                        break Ok(());
                    };
                    if let Err(failure) = session.handle_stream_event(event) {
                        break Err(failure);
                    }
                }
                _ = heartbeat.tick() => {
                    if session.last_authenticated.elapsed() >= HEARTBEAT.saturating_mul(2) {
                        session.note_connection_event("heartbeat timeout");
                        session.outgoing.close(1001, "heartbeat timeout");
                        break Ok(());
                    }
                    if session.phase != Phase::Offer
                        && session.last_authenticated.elapsed() >= HEARTBEAT
                        && let Err(failure) = session.send_heartbeat_offer()
                    {
                        break Err(failure);
                    }
                    if let Err(failure) = session.reject_stalled_streams() {
                        break Err(failure);
                    }
                }
                _ = telemetry_interval.tick() => session.flush_telemetry(FlushReason::Interval),
            }
        }
    };
    session.close();
    result
}

impl MultiplexSession<'_> {
    fn close(&mut self) {
        if self.is_closed {
            return;
        }
        self.is_closed = true;
        self.flush_telemetry(FlushReason::Close);
        let authority = self.authority.clone();
        for (_, stream) in self.streams.drain() {
            authority.unregister_viewer(&stream.handle, &stream.client.id);
        }
    }
}

impl Drop for MultiplexSession<'_> {
    fn drop(&mut self) {
        self.close();
    }
}

impl Drop for Stream {
    fn drop(&mut self) {
        self.forwarder.abort();
        self.snapshot.cancel();
    }
}

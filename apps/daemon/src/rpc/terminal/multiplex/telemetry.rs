use std::time::{Duration, Instant};

use serde_json::{Map, Value};

use crate::diagnostics::DiagnosticsTrace;

const OPCODE_BUCKETS: usize = 256;
pub(super) const SAMPLE_INTERVAL: Duration = Duration::from_secs(15);

#[derive(Clone, Copy)]
pub(super) enum FlushReason {
    Close,
    Interval,
}

pub(super) struct TerminalMultiplexTelemetry {
    environment_fingerprint: String,
    epoch_fingerprint: String,
    lane: &'static str,
    opcode_bytes: OpcodeMetrics,
    opcode_counts: OpcodeMetrics,
    trace: DiagnosticsTrace,
}

pub(super) struct TerminalMultiplexStreamTelemetry {
    ack_stalls: u64,
    delivery_rate_bytes_per_ms: Option<f64>,
    emit_base: Map<String, Value>,
    flow: Option<FlowSample>,
    gaps: u64,
    hidden_drops: u64,
    max_in_flight_bytes: usize,
    max_unsent_bytes: usize,
    previous_ack_at: Option<Instant>,
    producer_pauses: u64,
    receiver_queue_bytes: usize,
    rtt_ms: Option<f64>,
    trace: DiagnosticsTrace,
}

#[derive(Clone, Copy)]
struct FlowSample {
    credit_bytes: usize,
    in_flight_bytes: usize,
    is_producer_paused: bool,
    socket_queue_bytes: usize,
    unsent_bytes: usize,
}

struct OpcodeMetrics {
    received: [u64; OPCODE_BUCKETS],
    sent: [u64; OPCODE_BUCKETS],
}

pub(super) struct SnapshotSample {
    pub(super) duration_ms: f64,
    pub(super) reason: &'static str,
    pub(super) rows: u32,
    pub(super) size_bytes: usize,
    pub(super) status: u8,
    pub(super) truncated: bool,
}

impl TerminalMultiplexTelemetry {
    pub(super) fn new(
        trace: DiagnosticsTrace,
        lane: &'static str,
    ) -> Result<Self, getrandom::Error> {
        Ok(Self {
            environment_fingerprint: random_fingerprint()?,
            epoch_fingerprint: random_fingerprint()?,
            lane,
            opcode_bytes: OpcodeMetrics::new(),
            opcode_counts: OpcodeMetrics::new(),
            trace,
        })
    }

    pub(super) fn note_frame(&mut self, direction: FrameDirection, opcode: u8, bytes: usize) {
        self.opcode_counts.add(direction, opcode, 1);
        self.opcode_bytes
            .add(direction, opcode, u64::try_from(bytes).unwrap_or(u64::MAX));
    }

    pub(super) fn note_connection_event(&self, event: &'static str) {
        let mut attributes = self.base_attributes();
        attributes.insert("event".to_owned(), Value::String(event.to_owned()));
        self.emit("terminal.multiplex.connection-event", attributes);
    }

    pub(super) fn open_stream(&self) -> Result<TerminalMultiplexStreamTelemetry, getrandom::Error> {
        TerminalMultiplexStreamTelemetry::new(
            self.trace.clone(),
            self.lane,
            &self.environment_fingerprint,
            &self.epoch_fingerprint,
        )
    }

    pub(super) fn flush(&mut self, reason: FlushReason, active_streams: usize) {
        let mut attributes = self.base_attributes();
        attributes.insert(
            "reason".to_owned(),
            Value::String(reason.as_str().to_owned()),
        );
        attributes.insert(
            "opcode_counts".to_owned(),
            Value::String(self.opcode_counts.take_json()),
        );
        attributes.insert(
            "opcode_bytes".to_owned(),
            Value::String(self.opcode_bytes.take_json()),
        );
        attributes.insert(
            "active_streams".to_owned(),
            Value::from(u64::try_from(active_streams).unwrap_or(u64::MAX)),
        );
        if let Some(rss_bytes) = self.trace.process_rss_bytes() {
            attributes.insert("rss_bytes".to_owned(), Value::from(rss_bytes));
        }
        self.emit("terminal.multiplex.connection-metrics", attributes);
    }

    fn base_attributes(&self) -> Map<String, Value> {
        Map::from_iter([
            ("lane".to_owned(), Value::String(self.lane.to_owned())),
            (
                "environment_fingerprint".to_owned(),
                Value::String(self.environment_fingerprint.clone()),
            ),
            (
                "epoch_fingerprint".to_owned(),
                Value::String(self.epoch_fingerprint.clone()),
            ),
        ])
    }

    fn emit(&self, name: &'static str, attributes: Map<String, Value>) {
        let mut span = self.trace.start_span(name, attributes);
        span.success();
    }
}

impl TerminalMultiplexStreamTelemetry {
    fn new(
        trace: DiagnosticsTrace,
        lane: &'static str,
        environment_fingerprint: &str,
        epoch_fingerprint: &str,
    ) -> Result<Self, getrandom::Error> {
        let emit_base = Map::from_iter([
            ("lane".to_owned(), Value::String(lane.to_owned())),
            (
                "environment_fingerprint".to_owned(),
                Value::String(environment_fingerprint.to_owned()),
            ),
            (
                "epoch_fingerprint".to_owned(),
                Value::String(epoch_fingerprint.to_owned()),
            ),
            (
                "stream_fingerprint".to_owned(),
                Value::String(random_fingerprint()?),
            ),
        ]);
        Ok(Self {
            ack_stalls: 0,
            delivery_rate_bytes_per_ms: None,
            emit_base,
            flow: None,
            gaps: 0,
            hidden_drops: 0,
            max_in_flight_bytes: 0,
            max_unsent_bytes: 0,
            previous_ack_at: None,
            producer_pauses: 0,
            receiver_queue_bytes: 0,
            rtt_ms: None,
            trace,
        })
    }

    pub(super) fn observe_flow(
        &mut self,
        credit_bytes: usize,
        in_flight_bytes: usize,
        unsent_bytes: usize,
        socket_queue_bytes: usize,
    ) {
        let is_producer_paused =
            credit_bytes == 0 || (in_flight_bytes > 0 && in_flight_bytes >= credit_bytes);
        if is_producer_paused && self.flow.is_none_or(|flow| !flow.is_producer_paused) {
            self.producer_pauses = self.producer_pauses.saturating_add(1);
        }
        self.flow = Some(FlowSample {
            credit_bytes,
            in_flight_bytes,
            is_producer_paused,
            socket_queue_bytes,
            unsent_bytes,
        });
        self.max_in_flight_bytes = self.max_in_flight_bytes.max(in_flight_bytes);
        self.max_unsent_bytes = self.max_unsent_bytes.max(unsent_bytes);
    }

    pub(super) fn note_ack(
        &mut self,
        acknowledged_bytes: usize,
        receiver_queue_bytes: usize,
        oldest_sent_at: Option<Instant>,
    ) {
        let now = Instant::now();
        self.receiver_queue_bytes = receiver_queue_bytes;
        if let Some(sent_at) = oldest_sent_at {
            let sample_ms = now
                .duration_since(sent_at)
                .as_secs_f64()
                .mul_add(1_000.0, 0.0);
            let sample_ms = sample_ms.max(0.001);
            self.rtt_ms = Some(
                self.rtt_ms
                    .map_or(sample_ms, |rtt| rtt.mul_add(0.875, sample_ms * 0.125)),
            );
        }
        if let Some(previous_ack_at) = self.previous_ack_at {
            let interval_ms = now
                .duration_since(previous_ack_at)
                .as_secs_f64()
                .mul_add(1_000.0, 0.0)
                .max(1.0);
            let sample_rate = acknowledged_bytes as f64 / interval_ms;
            self.delivery_rate_bytes_per_ms = Some(
                self.delivery_rate_bytes_per_ms
                    .map_or(sample_rate, |rate| rate.mul_add(0.75, sample_rate * 0.25)),
            );
        }
        self.previous_ack_at = Some(now);
    }

    pub(super) fn note_ack_stall(&mut self) {
        self.ack_stalls = self.ack_stalls.saturating_add(1);
    }

    pub(super) fn note_gap(&mut self) {
        self.gaps = self.gaps.saturating_add(1);
    }

    pub(super) fn note_hidden_drop(&mut self) {
        self.hidden_drops = self.hidden_drops.saturating_add(1);
    }

    pub(super) fn note_snapshot(&self, sample: SnapshotSample) {
        let mut attributes = self.emit_base.clone();
        attributes.insert("reason".to_owned(), Value::String(sample.reason.to_owned()));
        attributes.insert(
            "size_bytes".to_owned(),
            Value::from(u64::try_from(sample.size_bytes).unwrap_or(u64::MAX)),
        );
        attributes.insert("rows".to_owned(), Value::from(sample.rows));
        attributes.insert("truncated".to_owned(), Value::Bool(sample.truncated));
        attributes.insert("duration_ms".to_owned(), Value::from(sample.duration_ms));
        attributes.insert("status".to_owned(), Value::from(sample.status));
        self.emit("terminal.multiplex.snapshot", attributes);
    }

    pub(super) fn flush(&mut self, reason: FlushReason) {
        let flow = self.flow.unwrap_or(FlowSample {
            credit_bytes: 0,
            in_flight_bytes: 0,
            is_producer_paused: false,
            socket_queue_bytes: 0,
            unsent_bytes: 0,
        });
        let mut attributes = self.emit_base.clone();
        attributes.insert(
            "reason".to_owned(),
            Value::String(reason.as_str().to_owned()),
        );
        insert_usize(&mut attributes, "credit_bytes", flow.credit_bytes);
        insert_usize(&mut attributes, "in_flight_bytes", flow.in_flight_bytes);
        insert_usize(
            &mut attributes,
            "max_in_flight_bytes",
            self.max_in_flight_bytes,
        );
        insert_usize(&mut attributes, "unsent_bytes", flow.unsent_bytes);
        insert_usize(&mut attributes, "max_unsent_bytes", self.max_unsent_bytes);
        insert_usize(
            &mut attributes,
            "receiver_queue_bytes",
            self.receiver_queue_bytes,
        );
        insert_usize(
            &mut attributes,
            "socket_queue_bytes",
            flow.socket_queue_bytes,
        );
        attributes.insert(
            "rtt_ms".to_owned(),
            Value::from(self.rtt_ms.unwrap_or(-1.0)),
        );
        attributes.insert(
            "delivery_rate_bytes_per_ms".to_owned(),
            Value::from(self.delivery_rate_bytes_per_ms.unwrap_or(-1.0)),
        );
        attributes.insert(
            "producer_paused".to_owned(),
            Value::Bool(flow.is_producer_paused),
        );
        attributes.insert(
            "producer_pauses".to_owned(),
            Value::from(self.producer_pauses),
        );
        attributes.insert("ack_stalls".to_owned(), Value::from(self.ack_stalls));
        attributes.insert("gaps".to_owned(), Value::from(self.gaps));
        attributes.insert("hidden_drops".to_owned(), Value::from(self.hidden_drops));
        self.emit("terminal.multiplex.stream-metrics", attributes);
        self.max_in_flight_bytes = flow.in_flight_bytes;
        self.max_unsent_bytes = flow.unsent_bytes;
        self.producer_pauses = 0;
        self.ack_stalls = 0;
        self.gaps = 0;
        self.hidden_drops = 0;
    }

    fn emit(&self, name: &'static str, attributes: Map<String, Value>) {
        let mut span = self.trace.start_span(name, attributes);
        span.success();
    }
}

#[derive(Clone, Copy)]
pub(super) enum FrameDirection {
    Received,
    Sent,
}

impl FlushReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::Close => "close",
            Self::Interval => "interval",
        }
    }
}

impl OpcodeMetrics {
    fn new() -> Self {
        Self {
            received: [0; OPCODE_BUCKETS],
            sent: [0; OPCODE_BUCKETS],
        }
    }

    fn add(&mut self, direction: FrameDirection, opcode: u8, value: u64) {
        let bucket = match direction {
            FrameDirection::Received => &mut self.received[usize::from(opcode)],
            FrameDirection::Sent => &mut self.sent[usize::from(opcode)],
        };
        *bucket = bucket.saturating_add(value);
    }

    fn take_json(&mut self) -> String {
        let mut attributes = Map::new();
        for (direction, buckets) in [("received", &mut self.received), ("sent", &mut self.sent)] {
            for (opcode, bucket) in buckets.iter_mut().enumerate() {
                if *bucket == 0 {
                    continue;
                }
                attributes.insert(format!("{direction}.{opcode}"), Value::from(*bucket));
                *bucket = 0;
            }
        }
        Value::Object(attributes).to_string()
    }
}

fn insert_usize(attributes: &mut Map<String, Value>, key: &'static str, value: usize) {
    attributes.insert(
        key.to_owned(),
        Value::from(u64::try_from(value).unwrap_or(u64::MAX)),
    );
}

fn random_fingerprint() -> Result<String, getrandom::Error> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut bytes = [0_u8; 6];
    getrandom::fill(&mut bytes)?;
    let mut fingerprint = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        fingerprint.push(char::from(HEX[usize::from(byte >> 4)]));
        fingerprint.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    Ok(fingerprint)
}

impl super::MultiplexSession<'_> {
    pub(super) fn note_connection_event(&self, event: &'static str) {
        self.telemetry.borrow().note_connection_event(event);
    }

    pub(super) fn refresh_stream_flow(&mut self, route_id: u32) {
        let socket_queue_bytes = self.outgoing.buffered_bytes();
        let Some(stream) = self.streams.get_mut(&route_id) else {
            return;
        };
        let in_flight_bytes = usize::try_from(
            stream
                .last_sent_sequence
                .saturating_sub(stream.last_ack_sequence),
        )
        .unwrap_or(usize::MAX);
        stream.telemetry.observe_flow(
            stream.credit_bytes,
            in_flight_bytes,
            stream.pending_bytes,
            socket_queue_bytes,
        );
    }

    pub(super) fn flush_telemetry(&mut self, reason: FlushReason) {
        let socket_queue_bytes = self.outgoing.buffered_bytes();
        for stream in self.streams.values_mut() {
            let in_flight_bytes = usize::try_from(
                stream
                    .last_sent_sequence
                    .saturating_sub(stream.last_ack_sequence),
            )
            .unwrap_or(usize::MAX);
            stream.telemetry.observe_flow(
                stream.credit_bytes,
                in_flight_bytes,
                stream.pending_bytes,
                socket_queue_bytes,
            );
        }
        self.telemetry.get_mut().flush(reason, self.streams.len());
        for stream in self.streams.values_mut() {
            stream.telemetry.flush(reason);
        }
    }
}

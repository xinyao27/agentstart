use super::*;
use std::sync::atomic::{AtomicBool, Ordering};

const DEFAULT_SCROLLBACK_ROWS: usize = 1_000;
const SNAPSHOT_CHUNK_DATA_BYTES: usize = 48 * 1024;
const SUPERSEDED_SNAPSHOT_ACK_LIMIT: usize = 1_024;

#[derive(Clone, Copy, Eq, PartialEq)]
pub(super) enum SnapshotReason {
    Initial,
    Manual,
    Recovery,
    Reveal,
    Resume,
    PendingCap,
    NormalBufferResize,
}

pub(super) struct SnapshotCoordinator {
    active: Option<ActiveSnapshot>,
    client_max_bytes: usize,
    delivery_active: bool,
    generation: u64,
    superseded_acks: VecDeque<PendingSnapshot>,
}

struct ActiveSnapshot {
    cancellation: Arc<AtomicBool>,
    coverage_end_sequence: Option<u64>,
    generation: u64,
    id: u32,
    reason: SnapshotReason,
    started_at: Instant,
    task: Option<AbortHandle>,
}

#[derive(Clone, Copy)]
struct PendingSnapshot {
    coverage_end_sequence: u64,
    id: u32,
}

pub(super) struct SnapshotBuilt {
    pub(super) duration: Duration,
    pub(super) generation: u64,
    pub(super) result: TerminalSnapshotResult,
    pub(super) route_id: u32,
}

struct SupersededSnapshot {
    coverage_end_sequence: u64,
    duration: Option<Duration>,
    id: u32,
    reason: SnapshotReason,
}

struct SentSnapshot {
    assembled_bytes: usize,
    coverage_end_sequence: u64,
    retained_scrollback_rows: u32,
    status: u8,
    truncated: bool,
}

impl SnapshotCoordinator {
    pub(super) fn new(client_max_bytes: usize, delivery_active: bool) -> Self {
        Self {
            active: None,
            client_max_bytes,
            delivery_active,
            generation: 0,
            superseded_acks: VecDeque::new(),
        }
    }

    pub(super) fn cancel(&mut self) {
        if let Some(active) = self.active.take() {
            active.cancellation.store(true, Ordering::Release);
            if let Some(task) = active.task {
                task.abort();
            }
        }
        self.superseded_acks.clear();
    }

    pub(super) fn is_active(&self) -> bool {
        self.active.is_some()
    }

    pub(super) fn is_delivery_active(&self) -> bool {
        self.delivery_active
    }

    pub(super) fn set_delivery_active(&mut self, active: bool) {
        self.delivery_active = active;
    }

    fn prepare(
        &mut self,
        id: u32,
        reason: SnapshotReason,
        fallback_coverage: u64,
    ) -> Option<(u64, Arc<AtomicBool>, Option<SupersededSnapshot>)> {
        if self
            .active
            .as_ref()
            .is_some_and(|active| reason.priority() <= active.reason.priority())
        {
            return None;
        }
        let superseded = self.active.take().map(|active| {
            active.cancellation.store(true, Ordering::Release);
            if let Some(task) = active.task {
                task.abort();
            }
            let was_sent = active.coverage_end_sequence.is_some();
            let coverage_end_sequence = active.coverage_end_sequence.unwrap_or(fallback_coverage);
            if was_sent {
                self.remember_superseded(PendingSnapshot {
                    coverage_end_sequence,
                    id: active.id,
                });
            }
            SupersededSnapshot {
                coverage_end_sequence,
                duration: (!was_sent).then(|| active.started_at.elapsed()),
                id: active.id,
                reason: active.reason,
            }
        });
        self.generation = self.generation.wrapping_add(1);
        let generation = self.generation;
        let cancellation = Arc::new(AtomicBool::new(false));
        self.active = Some(ActiveSnapshot {
            cancellation: cancellation.clone(),
            coverage_end_sequence: None,
            generation,
            id,
            reason,
            started_at: Instant::now(),
            task: None,
        });
        Some((generation, cancellation, superseded))
    }

    fn remember_superseded(&mut self, pending: PendingSnapshot) {
        self.superseded_acks
            .retain(|candidate| candidate.id != pending.id);
        self.superseded_acks.push_back(pending);
        while self.superseded_acks.len() > SUPERSEDED_SNAPSHOT_ACK_LIMIT {
            self.superseded_acks.pop_front();
        }
    }
}

impl SnapshotReason {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Initial => "initial",
            Self::Manual => "manual",
            Self::Recovery => "recovery",
            Self::Reveal => "reveal",
            Self::Resume => "resume",
            Self::PendingCap => "pending-cap",
            Self::NormalBufferResize => "normal-buffer-resize",
        }
    }

    fn priority(self) -> u8 {
        match self {
            Self::Initial => 5,
            Self::Recovery | Self::PendingCap | Self::NormalBufferResize => 4,
            Self::Reveal => 3,
            Self::Resume => 2,
            Self::Manual => 1,
        }
    }

    fn wire(self) -> u8 {
        match self {
            Self::Initial => 0,
            Self::Manual => 1,
            Self::Recovery => 2,
            Self::Reveal => 3,
            Self::Resume => 4,
            Self::PendingCap => 5,
            Self::NormalBufferResize => 6,
        }
    }
}

impl MultiplexSession<'_> {
    pub(super) fn allocate_snapshot_id(&mut self) -> u32 {
        loop {
            self.last_snapshot_id = self.last_snapshot_id.wrapping_add(1).max(1);
            let id = self.last_snapshot_id;
            if self.streams.values().all(|stream| {
                stream.snapshot.active.as_ref().map(|active| active.id) != Some(id)
                    && stream
                        .snapshot
                        .superseded_acks
                        .iter()
                        .all(|pending| pending.id != id)
            }) {
                return id;
            }
        }
    }

    pub(super) fn start_snapshot(
        &mut self,
        route_id: u32,
        snapshot_id: u32,
        reason: SnapshotReason,
        requested_scrollback_rows: Option<usize>,
        max_bytes: Option<usize>,
    ) -> Result<(), SessionError> {
        let fallback_coverage = self.stream_sequence(route_id);
        let Some(stream) = self.streams.get_mut(&route_id) else {
            return Ok(());
        };
        let Some((generation, cancellation, superseded)) =
            stream
                .snapshot
                .prepare(snapshot_id, reason, fallback_coverage)
        else {
            return Ok(());
        };
        let pending_delivery_start_sequence =
            Some(stream.in_flight.front().map_or(fallback_coverage, |sent| {
                sent.end_sequence.saturating_sub(sent.bytes as u64)
            }));
        let handle = stream.handle.clone();
        let client_max_bytes = stream
            .snapshot
            .client_max_bytes
            .min(max_bytes.unwrap_or(usize::MAX));
        if reason == SnapshotReason::Reveal {
            stream.delivery_visible = true;
            stream.snapshot.set_delivery_active(true);
        }
        if let Some(superseded) = superseded {
            self.send_snapshot_end(
                route_id,
                superseded.id,
                3,
                superseded.coverage_end_sequence,
                0,
                0,
            )?;
            if let Some(duration) = superseded.duration
                && let Some(stream) = self.streams.get_mut(&route_id)
            {
                stream.telemetry.note_snapshot(telemetry::SnapshotSample {
                    duration_ms: duration.as_secs_f64() * 1_000.0,
                    reason: superseded.reason.as_str(),
                    rows: 0,
                    size_bytes: 0,
                    status: 3,
                    truncated: false,
                });
            }
        }
        let authority = self.authority.clone();
        let events = self.stream_event_sender.clone();
        let permits = self.snapshot_permits.clone();
        let started_at = Instant::now();
        let task = tokio::spawn(async move {
            let Ok(_permit) = permits.acquire_owned().await else {
                return;
            };
            let result = authority
                .terminal_snapshot(
                    &handle,
                    cancellation,
                    client_max_bytes,
                    pending_delivery_start_sequence,
                    requested_scrollback_rows.unwrap_or(DEFAULT_SCROLLBACK_ROWS),
                )
                .await;
            let _ = events
                .send(StreamEvent::Snapshot(SnapshotBuilt {
                    duration: started_at.elapsed(),
                    generation,
                    result,
                    route_id,
                }))
                .await;
        });
        if let Some(stream) = self.streams.get_mut(&route_id)
            && let Some(active) = stream.snapshot.active.as_mut()
            && active.generation == generation
        {
            active.task = Some(task.abort_handle());
        }
        Ok(())
    }

    pub(super) fn handle_snapshot_built(
        &mut self,
        built: SnapshotBuilt,
    ) -> Result<(), SessionError> {
        let Some((snapshot_id, reason)) = self
            .streams
            .get(&built.route_id)
            .and_then(|stream| stream.snapshot.active.as_ref())
            .filter(|active| active.generation == built.generation)
            .map(|active| (active.id, active.reason))
        else {
            return Ok(());
        };
        let fallback_coverage = self.stream_sequence(built.route_id);
        let sent = self.send_snapshot_result(
            built.route_id,
            snapshot_id,
            reason,
            built.result,
            fallback_coverage,
        )?;
        if let Some(stream) = self.streams.get_mut(&built.route_id) {
            stream.telemetry.note_snapshot(telemetry::SnapshotSample {
                duration_ms: built.duration.as_secs_f64() * 1_000.0,
                reason: reason.as_str(),
                rows: sent.retained_scrollback_rows,
                size_bytes: sent.assembled_bytes,
                status: sent.status,
                truncated: sent.truncated,
            });
        }
        if sent.status == 0 {
            if let Some(stream) = self.streams.get_mut(&built.route_id)
                && let Some(active) = stream.snapshot.active.as_mut()
                && active.generation == built.generation
            {
                active.coverage_end_sequence = Some(sent.coverage_end_sequence);
                active.task = None;
            }
            return Ok(());
        }
        if let Some(stream) = self.streams.get_mut(&built.route_id) {
            stream.snapshot.active.take();
        }
        if reason != SnapshotReason::Manual {
            self.rebase_stream(built.route_id, sent.coverage_end_sequence);
        }
        self.flush_stream(built.route_id)
    }

    pub(super) fn acknowledge_snapshot(
        &mut self,
        route_id: u32,
        snapshot_id: u32,
        coverage_end_sequence: u64,
    ) -> Result<bool, SessionError> {
        let mut completion = None;
        let mut matched_superseded = false;
        if let Some(stream) = self.streams.get_mut(&route_id) {
            let matches_active = stream.snapshot.active.as_ref().is_some_and(|active| {
                active.id == snapshot_id
                    && active.coverage_end_sequence == Some(coverage_end_sequence)
            });
            if matches_active {
                completion = stream.snapshot.active.take().map(|active| active.reason);
            } else if let Some(index) = stream.snapshot.superseded_acks.iter().position(|pending| {
                pending.id == snapshot_id && pending.coverage_end_sequence == coverage_end_sequence
            }) {
                stream.snapshot.superseded_acks.remove(index);
                matched_superseded = true;
            }
        }
        let Some(reason) = completion else {
            return Ok(matched_superseded);
        };
        if reason != SnapshotReason::Manual {
            self.rebase_stream(route_id, coverage_end_sequence);
        }
        self.flush_stream(route_id)?;
        Ok(true)
    }

    pub(super) fn recover_stream(
        &mut self,
        route_id: u32,
        cause: &'static str,
    ) -> Result<(), SessionError> {
        let delivery_active = self
            .streams
            .get(&route_id)
            .is_some_and(|stream| stream.snapshot.is_delivery_active());
        let sequence = self.stream_sequence(route_id);
        self.send_json(
            OP_MODEL_RESTORE,
            route_id,
            sequence,
            0,
            json!({
                "reason": cause,
                "markerSeq": sequence.to_string(),
                "snapshotFollows": delivery_active
            }),
        )?;
        if !delivery_active {
            return Ok(());
        }
        if cause == "pending-cap"
            && let Some(stream) = self.streams.get_mut(&route_id)
        {
            stream.pending.clear();
            stream.pending_bytes = 0;
        }
        let snapshot_id = self.allocate_snapshot_id();
        let reason = if cause == "pending-cap" {
            SnapshotReason::PendingCap
        } else {
            SnapshotReason::Recovery
        };
        self.start_snapshot(route_id, snapshot_id, reason, None, None)
    }

    fn send_snapshot_result(
        &self,
        route_id: u32,
        snapshot_id: u32,
        reason: SnapshotReason,
        result: TerminalSnapshotResult,
        fallback_coverage: u64,
    ) -> Result<SentSnapshot, SessionError> {
        let snapshot = match result {
            TerminalSnapshotResult::Complete(snapshot) => snapshot,
            TerminalSnapshotResult::TooLarge {
                coverage_end_sequence,
            } => {
                self.send_snapshot_end(route_id, snapshot_id, 2, coverage_end_sequence, 0, 0)?;
                return Ok(SentSnapshot {
                    assembled_bytes: 0,
                    coverage_end_sequence,
                    retained_scrollback_rows: 0,
                    status: 2,
                    truncated: true,
                });
            }
            TerminalSnapshotResult::Unavailable => {
                self.send_snapshot_end(route_id, snapshot_id, 1, fallback_coverage, 0, 0)?;
                return Ok(SentSnapshot {
                    assembled_bytes: 0,
                    coverage_end_sequence: fallback_coverage,
                    retained_scrollback_rows: 0,
                    status: 1,
                    truncated: false,
                });
            }
        };
        let section_bytes = snapshot
            .sections
            .each_ref()
            .map(|section| u32::try_from(section.len()).unwrap_or(u32::MAX));
        let mut start = vec![0_u8; 64];
        start[0..4].copy_from_slice(&snapshot_id.to_le_bytes());
        start[4] = reason.wire();
        start[5] = 0;
        start[6] = snapshot.active_buffer;
        start[7] = u8::from(snapshot.truncated) | (u8::from(snapshot.truncated) << 1);
        start[8..10].copy_from_slice(&snapshot.cols.to_le_bytes());
        start[10..12].copy_from_slice(&snapshot.rows.to_le_bytes());
        start[12..16].copy_from_slice(&snapshot.retained_scrollback_rows.to_le_bytes());
        start[24..32].copy_from_slice(&snapshot.coverage_end_sequence.to_le_bytes());
        start[32..40].copy_from_slice(&snapshot.pending_delivery_start_sequence.to_le_bytes());
        for (index, bytes) in section_bytes.iter().enumerate() {
            let offset = 40 + index * 4;
            start[offset..offset + 4].copy_from_slice(&bytes.to_le_bytes());
        }
        self.send_frame(
            OP_SNAPSHOT_START,
            route_id,
            snapshot.coverage_end_sequence,
            snapshot_id,
            &start,
        )?;
        for (section_index, section) in snapshot.sections.iter().enumerate() {
            for (chunk_index, chunk) in section.chunks(SNAPSHOT_CHUNK_DATA_BYTES).enumerate() {
                let mut payload = vec![0_u8; 16 + chunk.len()];
                payload[0..4].copy_from_slice(&snapshot_id.to_le_bytes());
                payload[4] = u8::try_from(section_index).unwrap_or(4);
                let section_offset =
                    u32::try_from(chunk_index * SNAPSHOT_CHUNK_DATA_BYTES).unwrap_or(u32::MAX);
                payload[8..12].copy_from_slice(&section_offset.to_le_bytes());
                payload[12..16]
                    .copy_from_slice(&u32::try_from(chunk.len()).unwrap_or(u32::MAX).to_le_bytes());
                payload[16..].copy_from_slice(chunk);
                self.send_frame(
                    OP_SNAPSHOT_CHUNK,
                    route_id,
                    snapshot.coverage_end_sequence,
                    snapshot_id,
                    &payload,
                )?;
            }
        }
        let assembled_bytes = snapshot.sections.iter().map(Vec::len).sum::<usize>();
        let crc32c = crc32c(&snapshot.sections);
        self.send_snapshot_end(
            route_id,
            snapshot_id,
            0,
            snapshot.coverage_end_sequence,
            u32::try_from(assembled_bytes).unwrap_or(u32::MAX),
            crc32c,
        )?;
        Ok(SentSnapshot {
            assembled_bytes,
            coverage_end_sequence: snapshot.coverage_end_sequence,
            retained_scrollback_rows: snapshot.retained_scrollback_rows,
            status: 0,
            truncated: snapshot.truncated,
        })
    }

    fn send_snapshot_end(
        &self,
        route_id: u32,
        snapshot_id: u32,
        status: u8,
        coverage_end_sequence: u64,
        assembled_bytes: u32,
        crc32c: u32,
    ) -> Result<(), SessionError> {
        let mut payload = vec![0_u8; 24];
        payload[0..4].copy_from_slice(&snapshot_id.to_le_bytes());
        payload[4] = status;
        payload[8..16].copy_from_slice(&coverage_end_sequence.to_le_bytes());
        payload[16..20].copy_from_slice(&assembled_bytes.to_le_bytes());
        payload[20..24].copy_from_slice(&crc32c.to_le_bytes());
        self.send_frame(
            OP_SNAPSHOT_END,
            route_id,
            coverage_end_sequence,
            snapshot_id,
            &payload,
        )
    }

    fn stream_sequence(&self, route_id: u32) -> u64 {
        self.streams.get(&route_id).map_or(0, |stream| {
            let delivered_sequence = stream
                .pending
                .back()
                .map_or(stream.last_sent_sequence, |output| output.end_sequence);
            self.authority
                .terminal_wire_byte_sequence(&stream.handle)
                .unwrap_or(delivered_sequence)
        })
    }

    fn rebase_stream(&mut self, route_id: u32, coverage_end_sequence: u64) {
        let Some(stream) = self.streams.get_mut(&route_id) else {
            return;
        };
        let released = stream
            .in_flight
            .iter()
            .map(|sent| sent.bytes)
            .sum::<usize>();
        self.connection_in_flight = self.connection_in_flight.saturating_sub(released);
        stream.in_flight.clear();
        stream.last_ack_sequence = coverage_end_sequence;
        stream.last_sent_sequence = coverage_end_sequence;
        while stream
            .pending
            .front()
            .is_some_and(|pending| pending.end_sequence <= coverage_end_sequence)
        {
            if let Some(pending) = stream.pending.pop_front() {
                stream.pending_bytes = stream.pending_bytes.saturating_sub(pending.bytes.len());
            }
        }
        if let Some(front) = stream.pending.front_mut() {
            let start_sequence = front.end_sequence.saturating_sub(front.bytes.len() as u64);
            if start_sequence < coverage_end_sequence {
                let count = usize::try_from(coverage_end_sequence - start_sequence)
                    .unwrap_or(usize::MAX)
                    .min(front.bytes.len());
                front.bytes.drain(..count);
                stream.pending_bytes = stream.pending_bytes.saturating_sub(count);
            }
        }
    }
}

fn crc32c(sections: &[Vec<u8>; 5]) -> u32 {
    let mut crc = !0_u32;
    for byte in sections.iter().flat_map(|section| section.iter()).copied() {
        crc ^= u32::from(byte);
        for _ in 0..8 {
            let mask = 0_u32.wrapping_sub(crc & 1);
            crc = (crc >> 1) ^ (0x82f6_3b78 & mask);
        }
    }
    !crc
}

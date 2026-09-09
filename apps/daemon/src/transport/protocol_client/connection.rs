use std::collections::HashMap;

use tokio::sync::{OwnedSemaphorePermit, mpsc, oneshot};
use tokio::time::{Instant, sleep_until, timeout};
use yiru_protocol::CURRENT_PROTOCOL_VERSION;
use yiru_protocol::method_metadata::MethodMetadata;
use yiru_protocol::protocol::v1::frame::Body;
use yiru_protocol::protocol::v1::{
    CallEnd, CallStart, Cancel, Frame, Payload, Ping, Pong, Status, StatusCode, Welcome,
    WindowUpdate,
};
use yiru_protocol::transport::{decode_frame, encode_frame};

use super::duplex::DuplexCredit;
use super::outbound::{Outbound, TRANSPORT_IO_TIMEOUT};
use super::stream::CallCompletion;
use super::{
    FrameTransportEvent, FrameTransportReader, MAX_ACTIVE_CALLS, ProtocolPeerError, StatusDisplay,
    protocol_status,
};

const MAX_STREAM_BUFFERED_ITEMS: usize = 32;
pub(super) const STREAM_QUEUE_CAPACITY: usize = MAX_STREAM_BUFFERED_ITEMS + 1;

pub(super) enum ClientCommand {
    DuplexPayload {
        call_id: u64,
        payload: Vec<u8>,
        outbound: super::outbound::RequestPermit,
        budget: OwnedSemaphorePermit,
        completion_tx: oneshot::Sender<Result<(), ProtocolPeerError>>,
    },
    DuplexEnd {
        call_id: u64,
        completion_tx: oneshot::Sender<Result<(), ProtocolPeerError>>,
    },
    Close {
        closed_tx: oneshot::Sender<()>,
    },
    StartStream {
        admission_tx: oneshot::Sender<Result<u64, ProtocolPeerError>>,
        budget: OwnedSemaphorePermit,
        completion: CallCompletion,
        duplex_credit: Option<DuplexCredit>,
        deadline: Instant,
        item_tx: mpsc::Sender<Result<Vec<u8>, ProtocolPeerError>>,
        metadata: &'static MethodMetadata,
        payload: Vec<u8>,
        timeout_ms: u32,
    },
    StartUnary {
        admission_tx: oneshot::Sender<Result<u64, ProtocolPeerError>>,
        budget: OwnedSemaphorePermit,
        deadline: Instant,
        metadata: &'static MethodMetadata,
        payload: Vec<u8>,
        result_tx: oneshot::Sender<Result<Vec<u8>, ProtocolPeerError>>,
        timeout_ms: u32,
    },
}

pub(super) struct ConsumedCredit {
    pub(super) call_id: u64,
    pub(super) credit_bytes: u64,
    pub(super) restored_tx: oneshot::Sender<()>,
}

struct CallAdmission {
    metadata: &'static MethodMetadata,
    payload: Vec<u8>,
    timeout_ms: u32,
    deadline: Instant,
    kind: PendingKind,
    budget: OwnedSemaphorePermit,
    duplex_credit: Option<DuplexCredit>,
}

struct ExpectedPong {
    deadline: Instant,
    nonce: u64,
}

enum PendingKind {
    Stream {
        buffered_items: usize,
        completion: CallCompletion,
        item_tx: mpsc::Sender<Result<Vec<u8>, ProtocolPeerError>>,
    },
    Unary {
        response: Option<Vec<u8>>,
        result_tx: oneshot::Sender<Result<Vec<u8>, ProtocolPeerError>>,
    },
}

struct PendingCall {
    duplex_credit: Option<DuplexCredit>,
    request_ended: bool,
    deadline: Instant,
    kind: PendingKind,
    request_credit_bytes: u64,
    response_credit_bytes: u64,
}

struct RetiredCall {
    deadline: Instant,
    request_credit_bytes: u64,
    response_credit_bytes: u64,
}

struct StartFailure {
    error: ProtocolPeerError,
    kind: PendingKind,
    is_terminal: bool,
}

pub(super) struct ConnectionChannels<Reader> {
    pub(super) cancel_rx: mpsc::UnboundedReceiver<u64>,
    pub(super) command_rx: mpsc::Receiver<ClientCommand>,
    pub(super) credit_rx: mpsc::Receiver<ConsumedCredit>,
    pub(super) outbound: Outbound,
    pub(super) reader: Reader,
    pub(super) writer_done: oneshot::Receiver<Result<(), ProtocolPeerError>>,
}

pub(super) struct ProtocolConnection<Reader> {
    awaiting_pong: Option<ExpectedPong>,
    cancel_rx: mpsc::UnboundedReceiver<u64>,
    command_rx: mpsc::Receiver<ClientCommand>,
    credit_rx: mpsc::Receiver<ConsumedCredit>,
    incoming_sequence: u64,
    keep_alive_interval: std::time::Duration,
    local_call_credit_bytes: u64,
    local_max_frame_bytes: u32,
    next_call_id: Option<u64>,
    next_ping_at: Instant,
    outbound: Outbound,
    outgoing_sequence: u64,
    peer_call_credit_bytes: u64,
    peer_max_frame_bytes: u32,
    pending: HashMap<u64, PendingCall>,
    ping_nonce: u64,
    retired: HashMap<u64, RetiredCall>,
    reader: Reader,
    writer_done: oneshot::Receiver<Result<(), ProtocolPeerError>>,
}

impl<Reader> ProtocolConnection<Reader>
where
    Reader: FrameTransportReader,
{
    pub(super) fn new(
        channels: ConnectionChannels<Reader>,
        local_call_credit_bytes: u64,
        local_max_frame_bytes: u32,
        welcome: Welcome,
    ) -> Result<Self, ProtocolPeerError> {
        let keep_alive_interval =
            std::time::Duration::from_millis(u64::from(welcome.keep_alive_interval_ms));
        let next_ping_at = deadline_after(Instant::now(), keep_alive_interval)?;
        Ok(Self {
            awaiting_pong: None,
            cancel_rx: channels.cancel_rx,
            command_rx: channels.command_rx,
            credit_rx: channels.credit_rx,
            incoming_sequence: 1,
            keep_alive_interval,
            local_call_credit_bytes,
            local_max_frame_bytes,
            next_call_id: Some(1),
            next_ping_at,
            outbound: channels.outbound,
            outgoing_sequence: 1,
            peer_call_credit_bytes: welcome.initial_call_credit_bytes,
            peer_max_frame_bytes: welcome.max_frame_bytes,
            pending: HashMap::new(),
            ping_nonce: 0,
            retired: HashMap::new(),
            reader: channels.reader,
            writer_done: channels.writer_done,
        })
    }

    pub(super) async fn run(mut self) {
        let exit = loop {
            let wake_at = self.next_wake_at();
            tokio::select! {
                command = self.command_rx.recv() => {
                    let Some(command) = command else {
                        break ConnectionExit::Error(ProtocolPeerError::ConnectionFailed);
                    };
                    match self.handle_command(command) {
                        Ok(ConnectionAction::Continue) => {}
                        Ok(ConnectionAction::Close(closed_tx)) => {
                            break ConnectionExit::Close(closed_tx);
                        }
                        Err(error) => break ConnectionExit::Error(error),
                    }
                }
                call_id = self.cancel_rx.recv() => {
                    match call_id {
                        Some(call_id) => {
                            if let Err(error) = self.cancel_call(call_id, cancelled_status()) {
                                break ConnectionExit::Error(error);
                            }
                        }
                        None => break ConnectionExit::Error(ProtocolPeerError::ConnectionFailed),
                    }
                }
                credit = self.credit_rx.recv() => {
                    match credit {
                        Some(credit) => {
                            match self.restore_response_credit(credit.call_id, credit.credit_bytes) {
                                Ok(()) => {
                                    let _ = credit.restored_tx.send(());
                                }
                                Err(error) => break ConnectionExit::Error(error),
                            }
                        }
                        None => break ConnectionExit::Error(ProtocolPeerError::ConnectionFailed),
                    }
                }
                received = self.reader.receive() => {
                    match received {
                        Ok(FrameTransportEvent::Frame(bytes)) => match self.decode(&bytes) {
                            Ok(body) => if let Err(error) = self.handle_incoming(body) {
                                break ConnectionExit::Error(error);
                            },
                            Err(error) => break ConnectionExit::Error(error),
                        },
                        Ok(FrameTransportEvent::Ping(payload)) => {
                            if let Err(error) = self.outbound.pong(payload) {
                                break ConnectionExit::Error(error);
                            }
                        }
                        Err(error) => break ConnectionExit::Error(error),
                    }
                }
                () = sleep_until(wake_at) => {
                    if let Err(error) = self.maintain() {
                        break ConnectionExit::Error(error);
                    }
                }
                writer = &mut self.writer_done => {
                    let error = match writer {
                        Ok(Err(error)) => error,
                        Ok(Ok(())) | Err(_) => ProtocolPeerError::ConnectionFailed,
                    };
                    break ConnectionExit::Writer(error);
                }
            }
        };
        let (terminal_error, closed_tx, writer_finished) = match exit {
            ConnectionExit::Close(closed_tx) => {
                (ProtocolPeerError::ConnectionFailed, Some(closed_tx), false)
            }
            ConnectionExit::Error(error) => (error, None, false),
            ConnectionExit::Writer(error) => (error, None, true),
        };
        self.fail_all(terminal_error);
        self.outbound.shutdown();
        if !writer_finished {
            let _ = timeout(TRANSPORT_IO_TIMEOUT, &mut self.writer_done).await;
        }
        if let Some(closed_tx) = closed_tx {
            let _ = closed_tx.send(());
        }
    }

    fn handle_command(
        &mut self,
        command: ClientCommand,
    ) -> Result<ConnectionAction, ProtocolPeerError> {
        match command {
            ClientCommand::DuplexPayload {
                call_id,
                payload,
                budget,
                outbound,
                completion_tx,
            } => {
                let result = self.send_duplex_payload(call_id, payload, budget, outbound);
                let _ = completion_tx.send(result.clone());
                if result.is_err() {
                    self.cancel_call(call_id, cancelled_status())?;
                }
                Ok(ConnectionAction::Continue)
            }
            ClientCommand::DuplexEnd {
                call_id,
                completion_tx,
            } => {
                let result = if let Some(call) = self.pending.get_mut(&call_id) {
                    if call.duplex_credit.is_none() || call.request_ended {
                        Err(ProtocolPeerError::Protocol("duplex_not_active"))
                    } else {
                        call.request_ended = true;
                        self.send(Body::CallEnd(CallEnd {
                            call_id,
                            status: Some(ok_status()),
                        }))
                    }
                } else {
                    Err(ProtocolPeerError::Remote(StatusDisplay(cancelled_status())))
                };
                let _ = completion_tx.send(result.clone());
                if result.is_err() {
                    self.cancel_call(call_id, cancelled_status())?;
                }
                Ok(ConnectionAction::Continue)
            }
            ClientCommand::Close { closed_tx } => Ok(ConnectionAction::Close(closed_tx)),
            ClientCommand::StartStream {
                admission_tx,
                budget,
                completion,
                duplex_credit,
                deadline,
                item_tx,
                metadata,
                payload,
                timeout_ms,
            } => {
                let result = self.start_call_with_kind(CallAdmission {
                    metadata,
                    payload,
                    timeout_ms,
                    deadline,
                    kind: PendingKind::Stream {
                        buffered_items: 0,
                        completion,
                        item_tx,
                    },
                    budget,
                    duplex_credit,
                });
                match result {
                    Ok(call_id) => {
                        if admission_tx.send(Ok(call_id)).is_err() {
                            self.cancel_call(call_id, cancelled_status())?;
                        }
                    }
                    Err(failure) => {
                        let _ = admission_tx.send(Err(failure.error.clone()));
                        if failure.is_terminal {
                            return Err(failure.error);
                        }
                    }
                }
                Ok(ConnectionAction::Continue)
            }
            ClientCommand::StartUnary {
                admission_tx,
                budget,
                deadline,
                metadata,
                payload,
                result_tx,
                timeout_ms,
            } => {
                let kind = PendingKind::Unary {
                    response: None,
                    result_tx,
                };
                match self.start_call_with_kind(CallAdmission {
                    metadata,
                    payload,
                    timeout_ms,
                    deadline,
                    kind,
                    budget,
                    duplex_credit: None,
                }) {
                    Ok(call_id) => {
                        if admission_tx.send(Ok(call_id)).is_err() {
                            self.cancel_call(call_id, cancelled_status())?;
                        }
                    }
                    Err(failure) => {
                        let _ = admission_tx.send(Err(failure.error.clone()));
                        fail_kind(failure.kind, failure.error.clone());
                        if failure.is_terminal {
                            return Err(failure.error);
                        }
                    }
                }
                Ok(ConnectionAction::Continue)
            }
        }
    }

    fn start_call_with_kind(&mut self, admission: CallAdmission) -> Result<u64, StartFailure> {
        let CallAdmission {
            metadata,
            payload,
            timeout_ms,
            deadline,
            kind,
            budget,
            duplex_credit,
        } = admission;
        let request_bytes = match u64::try_from(payload.len()) {
            Ok(bytes) => bytes,
            Err(_) => {
                return Err(rejected(
                    ProtocolPeerError::Protocol("request_too_large"),
                    kind,
                ));
            }
        };
        if Instant::now() >= deadline {
            return Err(rejected(deadline_error(), kind));
        }
        if self.pending.len() + self.retired.len() >= MAX_ACTIVE_CALLS {
            return Err(rejected(resource_error("active_call_limit_reached"), kind));
        }
        if request_bytes > self.peer_call_credit_bytes {
            return Err(rejected(
                ProtocolPeerError::Protocol("request_credit_exhausted"),
                kind,
            ));
        }
        let Some(call_id) = self.next_call_id else {
            return Err(rejected(
                ProtocolPeerError::Protocol("call_id_overflow"),
                kind,
            ));
        };
        let start = Body::CallStart(CallStart {
            call_id,
            procedure: metadata.procedure.to_owned(),
            timeout_ms,
            destination: None,
        });
        let request = Body::Payload(Payload {
            call_id,
            data: payload,
        });
        let end = Body::CallEnd(CallEnd {
            call_id,
            status: Some(ok_status()),
        });
        let encoded = if duplex_credit.is_some() {
            self.encode_request_frames([start, request])
        } else {
            self.encode_request_frames([start, request, end])
        };
        let (frames, sequence) = match encoded {
            Ok(encoded) => encoded,
            Err(error) => return Err(rejected(error, kind)),
        };
        if let Err(error) = self.commit_request_frames(frames, sequence, deadline, budget) {
            return Err(terminal(error, kind));
        }
        self.next_call_id = call_id.checked_add(2);
        if let Some(credit) = &duplex_credit {
            credit
                .credit
                .add_permits((self.peer_call_credit_bytes - request_bytes) as usize);
        }
        self.pending.insert(
            call_id,
            PendingCall {
                request_ended: duplex_credit.is_none(),
                duplex_credit,
                deadline,
                kind,
                request_credit_bytes: self.peer_call_credit_bytes - request_bytes,
                response_credit_bytes: self.local_call_credit_bytes,
            },
        );
        Ok(call_id)
    }

    fn send_duplex_payload(
        &mut self,
        call_id: u64,
        payload: Vec<u8>,
        budget: OwnedSemaphorePermit,
        outbound: super::outbound::RequestPermit,
    ) -> Result<(), ProtocolPeerError> {
        let Some(call) = self.pending.get_mut(&call_id) else {
            return Err(ProtocolPeerError::Remote(StatusDisplay(cancelled_status())));
        };
        if call.duplex_credit.is_none() || call.request_ended {
            return Err(ProtocolPeerError::Protocol("duplex_not_active"));
        }
        call.request_credit_bytes = call
            .request_credit_bytes
            .checked_sub(payload.len() as u64)
            .ok_or(ProtocolPeerError::Protocol("request_credit_exhausted"))?;
        let deadline = call.deadline;
        let (frames, sequence) = self.encode_request_frames([Body::Payload(Payload {
            call_id,
            data: payload,
        })])?;
        outbound.send(frames, deadline, budget)?;
        self.outgoing_sequence = sequence;
        Ok(())
    }

    fn handle_incoming(&mut self, body: Body) -> Result<(), ProtocolPeerError> {
        match body {
            Body::Payload(payload) => self.receive_payload(payload),
            Body::CallEnd(end) => self.receive_call_end(end),
            Body::Cancel(cancel) => self.receive_cancel(cancel),
            Body::WindowUpdate(update) => self.receive_window_update(update),
            Body::Ping(ping) => {
                self.send(Body::Pong(Pong { nonce: ping.nonce }))?;
                self.note_peer_activity()
            }
            Body::Pong(pong) => self.receive_pong(pong),
            Body::GoAway(go_away) => Err(ProtocolPeerError::Remote(StatusDisplay(
                checked_go_away_status(go_away.status)?,
            ))),
            Body::CallStart(_) | Body::Hello(_) | Body::Welcome(_) => {
                Err(ProtocolPeerError::Protocol("unexpected_frame"))
            }
        }
    }

    fn receive_payload(&mut self, payload: Payload) -> Result<(), ProtocolPeerError> {
        let payload_bytes = u64::try_from(payload.data.len())
            .map_err(|_| ProtocolPeerError::Protocol("response_too_large"))?;
        if let Some(retired) = self.retired.get_mut(&payload.call_id) {
            retired.response_credit_bytes = retired
                .response_credit_bytes
                .checked_sub(payload_bytes)
                .ok_or(ProtocolPeerError::Protocol("response_credit_exhausted"))?;
            return self.note_peer_activity();
        }
        let Some(call) = self.pending.get_mut(&payload.call_id) else {
            return Err(ProtocolPeerError::Protocol("unexpected_call_id"));
        };
        call.response_credit_bytes = call
            .response_credit_bytes
            .checked_sub(payload_bytes)
            .ok_or(ProtocolPeerError::Protocol("response_credit_exhausted"))?;
        let should_cancel = match &mut call.kind {
            PendingKind::Unary { response, .. } => {
                if response.is_some() {
                    return Err(ProtocolPeerError::Protocol("multiple_unary_responses"));
                }
                *response = Some(payload.data);
                false
            }
            PendingKind::Stream {
                buffered_items,
                item_tx,
                ..
            } => {
                if *buffered_items >= MAX_STREAM_BUFFERED_ITEMS {
                    true
                } else {
                    match item_tx.try_send(Ok(payload.data)) {
                        Ok(()) => {
                            *buffered_items += 1;
                            false
                        }
                        Err(mpsc::error::TrySendError::Full(_)) => true,
                        Err(mpsc::error::TrySendError::Closed(_)) => true,
                    }
                }
            }
        };
        self.note_peer_activity()?;
        if should_cancel {
            self.cancel_call(
                payload.call_id,
                resource_status("stream_buffer_limit_reached"),
            )?;
        }
        Ok(())
    }

    fn receive_call_end(&mut self, end: CallEnd) -> Result<(), ProtocolPeerError> {
        if self.retired.remove(&end.call_id).is_some() {
            return self.note_peer_activity();
        }
        let Some(call) = self.pending.remove(&end.call_id) else {
            return Err(ProtocolPeerError::Protocol("unexpected_call_id"));
        };
        let status = checked_status(end.status)?;
        if status.code != StatusCode::OkUnspecified as i32 {
            fail_kind(call.kind, ProtocolPeerError::Remote(StatusDisplay(status)));
            return self.note_peer_activity();
        }
        match call.kind {
            PendingKind::Unary {
                response,
                result_tx,
            } => {
                let result = response.ok_or(ProtocolPeerError::Protocol("response_missing"));
                let _ = result_tx.send(result);
            }
            PendingKind::Stream { completion, .. } => {
                completion.finish();
            }
        }
        self.note_peer_activity()
    }

    fn receive_cancel(&mut self, cancel: Cancel) -> Result<(), ProtocolPeerError> {
        if self.retired.remove(&cancel.call_id).is_some() {
            return self.note_peer_activity();
        }
        let Some(call) = self.pending.remove(&cancel.call_id) else {
            return Err(ProtocolPeerError::Protocol("unexpected_call_id"));
        };
        let status = checked_cancel_status(cancel.status)?;
        fail_kind(call.kind, ProtocolPeerError::Remote(StatusDisplay(status)));
        self.note_peer_activity()
    }

    fn receive_window_update(&mut self, update: WindowUpdate) -> Result<(), ProtocolPeerError> {
        if update.credit_bytes == 0 {
            return Err(ProtocolPeerError::Protocol("window_update_invalid"));
        }
        let credit = if let Some(call) = self.pending.get_mut(&update.call_id) {
            &mut call.request_credit_bytes
        } else if let Some(call) = self.retired.get_mut(&update.call_id) {
            &mut call.request_credit_bytes
        } else {
            return Err(ProtocolPeerError::Protocol("unexpected_call_id"));
        };
        *credit = credit
            .checked_add(update.credit_bytes)
            .filter(|value| *value <= self.peer_call_credit_bytes)
            .ok_or(ProtocolPeerError::Protocol("window_update_invalid"))?;
        if let Some(call) = self.pending.get(&update.call_id)
            && let Some(credit) = &call.duplex_credit
        {
            credit.credit.add_permits(update.credit_bytes as usize);
        }
        self.note_peer_activity()
    }

    fn receive_pong(&mut self, pong: Pong) -> Result<(), ProtocolPeerError> {
        let Some(expected) = self.awaiting_pong.take() else {
            return Err(ProtocolPeerError::Protocol("pong_unsolicited"));
        };
        if pong.nonce != expected.nonce {
            self.awaiting_pong = Some(expected);
            return Err(ProtocolPeerError::Protocol("pong_nonce_invalid"));
        }
        self.next_ping_at = deadline_after(Instant::now(), self.keep_alive_interval)?;
        Ok(())
    }

    fn restore_response_credit(
        &mut self,
        call_id: u64,
        credit_bytes: u64,
    ) -> Result<(), ProtocolPeerError> {
        let Some(call) = self.pending.get_mut(&call_id) else {
            return Ok(());
        };
        let PendingKind::Stream { buffered_items, .. } = &mut call.kind else {
            return Err(ProtocolPeerError::Protocol("stream_credit_invalid"));
        };
        if *buffered_items == 0 {
            return Err(ProtocolPeerError::Protocol("stream_credit_invalid"));
        }
        call.response_credit_bytes = call
            .response_credit_bytes
            .checked_add(credit_bytes)
            .filter(|value| *value <= self.local_call_credit_bytes)
            .ok_or(ProtocolPeerError::Protocol("stream_credit_invalid"))?;
        *buffered_items -= 1;
        if credit_bytes == 0 {
            return Ok(());
        }
        self.send(Body::WindowUpdate(WindowUpdate {
            call_id,
            credit_bytes,
        }))
    }

    fn cancel_call(&mut self, call_id: u64, status: Status) -> Result<(), ProtocolPeerError> {
        let Some(call) = self.pending.remove(&call_id) else {
            return Ok(());
        };
        let error = ProtocolPeerError::Remote(StatusDisplay(status.clone()));
        fail_kind(call.kind, error);
        self.retired.insert(
            call_id,
            RetiredCall {
                deadline: deadline_after(Instant::now(), TRANSPORT_IO_TIMEOUT)?,
                request_credit_bytes: call.request_credit_bytes,
                response_credit_bytes: call.response_credit_bytes,
            },
        );
        self.send(Body::Cancel(Cancel {
            call_id,
            status: Some(status),
        }))
    }

    fn maintain(&mut self) -> Result<(), ProtocolPeerError> {
        let now = Instant::now();
        if self
            .awaiting_pong
            .as_ref()
            .is_some_and(|expected| expected.deadline <= now)
        {
            return Err(ProtocolPeerError::Protocol("keepalive_pong_timeout"));
        }
        let expired = self
            .pending
            .iter()
            .filter_map(|(call_id, call)| (call.deadline <= now).then_some(*call_id))
            .collect::<Vec<_>>();
        for call_id in expired {
            self.cancel_call(call_id, deadline_status())?;
        }
        if self.retired.values().any(|call| call.deadline <= now) {
            return Err(ProtocolPeerError::Protocol("cancel_terminal_timeout"));
        }
        if self.awaiting_pong.is_none() && self.next_ping_at <= now {
            self.ping_nonce = self
                .ping_nonce
                .checked_add(1)
                .ok_or(ProtocolPeerError::Protocol("ping_nonce_overflow"))?;
            self.send(Body::Ping(Ping {
                nonce: self.ping_nonce,
            }))?;
            self.awaiting_pong = Some(ExpectedPong {
                deadline: deadline_after(now, self.keep_alive_interval)?,
                nonce: self.ping_nonce,
            });
        }
        Ok(())
    }

    fn next_wake_at(&self) -> Instant {
        let keepalive = self
            .awaiting_pong
            .as_ref()
            .map_or(self.next_ping_at, |expected| expected.deadline);
        self.pending
            .values()
            .map(|call| call.deadline)
            .chain(self.retired.values().map(|call| call.deadline))
            .fold(keepalive, std::cmp::min)
    }

    fn note_peer_activity(&mut self) -> Result<(), ProtocolPeerError> {
        if self.awaiting_pong.is_none() {
            self.next_ping_at = deadline_after(Instant::now(), self.keep_alive_interval)?;
        }
        Ok(())
    }

    fn decode(&mut self, bytes: &[u8]) -> Result<Body, ProtocolPeerError> {
        if bytes.len() > self.local_max_frame_bytes as usize {
            return Err(ProtocolPeerError::Protocol("frame_too_large"));
        }
        let frame = decode_frame(bytes)
            .map_err(|_| ProtocolPeerError::Protocol("frame_invalid"))?
            .ok_or(ProtocolPeerError::Protocol("frame_preamble_missing"))?;
        let expected = self
            .incoming_sequence
            .checked_add(1)
            .ok_or(ProtocolPeerError::Protocol("incoming_sequence_overflow"))?;
        if frame.sequence != expected {
            return Err(ProtocolPeerError::Protocol("incoming_sequence_invalid"));
        }
        self.incoming_sequence = frame.sequence;
        frame
            .body
            .ok_or(ProtocolPeerError::Protocol("frame_body_missing"))
    }

    fn send(&mut self, body: Body) -> Result<(), ProtocolPeerError> {
        let deadline = deadline_after(Instant::now(), TRANSPORT_IO_TIMEOUT)?;
        self.queue_before(vec![body], deadline)
    }

    fn queue_before(
        &mut self,
        bodies: Vec<Body>,
        deadline: Instant,
    ) -> Result<(), ProtocolPeerError> {
        let mut sequence = self.outgoing_sequence;
        let mut frames = Vec::with_capacity(bodies.len());
        for body in bodies {
            sequence = sequence
                .checked_add(1)
                .ok_or(ProtocolPeerError::Protocol("outgoing_sequence_overflow"))?;
            let bytes = encoded_frame(sequence, body)?;
            if bytes.len() > self.peer_max_frame_bytes as usize {
                return Err(ProtocolPeerError::Protocol("frame_too_large"));
            }
            frames.push(bytes);
        }
        self.outbound.frames(frames, deadline)?;
        self.outgoing_sequence = sequence;
        Ok(())
    }

    // Why: a request body carries the caller payload, so it is encoded once here and the
    // per-frame limit is enforced on that same buffer rather than on a throwaway trial encode.
    fn encode_request_frames<const N: usize>(
        &self,
        bodies: [Body; N],
    ) -> Result<(Vec<Vec<u8>>, u64), ProtocolPeerError> {
        let too_large = ProtocolPeerError::Protocol("request_too_large");
        let mut sequence = self.outgoing_sequence;
        let mut frames = Vec::with_capacity(N);
        for body in bodies {
            sequence = sequence.checked_add(1).ok_or_else(|| too_large.clone())?;
            let bytes = encoded_frame(sequence, body).map_err(|_| too_large.clone())?;
            if bytes.len() > self.peer_max_frame_bytes as usize {
                return Err(too_large);
            }
            frames.push(bytes);
        }
        Ok((frames, sequence))
    }

    fn commit_request_frames(
        &mut self,
        frames: Vec<Vec<u8>>,
        sequence: u64,
        deadline: Instant,
        budget: OwnedSemaphorePermit,
    ) -> Result<(), ProtocolPeerError> {
        let encoded_bytes = frames
            .iter()
            .try_fold(0_usize, |total, frame| total.checked_add(frame.len()));
        if encoded_bytes.is_none_or(|bytes| bytes > budget.num_permits()) {
            return Err(ProtocolPeerError::Protocol("request_budget_invalid"));
        }
        self.outbound.request_frames(frames, deadline, budget)?;
        self.outgoing_sequence = sequence;
        Ok(())
    }

    fn fail_all(&mut self, error: ProtocolPeerError) {
        for (_, call) in self.pending.drain() {
            fail_kind(call.kind, error.clone());
        }
        self.retired.clear();
    }
}

enum ConnectionAction {
    Close(oneshot::Sender<()>),
    Continue,
}

enum ConnectionExit {
    Close(oneshot::Sender<()>),
    Error(ProtocolPeerError),
    Writer(ProtocolPeerError),
}

fn fail_kind(kind: PendingKind, error: ProtocolPeerError) {
    match kind {
        PendingKind::Unary { result_tx, .. } => {
            let _ = result_tx.send(Err(error));
        }
        PendingKind::Stream {
            completion,
            item_tx,
            ..
        } => {
            completion.finish();
            let _ = item_tx.try_send(Err(error));
        }
    }
}

fn checked_status(status: Option<Status>) -> Result<Status, ProtocolPeerError> {
    let status = status.unwrap_or_else(ok_status);
    StatusCode::try_from(status.code)
        .map_err(|_| ProtocolPeerError::Protocol("status_code_invalid"))?;
    Ok(status)
}

fn checked_cancel_status(status: Option<Status>) -> Result<Status, ProtocolPeerError> {
    let status = status.unwrap_or_else(cancelled_status);
    let code = StatusCode::try_from(status.code)
        .map_err(|_| ProtocolPeerError::Protocol("status_code_invalid"))?;
    if code == StatusCode::OkUnspecified {
        return Err(ProtocolPeerError::Protocol("cancel_status_invalid"));
    }
    Ok(status)
}

fn checked_go_away_status(status: Option<Status>) -> Result<Status, ProtocolPeerError> {
    let status = status
        .unwrap_or_else(|| protocol_status(StatusCode::Unavailable, "daemon_connection_closed"));
    let code = StatusCode::try_from(status.code)
        .map_err(|_| ProtocolPeerError::Protocol("status_code_invalid"))?;
    if code == StatusCode::OkUnspecified {
        return Err(ProtocolPeerError::Protocol("go_away_status_invalid"));
    }
    Ok(status)
}

fn encoded_frame(sequence: u64, body: Body) -> Result<Vec<u8>, ProtocolPeerError> {
    encode_frame(&Frame {
        protocol_version: CURRENT_PROTOCOL_VERSION,
        sequence,
        body: Some(body),
    })
    .map_err(|_| ProtocolPeerError::Protocol("frame_encode_failed"))
}

fn deadline_after(
    now: Instant,
    duration: std::time::Duration,
) -> Result<Instant, ProtocolPeerError> {
    now.checked_add(duration)
        .ok_or(ProtocolPeerError::Protocol("deadline_invalid"))
}

fn ok_status() -> Status {
    protocol_status(StatusCode::OkUnspecified, "")
}

fn cancelled_status() -> Status {
    protocol_status(StatusCode::Cancelled, "daemon_request_cancelled")
}

fn deadline_status() -> Status {
    protocol_status(StatusCode::DeadlineExceeded, "daemon_request_timeout")
}

fn resource_status(message: &str) -> Status {
    protocol_status(StatusCode::ResourceExhausted, message)
}

fn deadline_error() -> ProtocolPeerError {
    ProtocolPeerError::Remote(StatusDisplay(deadline_status()))
}

fn resource_error(message: &str) -> ProtocolPeerError {
    ProtocolPeerError::Remote(StatusDisplay(resource_status(message)))
}

fn rejected(error: ProtocolPeerError, kind: PendingKind) -> StartFailure {
    StartFailure {
        error,
        kind,
        is_terminal: false,
    }
}

fn terminal(error: ProtocolPeerError, kind: PendingKind) -> StartFailure {
    StartFailure {
        error,
        kind,
        is_terminal: true,
    }
}

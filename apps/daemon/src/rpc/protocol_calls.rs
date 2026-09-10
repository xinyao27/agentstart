use std::collections::{HashMap, VecDeque};

use agentstart_protocol::method_metadata::method_metadata;
use agentstart_protocol::protocol::v1::call_destination::Target as CallTarget;
use agentstart_protocol::protocol::v1::{
    CallEnd, CallStart, Payload, PeerKind, Status, StatusCode,
};
use tokio::time::{Duration, Instant};

use super::protocol_call::{
    MAX_CONNECTION_BUFFERED_RESPONSE_BYTES, ProtocolCall, ProtocolCancellation, ProtocolCompletion,
    ProtocolOutcome, ProtocolPayload, allows_runtime_environment_route, status,
};
use super::protocol_connection::{INITIAL_CALL_CREDIT_BYTES, MAX_FRAME_BYTES};
use super::protocol_duplex::DuplexRequest;

const MAX_CONNECTION_REQUEST_PAYLOAD_BYTES: u64 = 8 * 1024 * 1024;
const MAX_PROCEDURE_BYTES: usize = 512;
const REQUEST_ASSEMBLY_TIMEOUT_MS: u64 = 10_000;
const RESPONSE_DELIVERY_TIMEOUT_MS: u64 = 10_000;
pub(super) enum CallReply {
    InputCredit {
        call_id: u64,
        credit_bytes: u64,
    },
    Payload {
        call_id: u64,
        payload: ProtocolPayload,
    },
    Response {
        call_id: u64,
        payload: ProtocolPayload,
    },
    Status {
        call_id: u64,
        status: Status,
    },
}

pub(super) struct CallFailure {
    call_id: u64,
    status: Status,
}

pub(super) struct ProtocolCalls {
    active_ready_response_bytes: u64,
    active_request_payload_bytes: u64,
    calls: HashMap<u64, CallState>,
    last_accepted_call_id: u64,
}

struct CallControl {
    assembly_deadline: Instant,
    cancellation: ProtocolCancellation,
    execution_deadline: Option<Instant>,
    outgoing_credit_bytes: u64,
    outgoing_credit_limit_bytes: u64,
    ready_response_bytes: u64,
    response_delivery_deadline: Option<Instant>,
    request_payload_bytes: u64,
    server_streaming: bool,
}

enum CallPhase {
    Ready(ProtocolPayload),
    Receiving {
        destination: Option<String>,
        incoming_credit_bytes: u64,
        procedure: String,
        request: UnaryRequest,
    },
    Running {
        pending: VecDeque<ProtocolPayload>,
        server_streaming: bool,
        stream_complete: bool,
    },
}

enum UnaryRequest {
    Empty,
    Payload(Vec<u8>),
}

struct CallState {
    duplex: Option<DuplexRequest>,
    control: CallControl,
    phase: CallPhase,
}

impl CallFailure {
    pub(super) fn into_reply(self) -> CallReply {
        CallReply::Status {
            call_id: self.call_id,
            status: self.status,
        }
    }
}

impl ProtocolCalls {
    pub(super) fn new() -> Self {
        Self {
            active_ready_response_bytes: 0,
            active_request_payload_bytes: 0,
            calls: HashMap::new(),
            last_accepted_call_id: 0,
        }
    }

    pub(super) fn start(
        &mut self,
        start: CallStart,
        peer_call_credit_bytes: u64,
        max_active_calls: usize,
        routed_calls_enabled: bool,
    ) -> Result<(), CallFailure> {
        if start.call_id == 0
            || start.call_id.is_multiple_of(2)
            || start.call_id <= self.last_accepted_call_id
            || !is_procedure(&start.procedure)
        {
            return Err(failure(
                start.call_id,
                StatusCode::InvalidArgument,
                "CallStart is invalid",
            ));
        }
        if self.calls.len() >= max_active_calls {
            return Err(failure(
                start.call_id,
                StatusCode::ResourceExhausted,
                "Too many active calls",
            ));
        }
        let destination = match start.destination {
            None => None,
            Some(_) if !routed_calls_enabled => {
                return Err(failure(
                    start.call_id,
                    StatusCode::FailedPrecondition,
                    "Call destination requires routed-call negotiation",
                ));
            }
            Some(destination) => match destination.target {
                Some(CallTarget::RuntimeEnvironment(environment))
                    if is_environment_id(&environment.environment_id) =>
                {
                    if !method_metadata(&start.procedure)
                        .is_some_and(allows_runtime_environment_route)
                    {
                        return Err(failure(
                            start.call_id,
                            StatusCode::FailedPrecondition,
                            "Method does not allow Chrome-to-runtime routing",
                        ));
                    }
                    Some(environment.environment_id)
                }
                Some(CallTarget::RuntimeEnvironment(_)) | None => {
                    return Err(failure(
                        start.call_id,
                        StatusCode::InvalidArgument,
                        "Runtime environment destination is invalid",
                    ));
                }
            },
        };
        let now = Instant::now();
        let assembly_deadline = now
            .checked_add(Duration::from_millis(REQUEST_ASSEMBLY_TIMEOUT_MS))
            .ok_or_else(|| {
                failure(
                    start.call_id,
                    StatusCode::InvalidArgument,
                    "Call assembly deadline cannot be represented",
                )
            })?;
        let execution_deadline = if start.timeout_ms == 0 {
            None
        } else {
            Some(
                now.checked_add(Duration::from_millis(u64::from(start.timeout_ms)))
                    .ok_or_else(|| {
                        failure(
                            start.call_id,
                            StatusCode::InvalidArgument,
                            "Call deadline cannot be represented",
                        )
                    })?,
            )
        };
        let server_streaming =
            method_metadata(&start.procedure).is_some_and(|method| method.server_streaming);
        self.calls.insert(
            start.call_id,
            CallState {
                duplex: method_metadata(&start.procedure)
                    .is_some_and(|method| method.client_streaming)
                    .then(DuplexRequest::new),
                control: CallControl {
                    assembly_deadline,
                    cancellation: ProtocolCancellation::new(),
                    execution_deadline,
                    outgoing_credit_bytes: peer_call_credit_bytes,
                    outgoing_credit_limit_bytes: peer_call_credit_bytes,
                    ready_response_bytes: 0,
                    response_delivery_deadline: None,
                    request_payload_bytes: 0,
                    server_streaming,
                },
                phase: CallPhase::Receiving {
                    destination,
                    incoming_credit_bytes: INITIAL_CALL_CREDIT_BYTES,
                    procedure: start.procedure,
                    request: UnaryRequest::Empty,
                },
            },
        );
        self.last_accepted_call_id = start.call_id;
        Ok(())
    }

    pub(super) fn receive_payload(
        &mut self,
        payload: Payload,
        peer_kind: PeerKind,
    ) -> Result<Option<ProtocolCall>, CallFailure> {
        let Some(mut call) = self.calls.remove(&payload.call_id) else {
            return Err(failure(
                payload.call_id,
                StatusCode::InvalidArgument,
                "Payload addresses an unknown call",
            ));
        };
        if deadline_elapsed(active_deadline(&call), Instant::now()) {
            self.abandon(call);
            return Err(deadline_failure(payload.call_id));
        }
        let payload_bytes = match payload_bytes(&payload.data) {
            Ok(payload_bytes) => payload_bytes,
            Err(()) => {
                self.abandon(call);
                return Err(failure(
                    payload.call_id,
                    StatusCode::ResourceExhausted,
                    "Payload length cannot be represented",
                ));
            }
        };
        if matches!(call.phase, CallPhase::Running { .. })
            && let Some(duplex) = call.duplex.as_mut()
        {
            let budget = self.active_request_payload_bytes.checked_add(payload_bytes);
            let Some(budget) =
                budget.filter(|bytes| *bytes <= MAX_CONNECTION_REQUEST_PAYLOAD_BYTES)
            else {
                self.abandon(call);
                return Err(failure(
                    payload.call_id,
                    StatusCode::ResourceExhausted,
                    "Duplex connection input budget is exhausted",
                ));
            };
            if payload_bytes > duplex.credit
                || duplex
                    .sender
                    .as_ref()
                    .is_none_or(|sender| sender.try_send(payload.data).is_err())
            {
                self.abandon(call);
                return Err(failure(
                    payload.call_id,
                    StatusCode::ResourceExhausted,
                    "Duplex input is closed or its buffer allowance is exhausted",
                ));
            }
            duplex.credit -= payload_bytes;
            call.control.request_payload_bytes += payload_bytes;
            self.active_request_payload_bytes = budget;
            self.calls.insert(payload.call_id, call);
            return Ok(None);
        }
        let CallPhase::Receiving {
            incoming_credit_bytes,
            request,
            ..
        } = &mut call.phase
        else {
            self.abandon(call);
            return Err(failure(
                payload.call_id,
                StatusCode::InvalidArgument,
                "Call no longer accepts request payloads",
            ));
        };
        if matches!(request, UnaryRequest::Payload(_)) {
            self.abandon(call);
            return Err(failure(
                payload.call_id,
                StatusCode::InvalidArgument,
                "Unary call received more than one request payload",
            ));
        }
        if payload_bytes > *incoming_credit_bytes {
            self.abandon(call);
            return Err(failure(
                payload.call_id,
                StatusCode::ResourceExhausted,
                "Unary request exceeds its payload allowance",
            ));
        }
        let Some(active_request_payload_bytes) = self
            .active_request_payload_bytes
            .checked_add(payload_bytes)
            .filter(|bytes| *bytes <= MAX_CONNECTION_REQUEST_PAYLOAD_BYTES)
        else {
            self.abandon(call);
            return Err(failure(
                payload.call_id,
                StatusCode::ResourceExhausted,
                "Connection request payload budget is exhausted",
            ));
        };
        *incoming_credit_bytes -= payload_bytes;
        *request = UnaryRequest::Payload(payload.data);
        call.control.request_payload_bytes = payload_bytes;
        self.active_request_payload_bytes = active_request_payload_bytes;
        let is_duplex = call.duplex.is_some();
        if let Some(duplex) = call.duplex.as_mut() {
            duplex.credit -= payload_bytes;
        }
        self.calls.insert(payload.call_id, call);
        if is_duplex {
            self.end(
                CallEnd {
                    call_id: payload.call_id,
                    status: None,
                },
                peer_kind,
            )
        } else {
            Ok(None)
        }
    }

    pub(super) fn end(
        &mut self,
        end: CallEnd,
        peer_kind: PeerKind,
    ) -> Result<Option<ProtocolCall>, CallFailure> {
        let Some(mut call) = self.calls.remove(&end.call_id) else {
            return Err(failure(
                end.call_id,
                StatusCode::InvalidArgument,
                "CallEnd addresses an unknown call",
            ));
        };
        if end
            .status
            .as_ref()
            .is_some_and(|status| status.code != StatusCode::OkUnspecified as i32)
        {
            self.abandon(call);
            return Ok(None);
        }
        if deadline_elapsed(active_deadline(&call), Instant::now()) {
            self.abandon(call);
            return Err(deadline_failure(end.call_id));
        }
        if matches!(call.phase, CallPhase::Running { .. }) && call.duplex.is_some() {
            if call
                .duplex
                .as_mut()
                .and_then(|duplex| duplex.sender.take())
                .is_none()
            {
                self.abandon(call);
                return Err(failure(
                    end.call_id,
                    StatusCode::InvalidArgument,
                    "Duplex request was already ended",
                ));
            }
            self.calls.insert(end.call_id, call);
            return Ok(None);
        }
        let phase = std::mem::replace(
            &mut call.phase,
            CallPhase::Running {
                pending: VecDeque::new(),
                server_streaming: call.control.server_streaming,
                stream_complete: false,
            },
        );
        let CallPhase::Receiving {
            destination,
            procedure,
            request,
            ..
        } = phase
        else {
            self.abandon(call);
            return Err(failure(
                end.call_id,
                StatusCode::InvalidArgument,
                "CallEnd was received more than once",
            ));
        };
        let dispatch = ProtocolCall {
            duplex_input: call
                .duplex
                .as_mut()
                .and_then(|duplex| duplex.receiver.take()),
            call_id: end.call_id,
            cancellation: call.control.cancellation.clone(),
            deadline: call.control.execution_deadline,
            destination,
            payload: match request {
                UnaryRequest::Empty => Vec::new(),
                UnaryRequest::Payload(request) => request,
            },
            peer_kind,
            procedure,
        };
        self.calls.insert(end.call_id, call);
        Ok(Some(dispatch))
    }

    pub(super) fn cancel(&mut self, call_id: u64) -> bool {
        if let Some(call) = self.calls.remove(&call_id) {
            self.abandon(call);
            true
        } else {
            false
        }
    }

    pub(super) fn update_credit(
        &mut self,
        call_id: u64,
        credit_bytes: u64,
    ) -> Result<Vec<CallReply>, CallFailure> {
        let Some(mut call) = self.calls.remove(&call_id) else {
            return Ok(Vec::new());
        };
        if deadline_elapsed(active_deadline(&call), Instant::now()) {
            self.abandon(call);
            return Err(deadline_failure(call_id));
        }
        let Some(updated_credit) = call
            .control
            .outgoing_credit_bytes
            .checked_add(credit_bytes)
            .filter(|updated| {
                credit_bytes != 0 && *updated <= call.control.outgoing_credit_limit_bytes
            })
        else {
            self.abandon(call);
            return Err(failure(
                call_id,
                StatusCode::InvalidArgument,
                "WindowUpdate contains invalid credit",
            ));
        };
        call.control.outgoing_credit_bytes = updated_credit;
        match call.phase {
            CallPhase::Ready(response)
                if response_credit(call_id, &response.data)? <= updated_credit =>
            {
                self.active_ready_response_bytes -= call.control.ready_response_bytes;
                Ok(vec![CallReply::Response {
                    call_id,
                    payload: response,
                }])
            }
            CallPhase::Running {
                mut pending,
                server_streaming,
                stream_complete,
            } => {
                let mut replies = Vec::new();
                while let Some(payload) = pending.front() {
                    let payload_bytes = response_credit(call_id, &payload.data)?;
                    if payload_bytes > call.control.outgoing_credit_bytes {
                        break;
                    }
                    let Some(payload) = pending.pop_front() else {
                        break;
                    };
                    call.control.outgoing_credit_bytes -= payload_bytes;
                    call.control.ready_response_bytes -= payload_bytes;
                    self.active_ready_response_bytes -= payload_bytes;
                    replies.push(CallReply::Payload { call_id, payload });
                }
                if pending.is_empty() {
                    call.control.response_delivery_deadline = None;
                }
                if stream_complete && pending.is_empty() {
                    replies.push(CallReply::Status {
                        call_id,
                        status: status(StatusCode::OkUnspecified, ""),
                    });
                } else {
                    call.phase = CallPhase::Running {
                        pending,
                        server_streaming,
                        stream_complete,
                    };
                    self.calls.insert(call_id, call);
                }
                Ok(replies)
            }
            phase => {
                call.phase = phase;
                self.calls.insert(call_id, call);
                Ok(Vec::new())
            }
        }
    }

    pub(super) fn complete(
        &mut self,
        completion: ProtocolCompletion,
    ) -> Result<Vec<CallReply>, CallFailure> {
        let Some(mut call) = self.calls.remove(&completion.call_id) else {
            return Ok(Vec::new());
        };
        if let ProtocolOutcome::InputConsumed(bytes) = &completion.outcome {
            let bytes = *bytes;
            let valid = call.duplex.as_mut().is_some_and(|duplex| {
                if bytes > call.control.request_payload_bytes
                    || duplex.credit.saturating_add(bytes) > INITIAL_CALL_CREDIT_BYTES
                {
                    return false;
                }
                duplex.credit += bytes;
                true
            });
            if !valid {
                self.abandon(call);
                return Err(failure(
                    completion.call_id,
                    StatusCode::Internal,
                    "Duplex input consumption exceeds its allowance",
                ));
            }
            call.control.request_payload_bytes -= bytes;
            self.active_request_payload_bytes -= bytes;
            self.calls.insert(completion.call_id, call);
            return Ok(if bytes == 0 {
                Vec::new()
            } else {
                vec![CallReply::InputCredit {
                    call_id: completion.call_id,
                    credit_bytes: bytes,
                }]
            });
        }
        let CallPhase::Running {
            mut pending,
            server_streaming,
            mut stream_complete,
        } = std::mem::replace(
            &mut call.phase,
            CallPhase::Running {
                pending: VecDeque::new(),
                server_streaming: false,
                stream_complete: false,
            },
        )
        else {
            self.calls.insert(completion.call_id, call);
            return Ok(Vec::new());
        };
        if deadline_elapsed(active_deadline(&call), Instant::now()) {
            self.abandon(call);
            return Err(deadline_failure(completion.call_id));
        }
        if call.duplex.is_none()
            || matches!(
                &completion.outcome,
                ProtocolOutcome::StreamComplete
                    | ProtocolOutcome::Failed(_)
                    | ProtocolOutcome::Abandoned
            )
        {
            self.release_request_payload(&mut call);
        }
        match completion.outcome {
            ProtocolOutcome::InputConsumed(_) => {
                unreachable!("input consumption was handled before response delivery")
            }
            ProtocolOutcome::Abandoned => {
                self.abandon(call);
                Ok(Vec::new())
            }
            ProtocolOutcome::Failed(status) => {
                self.abandon(call);
                Ok(vec![CallReply::Status {
                    call_id: completion.call_id,
                    status,
                }])
            }
            ProtocolOutcome::Complete(response) => {
                if server_streaming {
                    self.abandon(call);
                    return Err(failure(
                        completion.call_id,
                        StatusCode::Internal,
                        "Streaming procedure returned a unary response",
                    ));
                }
                if response.data.len() > MAX_FRAME_BYTES as usize {
                    self.abandon(call);
                    return Err(failure(
                        completion.call_id,
                        StatusCode::ResourceExhausted,
                        "Response exceeds the daemon frame limit",
                    ));
                }
                let response_bytes = response_credit(completion.call_id, &response.data)?;
                if response_bytes <= call.control.outgoing_credit_bytes {
                    Ok(vec![CallReply::Response {
                        call_id: completion.call_id,
                        payload: response,
                    }])
                } else {
                    let Some(active_ready_response_bytes) = self
                        .active_ready_response_bytes
                        .checked_add(response_bytes)
                        .filter(|bytes| *bytes <= MAX_CONNECTION_BUFFERED_RESPONSE_BYTES as u64)
                    else {
                        self.abandon(call);
                        return Err(failure(
                            completion.call_id,
                            StatusCode::ResourceExhausted,
                            "Connection response payload budget is exhausted",
                        ));
                    };
                    let Some(response_delivery_deadline) = Instant::now()
                        .checked_add(Duration::from_millis(RESPONSE_DELIVERY_TIMEOUT_MS))
                    else {
                        self.abandon(call);
                        return Err(failure(
                            completion.call_id,
                            StatusCode::Internal,
                            "Response delivery deadline cannot be represented",
                        ));
                    };
                    self.active_ready_response_bytes = active_ready_response_bytes;
                    call.control.ready_response_bytes = response_bytes;
                    call.control.response_delivery_deadline = Some(response_delivery_deadline);
                    call.phase = CallPhase::Ready(response);
                    self.calls.insert(completion.call_id, call);
                    Ok(Vec::new())
                }
            }
            ProtocolOutcome::StreamPayload(response) => {
                if !server_streaming || stream_complete {
                    self.abandon(call);
                    return Err(failure(
                        completion.call_id,
                        StatusCode::Internal,
                        "Unary or completed procedure emitted a stream payload",
                    ));
                }
                if response.data.len() > MAX_FRAME_BYTES as usize {
                    self.abandon(call);
                    return Err(failure(
                        completion.call_id,
                        StatusCode::ResourceExhausted,
                        "Stream payload exceeds the daemon frame limit",
                    ));
                }
                let response_bytes = response_credit(completion.call_id, &response.data)?;
                if pending.is_empty() && response_bytes <= call.control.outgoing_credit_bytes {
                    call.control.outgoing_credit_bytes -= response_bytes;
                    call.phase = CallPhase::Running {
                        pending,
                        server_streaming,
                        stream_complete,
                    };
                    self.calls.insert(completion.call_id, call);
                    Ok(vec![CallReply::Payload {
                        call_id: completion.call_id,
                        payload: response,
                    }])
                } else {
                    let Some(active_ready_response_bytes) = self
                        .active_ready_response_bytes
                        .checked_add(response_bytes)
                        .filter(|bytes| *bytes <= MAX_CONNECTION_BUFFERED_RESPONSE_BYTES as u64)
                    else {
                        self.abandon(call);
                        return Err(failure(
                            completion.call_id,
                            StatusCode::ResourceExhausted,
                            "Connection stream response budget is exhausted",
                        ));
                    };
                    if call.control.response_delivery_deadline.is_none() {
                        let Some(deadline) = Instant::now()
                            .checked_add(Duration::from_millis(RESPONSE_DELIVERY_TIMEOUT_MS))
                        else {
                            self.abandon(call);
                            return Err(failure(
                                completion.call_id,
                                StatusCode::Internal,
                                "Stream delivery deadline cannot be represented",
                            ));
                        };
                        call.control.response_delivery_deadline = Some(deadline);
                    }
                    self.active_ready_response_bytes = active_ready_response_bytes;
                    call.control.ready_response_bytes += response_bytes;
                    pending.push_back(response);
                    call.phase = CallPhase::Running {
                        pending,
                        server_streaming,
                        stream_complete,
                    };
                    self.calls.insert(completion.call_id, call);
                    Ok(Vec::new())
                }
            }
            ProtocolOutcome::StreamComplete => {
                if !server_streaming || stream_complete {
                    self.abandon(call);
                    return Err(failure(
                        completion.call_id,
                        StatusCode::Internal,
                        "Procedure emitted an invalid stream completion",
                    ));
                }
                stream_complete = true;
                if pending.is_empty() {
                    Ok(vec![CallReply::Status {
                        call_id: completion.call_id,
                        status: status(StatusCode::OkUnspecified, ""),
                    }])
                } else {
                    call.phase = CallPhase::Running {
                        pending,
                        server_streaming,
                        stream_complete,
                    };
                    self.calls.insert(completion.call_id, call);
                    Ok(Vec::new())
                }
            }
        }
    }

    pub(super) fn expire(&mut self, now: Instant) -> Vec<CallFailure> {
        let expired = self
            .calls
            .iter()
            .filter_map(|(call_id, call)| {
                deadline_elapsed(active_deadline(call), now).then_some(*call_id)
            })
            .collect::<Vec<_>>();
        let mut failures = Vec::with_capacity(expired.len());
        for call_id in expired {
            if let Some(call) = self.calls.remove(&call_id) {
                self.abandon(call);
                failures.push(deadline_failure(call_id));
            }
        }
        failures
    }

    pub(super) fn next_deadline(&self) -> Option<Instant> {
        self.calls.values().filter_map(active_deadline).min()
    }

    pub(super) fn cancel_all(&mut self) {
        for call in self.calls.values() {
            call.control.cancellation.cancel();
        }
        self.calls.clear();
        self.active_ready_response_bytes = 0;
        self.active_request_payload_bytes = 0;
    }

    fn abandon(&mut self, mut call: CallState) {
        call.control.cancellation.cancel();
        self.release_ready_response(&mut call);
        self.release_request_payload(&mut call);
    }

    fn release_ready_response(&mut self, call: &mut CallState) {
        if call.control.ready_response_bytes == 0 {
            return;
        }
        self.active_ready_response_bytes -= call.control.ready_response_bytes;
        call.control.ready_response_bytes = 0;
        call.control.response_delivery_deadline = None;
    }

    fn release_request_payload(&mut self, call: &mut CallState) {
        self.active_request_payload_bytes -= call.control.request_payload_bytes;
        call.control.request_payload_bytes = 0;
    }
}

fn is_environment_id(value: &str) -> bool {
    value.len() == 32
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn active_deadline(call: &CallState) -> Option<Instant> {
    match call.phase {
        CallPhase::Receiving { .. } => Some(
            call.control
                .execution_deadline
                .map_or(call.control.assembly_deadline, |deadline| {
                    deadline.min(call.control.assembly_deadline)
                }),
        ),
        CallPhase::Ready(_) => min_deadline(
            call.control.execution_deadline,
            call.control.response_delivery_deadline,
        ),
        CallPhase::Running { .. } => min_deadline(
            call.control.execution_deadline,
            call.control.response_delivery_deadline,
        ),
    }
}

fn min_deadline(left: Option<Instant>, right: Option<Instant>) -> Option<Instant> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left.min(right)),
        (Some(deadline), None) | (None, Some(deadline)) => Some(deadline),
        (None, None) => None,
    }
}

fn deadline_elapsed(deadline: Option<Instant>, now: Instant) -> bool {
    deadline.is_some_and(|deadline| deadline <= now)
}

fn deadline_failure(call_id: u64) -> CallFailure {
    failure(
        call_id,
        StatusCode::DeadlineExceeded,
        "Call exceeded its deadline",
    )
}

fn failure(call_id: u64, code: StatusCode, message: &str) -> CallFailure {
    CallFailure {
        call_id,
        status: status(code, message),
    }
}

fn is_procedure(procedure: &str) -> bool {
    !procedure.is_empty()
        && procedure.len() <= MAX_PROCEDURE_BYTES
        && procedure.starts_with('/')
        && !procedure.ends_with('/')
        && !procedure.as_bytes().windows(2).any(|pair| pair == b"//")
}

fn payload_bytes(bytes: &[u8]) -> Result<u64, ()> {
    u64::try_from(bytes.len()).map_err(|_| ())
}

fn response_credit(call_id: u64, bytes: &[u8]) -> Result<u64, CallFailure> {
    payload_bytes(bytes).map_err(|()| {
        failure(
            call_id,
            StatusCode::ResourceExhausted,
            "Response length cannot be represented",
        )
    })
}

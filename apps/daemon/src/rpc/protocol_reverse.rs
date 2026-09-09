use std::collections::HashMap;
use std::time::Duration;

use tokio::sync::{mpsc, oneshot};
use tokio::time::Instant;
use yiru_protocol::method_metadata::MethodMetadata;
use yiru_protocol::protocol::v1::{
    CallEnd, CallStart, Cancel, Payload, PeerKind, RuntimeRoutePolicy, Status, StatusCode,
    WindowUpdate,
};

use super::protocol_call::status;

const MAX_ACTIVE_CALLS: usize = 64;
const MAX_STREAM_BUFFERED_ITEMS: usize = 32;
const RETIRED_CALL_TIMEOUT: Duration = Duration::from_secs(10);

pub(crate) enum ReverseCommand {
    ServerStream {
        deadline: Instant,
        item_tx: mpsc::Sender<Result<Vec<u8>, ReverseProtocolError>>,
        metadata: &'static MethodMetadata,
        payload: Vec<u8>,
        started_tx: oneshot::Sender<Result<u64, ReverseProtocolError>>,
        timeout_ms: u32,
    },
    Unary {
        deadline: Instant,
        metadata: &'static MethodMetadata,
        payload: Vec<u8>,
        result_tx: oneshot::Sender<Result<Vec<u8>, ReverseProtocolError>>,
        started_tx: oneshot::Sender<Result<u64, ReverseProtocolError>>,
        timeout_ms: u32,
    },
}

pub(crate) enum ReverseControl {
    Cancel(u64),
    Credit { call_id: u64, credit_bytes: u64 },
}

pub(super) enum ReverseReply {
    Cancel(Cancel),
    Start {
        end: CallEnd,
        payload: Payload,
        start: CallStart,
    },
    WindowUpdate(WindowUpdate),
}

#[derive(Clone, Debug, thiserror::Error)]
pub enum ReverseProtocolError {
    #[error("reverse protocol connection is unavailable")]
    ConnectionUnavailable,
    #[error("reverse protocol call deadline exceeded")]
    DeadlineExceeded,
    #[error("reverse protocol call failed: {0}")]
    Protocol(&'static str),
    #[error("reverse protocol handler failed ({code:?}): {message}")]
    Remote { code: StatusCode, message: String },
}

enum PendingKind {
    Stream {
        buffered_items: usize,
        item_tx: mpsc::Sender<Result<Vec<u8>, ReverseProtocolError>>,
    },
    Unary {
        response: Option<Vec<u8>>,
        result_tx: oneshot::Sender<Result<Vec<u8>, ReverseProtocolError>>,
    },
}

struct PendingCall {
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

pub(super) struct ReverseCalls {
    initial_response_credit_bytes: u64,
    next_call_id: Option<u64>,
    peer_request_credit_bytes: u64,
    pending: HashMap<u64, PendingCall>,
    retired: HashMap<u64, RetiredCall>,
}

impl ReverseCalls {
    pub(super) fn new(initial_response_credit_bytes: u64) -> Self {
        Self {
            initial_response_credit_bytes,
            next_call_id: Some(2),
            peer_request_credit_bytes: 0,
            pending: HashMap::new(),
            retired: HashMap::new(),
        }
    }

    pub(super) fn configure(&mut self, peer_request_credit_bytes: u64) {
        self.peer_request_credit_bytes = peer_request_credit_bytes;
    }

    pub(super) fn start(&mut self, command: ReverseCommand) -> Option<ReverseReply> {
        let (deadline, metadata, payload, started_tx, timeout_ms, kind) = match command {
            ReverseCommand::ServerStream {
                deadline,
                item_tx,
                metadata,
                payload,
                started_tx,
                timeout_ms,
            } => (
                deadline,
                metadata,
                payload,
                started_tx,
                timeout_ms,
                PendingKind::Stream {
                    buffered_items: 0,
                    item_tx,
                },
            ),
            ReverseCommand::Unary {
                deadline,
                metadata,
                payload,
                result_tx,
                started_tx,
                timeout_ms,
            } => (
                deadline,
                metadata,
                payload,
                started_tx,
                timeout_ms,
                PendingKind::Unary {
                    response: None,
                    result_tx,
                },
            ),
        };
        let rejection = if self.pending.len() + self.retired.len() >= MAX_ACTIVE_CALLS {
            Some(ReverseProtocolError::Protocol("active_call_limit_reached"))
        } else if Instant::now() >= deadline {
            Some(ReverseProtocolError::DeadlineExceeded)
        } else if match u64::try_from(payload.len()) {
            Ok(bytes) => bytes > self.peer_request_credit_bytes,
            Err(_) => true,
        } {
            Some(ReverseProtocolError::Protocol("request_credit_exhausted"))
        } else if metadata.client_streaming {
            Some(ReverseProtocolError::Protocol(
                "client_streaming_unsupported",
            ))
        } else if RuntimeRoutePolicy::try_from(metadata.route) != Ok(RuntimeRoutePolicy::LocalOnly)
        {
            Some(ReverseProtocolError::Protocol("reverse_route_not_local"))
        } else if !metadata
            .peer_kinds
            .contains(&(PeerKind::ChromeExtension as i32))
        {
            Some(ReverseProtocolError::Protocol("reverse_peer_not_allowed"))
        } else {
            None
        };
        if let Some(error) = rejection {
            let _ = started_tx.send(Err(error.clone()));
            fail_kind(kind, error);
            return None;
        }
        let Some(call_id) = self.next_call_id else {
            let error = ReverseProtocolError::Protocol("call_id_exhausted");
            let _ = started_tx.send(Err(error.clone()));
            fail_kind(kind, error);
            return None;
        };
        self.next_call_id = call_id.checked_add(2);
        let request_bytes = match u64::try_from(payload.len()) {
            Ok(bytes) => bytes,
            Err(_) => {
                let error = ReverseProtocolError::Protocol("request_too_large");
                fail_kind(kind, error);
                return None;
            }
        };
        self.pending.insert(
            call_id,
            PendingCall {
                deadline,
                kind,
                request_credit_bytes: self.peer_request_credit_bytes - request_bytes,
                response_credit_bytes: self.initial_response_credit_bytes,
            },
        );
        if started_tx.send(Ok(call_id)).is_err() {
            self.pending.remove(&call_id);
            return None;
        }
        Some(ReverseReply::Start {
            start: CallStart {
                call_id,
                procedure: metadata.procedure.to_owned(),
                timeout_ms,
                destination: None,
            },
            payload: Payload {
                call_id,
                data: payload,
            },
            end: CallEnd {
                call_id,
                status: Some(status(StatusCode::OkUnspecified, "")),
            },
        })
    }

    pub(super) fn receive_payload(
        &mut self,
        payload: Payload,
    ) -> Result<Option<ReverseReply>, ReverseProtocolError> {
        let payload_bytes = u64::try_from(payload.data.len())
            .map_err(|_| ReverseProtocolError::Protocol("response_too_large"))?;
        if let Some(retired) = self.retired.get_mut(&payload.call_id) {
            retired.response_credit_bytes = retired
                .response_credit_bytes
                .checked_sub(payload_bytes)
                .ok_or(ReverseProtocolError::Protocol("response_credit_exhausted"))?;
            return Ok(None);
        }
        let Some(call) = self.pending.get_mut(&payload.call_id) else {
            return Err(ReverseProtocolError::Protocol("unknown_reverse_call"));
        };
        call.response_credit_bytes = call
            .response_credit_bytes
            .checked_sub(payload_bytes)
            .ok_or(ReverseProtocolError::Protocol("response_credit_exhausted"))?;
        let should_cancel = match &mut call.kind {
            PendingKind::Unary { response, .. } => {
                if response.is_some() {
                    return Err(ReverseProtocolError::Protocol("multiple_unary_responses"));
                }
                *response = Some(payload.data);
                false
            }
            PendingKind::Stream {
                buffered_items,
                item_tx,
            } => {
                if *buffered_items >= MAX_STREAM_BUFFERED_ITEMS {
                    true
                } else if item_tx.try_send(Ok(payload.data)).is_ok() {
                    *buffered_items += 1;
                    false
                } else {
                    true
                }
            }
        };
        Ok(should_cancel
            .then(|| {
                self.retire(
                    payload.call_id,
                    ReverseProtocolError::Protocol("stream_buffer_limit_reached"),
                    status(
                        StatusCode::ResourceExhausted,
                        "Reverse stream buffer limit reached",
                    ),
                )
            })
            .flatten())
    }

    pub(super) fn receive_end(&mut self, end: CallEnd) -> Result<(), ReverseProtocolError> {
        if self.retired.remove(&end.call_id).is_some() {
            return Ok(());
        }
        let Some(call) = self.pending.remove(&end.call_id) else {
            return Err(ReverseProtocolError::Protocol("unknown_reverse_call"));
        };
        let result = remote_result(end.status);
        match (call.kind, result) {
            (kind, Err(error)) => fail_kind(kind, error),
            (
                PendingKind::Unary {
                    response,
                    result_tx,
                },
                Ok(()),
            ) => {
                let response = response.ok_or(ReverseProtocolError::Protocol("response_missing"));
                let _ = result_tx.send(response);
            }
            (PendingKind::Stream { .. }, Ok(())) => {}
        }
        Ok(())
    }

    pub(super) fn receive_cancel(&mut self, cancel: Cancel) -> Result<(), ReverseProtocolError> {
        if self.retired.remove(&cancel.call_id).is_some() {
            return Ok(());
        }
        let Some(call) = self.pending.remove(&cancel.call_id) else {
            return Err(ReverseProtocolError::Protocol("unknown_reverse_call"));
        };
        let error = match cancel.status {
            Some(status) => remote_error(status)?,
            None => ReverseProtocolError::Remote {
                code: StatusCode::Cancelled,
                message: "Reverse handler cancelled".to_owned(),
            },
        };
        fail_kind(call.kind, error);
        Ok(())
    }

    pub(super) fn receive_window_update(
        &mut self,
        update: WindowUpdate,
    ) -> Result<(), ReverseProtocolError> {
        if update.credit_bytes == 0 {
            return Err(ReverseProtocolError::Protocol("window_update_invalid"));
        }
        let credit = if let Some(call) = self.pending.get_mut(&update.call_id) {
            &mut call.request_credit_bytes
        } else if let Some(call) = self.retired.get_mut(&update.call_id) {
            &mut call.request_credit_bytes
        } else {
            return Err(ReverseProtocolError::Protocol("unknown_reverse_call"));
        };
        *credit = credit
            .checked_add(update.credit_bytes)
            .filter(|value| *value <= self.peer_request_credit_bytes)
            .ok_or(ReverseProtocolError::Protocol("window_update_invalid"))?;
        Ok(())
    }

    pub(super) fn control(&mut self, control: ReverseControl) -> Option<ReverseReply> {
        match control {
            ReverseControl::Cancel(call_id) => self.cancel(call_id),
            ReverseControl::Credit {
                call_id,
                credit_bytes,
            } => {
                let call = self.pending.get_mut(&call_id)?;
                let PendingKind::Stream { buffered_items, .. } = &mut call.kind else {
                    return None;
                };
                if *buffered_items == 0
                    || call
                        .response_credit_bytes
                        .checked_add(credit_bytes)
                        .is_none_or(|credit| credit > self.initial_response_credit_bytes)
                {
                    return self.retire(
                        call_id,
                        ReverseProtocolError::Protocol("stream_credit_invalid"),
                        status(StatusCode::Internal, "Reverse stream credit is invalid"),
                    );
                }
                *buffered_items -= 1;
                call.response_credit_bytes += credit_bytes;
                (credit_bytes > 0).then_some(ReverseReply::WindowUpdate(WindowUpdate {
                    call_id,
                    credit_bytes,
                }))
            }
        }
    }

    pub(super) fn expire(
        &mut self,
        now: Instant,
    ) -> Result<Vec<ReverseReply>, ReverseProtocolError> {
        if self.retired.values().any(|call| call.deadline <= now) {
            return Err(ReverseProtocolError::Protocol("cancel_terminal_timeout"));
        }
        let expired = self
            .pending
            .iter()
            .filter_map(|(call_id, call)| (call.deadline <= now).then_some(*call_id))
            .collect::<Vec<_>>();
        Ok(expired
            .into_iter()
            .filter_map(|call_id| {
                self.retire(
                    call_id,
                    ReverseProtocolError::DeadlineExceeded,
                    status(
                        StatusCode::DeadlineExceeded,
                        "Reverse call deadline exceeded",
                    ),
                )
            })
            .collect())
    }

    pub(super) fn next_deadline(&self) -> Option<Instant> {
        self.pending
            .values()
            .map(|call| call.deadline)
            .chain(self.retired.values().map(|call| call.deadline))
            .min()
    }

    pub(super) fn fail_all(&mut self) {
        for (_, call) in self.pending.drain() {
            fail_kind(call.kind, ReverseProtocolError::ConnectionUnavailable);
        }
        self.retired.clear();
    }

    fn cancel(&mut self, call_id: u64) -> Option<ReverseReply> {
        self.retire(
            call_id,
            ReverseProtocolError::Remote {
                code: StatusCode::Cancelled,
                message: "Reverse call cancelled".to_owned(),
            },
            status(StatusCode::Cancelled, "Reverse call cancelled"),
        )
    }

    fn retire(
        &mut self,
        call_id: u64,
        error: ReverseProtocolError,
        status: Status,
    ) -> Option<ReverseReply> {
        let call = self.pending.remove(&call_id)?;
        fail_kind(call.kind, error);
        self.retired.insert(
            call_id,
            RetiredCall {
                deadline: Instant::now() + RETIRED_CALL_TIMEOUT,
                request_credit_bytes: call.request_credit_bytes,
                response_credit_bytes: call.response_credit_bytes,
            },
        );
        Some(ReverseReply::Cancel(Cancel {
            call_id,
            status: Some(status),
        }))
    }
}

fn fail_kind(kind: PendingKind, error: ReverseProtocolError) {
    match kind {
        PendingKind::Stream { item_tx, .. } => {
            let _ = item_tx.try_send(Err(error));
        }
        PendingKind::Unary { result_tx, .. } => {
            let _ = result_tx.send(Err(error));
        }
    }
}

fn remote_result(status: Option<Status>) -> Result<(), ReverseProtocolError> {
    match status {
        Some(status) => match StatusCode::try_from(status.code) {
            Ok(StatusCode::OkUnspecified) => Ok(()),
            Ok(_) => Err(remote_error(status)?),
            Err(_) => Err(ReverseProtocolError::Protocol("status_code_invalid")),
        },
        None => Ok(()),
    }
}

fn remote_error(status: Status) -> Result<ReverseProtocolError, ReverseProtocolError> {
    let code = StatusCode::try_from(status.code)
        .map_err(|_| ReverseProtocolError::Protocol("status_code_invalid"))?;
    if code == StatusCode::OkUnspecified {
        return Err(ReverseProtocolError::Protocol("cancel_status_invalid"));
    }
    Ok(ReverseProtocolError::Remote {
        code,
        message: status.message,
    })
}

use agentstart_protocol::protocol::v1::frame::Body;
use agentstart_protocol::protocol::v1::{CallEnd, PeerKind, Status, StatusCode};
use tokio::time::Instant;

use super::channel::RpcOutgoing;
use super::protocol_call::{ProtocolCall, ProtocolCompletion, status};
use super::protocol_calls::{CallFailure, CallReply, ProtocolCalls};
use super::protocol_connection::{
    ConnectionReceive, INITIAL_CALL_CREDIT_BYTES, MAX_FRAME_BYTES, ProtocolConnection,
    keep_alive_interval_ms,
};
use super::protocol_reverse::{
    ReverseCalls, ReverseCommand, ReverseControl, ReverseProtocolError, ReverseReply,
};
use super::session::SessionError;
use super::status::StatusRpc;

pub(super) enum ProtocolReceive {
    Consumed,
    Dispatch(ProtocolCall),
    Unrecognized,
}

pub(super) struct ProtocolSession {
    calls: ProtocolCalls,
    connection: ProtocolConnection,
    reverse: ReverseCalls,
}

impl ProtocolSession {
    pub(super) fn new(status: StatusRpc, session_id: &str, peer_kind: PeerKind) -> Self {
        let welcome = status.welcome(
            session_id,
            MAX_FRAME_BYTES,
            INITIAL_CALL_CREDIT_BYTES,
            keep_alive_interval_ms(),
        );
        Self {
            calls: ProtocolCalls::new(),
            connection: ProtocolConnection::new(welcome, peer_kind),
            reverse: ReverseCalls::new(INITIAL_CALL_CREDIT_BYTES),
        }
    }

    pub(super) fn receive(
        &mut self,
        bytes: &[u8],
        outgoing: &RpcOutgoing,
        max_active_calls: usize,
    ) -> Result<ProtocolReceive, SessionError> {
        let body = match self.connection.receive(bytes, outgoing)? {
            ConnectionReceive::Body(body) => body,
            ConnectionReceive::Consumed => return Ok(ProtocolReceive::Consumed),
            ConnectionReceive::Unrecognized => return Ok(ProtocolReceive::Unrecognized),
        };
        match body {
            Body::CallStart(start) => {
                if start.call_id % 2 == 0 {
                    return Err(protocol_error("Peer sent a reverse CallStart"));
                }
                if let Err(failure) = self.calls.start(
                    start,
                    self.connection.peer_call_credit_bytes(),
                    max_active_calls,
                    self.connection.routed_calls_enabled(),
                ) {
                    self.send_failure(failure, outgoing)?;
                }
                Ok(ProtocolReceive::Consumed)
            }
            Body::Payload(payload) => {
                if payload.call_id % 2 == 0 {
                    let reply = self
                        .reverse
                        .receive_payload(payload)
                        .map_err(reverse_error)?;
                    if let Some(reply) = reply {
                        self.send_reverse_reply(reply, outgoing)?;
                    }
                    return Ok(ProtocolReceive::Consumed);
                }
                match self
                    .calls
                    .receive_payload(payload, self.connection.peer_kind())
                {
                    Ok(Some(call)) => Ok(ProtocolReceive::Dispatch(call)),
                    Ok(None) => Ok(ProtocolReceive::Consumed),
                    Err(failure) => {
                        self.send_failure(failure, outgoing)?;
                        Ok(ProtocolReceive::Consumed)
                    }
                }
            }
            Body::CallEnd(end) if end.call_id % 2 == 0 => {
                self.reverse.receive_end(end).map_err(reverse_error)?;
                Ok(ProtocolReceive::Consumed)
            }
            Body::CallEnd(end) => match self.calls.end(end, self.connection.peer_kind()) {
                Ok(Some(call)) => Ok(ProtocolReceive::Dispatch(call)),
                Ok(None) => Ok(ProtocolReceive::Consumed),
                Err(failure) => {
                    self.send_failure(failure, outgoing)?;
                    Ok(ProtocolReceive::Consumed)
                }
            },
            Body::Cancel(cancel) => {
                if cancel.call_id % 2 == 0 {
                    self.reverse.receive_cancel(cancel).map_err(reverse_error)?;
                    return Ok(ProtocolReceive::Consumed);
                }
                if self.calls.cancel(cancel.call_id) {
                    self.send_call_status(
                        cancel.call_id,
                        status(StatusCode::Cancelled, "Call was cancelled by the peer"),
                        outgoing,
                    )?;
                }
                Ok(ProtocolReceive::Consumed)
            }
            Body::WindowUpdate(update) => {
                if update.call_id % 2 == 0 {
                    self.reverse
                        .receive_window_update(update)
                        .map_err(reverse_error)?;
                    return Ok(ProtocolReceive::Consumed);
                }
                match self
                    .calls
                    .update_credit(update.call_id, update.credit_bytes)
                {
                    Ok(replies) => {
                        for reply in replies {
                            self.send_reply(reply, outgoing)?;
                        }
                    }
                    Err(failure) => self.send_failure(failure, outgoing)?,
                }
                Ok(ProtocolReceive::Consumed)
            }
            Body::Hello(_) | Body::Welcome(_) | Body::Ping(_) | Body::Pong(_) | Body::GoAway(_) => {
                Err(protocol_error(
                    "Connection control frame escaped protocol connection handling",
                ))
            }
        }
    }

    pub(super) fn complete(
        &mut self,
        completion: ProtocolCompletion,
        outgoing: &RpcOutgoing,
    ) -> Result<(), SessionError> {
        match self.calls.complete(completion) {
            Ok(replies) => {
                for reply in replies {
                    self.send_reply(reply, outgoing)?;
                }
                Ok(())
            }
            Err(failure) => self.send_failure(failure, outgoing),
        }
    }

    pub(super) fn reverse_calls_enabled(&self) -> bool {
        self.connection.reverse_calls_enabled()
    }

    pub(super) fn configure_reverse(&mut self) {
        self.reverse
            .configure(self.connection.peer_call_credit_bytes());
    }

    pub(super) fn start_reverse(
        &mut self,
        command: ReverseCommand,
        outgoing: &RpcOutgoing,
    ) -> Result<(), SessionError> {
        if !self.reverse_calls_enabled() {
            return Err(protocol_error(
                "Reverse call was started without negotiation",
            ));
        }
        if let Some(reply) = self.reverse.start(command) {
            self.send_reverse_reply(reply, outgoing)?;
        }
        Ok(())
    }

    pub(super) fn control_reverse(
        &mut self,
        control: ReverseControl,
        outgoing: &RpcOutgoing,
    ) -> Result<(), SessionError> {
        if let Some(reply) = self.reverse.control(control) {
            self.send_reverse_reply(reply, outgoing)?;
        }
        Ok(())
    }

    pub(super) fn maintain(
        &mut self,
        now: Instant,
        outgoing: &RpcOutgoing,
    ) -> Result<(), SessionError> {
        for failure in self.calls.expire(now) {
            self.send_failure(failure, outgoing)?;
        }
        for reply in self.reverse.expire(now).map_err(reverse_error)? {
            self.send_reverse_reply(reply, outgoing)?;
        }
        self.connection.maintain(now, outgoing)
    }

    pub(super) fn next_maintenance_at(&self) -> Option<Instant> {
        [
            self.calls.next_deadline(),
            self.reverse.next_deadline(),
            self.connection.next_maintenance_at(),
        ]
        .into_iter()
        .flatten()
        .min()
    }

    pub(super) fn cancel_all(&mut self) {
        self.calls.cancel_all();
        self.reverse.fail_all();
    }

    fn send_reply(&mut self, reply: CallReply, outgoing: &RpcOutgoing) -> Result<(), SessionError> {
        match reply {
            CallReply::InputCredit {
                call_id,
                credit_bytes,
            } => self.connection.send(
                Body::WindowUpdate(agentstart_protocol::protocol::v1::WindowUpdate {
                    call_id,
                    credit_bytes,
                }),
                outgoing,
            ),
            CallReply::Payload { call_id, payload } => {
                self.send_stream_payload(call_id, payload, outgoing)
            }
            CallReply::Response { call_id, payload } => {
                self.send_response(call_id, payload, outgoing)
            }
            CallReply::Status { call_id, status } => {
                self.send_call_status(call_id, status, outgoing)
            }
        }
    }

    fn send_reverse_reply(
        &mut self,
        reply: ReverseReply,
        outgoing: &RpcOutgoing,
    ) -> Result<(), SessionError> {
        match reply {
            ReverseReply::Cancel(cancel) => self.connection.send(Body::Cancel(cancel), outgoing),
            ReverseReply::Start {
                end,
                payload,
                start,
            } => {
                self.connection.send(Body::CallStart(start), outgoing)?;
                if !self
                    .connection
                    .send_payload(payload.call_id, payload.data, outgoing)?
                {
                    return Err(protocol_error("Reverse request exceeds peer frame limit"));
                }
                self.connection.send(Body::CallEnd(end), outgoing)
            }
            ReverseReply::WindowUpdate(update) => {
                self.connection.send(Body::WindowUpdate(update), outgoing)
            }
        }
    }

    fn send_response(
        &mut self,
        call_id: u64,
        response: super::protocol_call::ProtocolPayload,
        outgoing: &RpcOutgoing,
    ) -> Result<(), SessionError> {
        let (data, _budget, delivery) = response.into_parts();
        if !self.connection.send_payload(call_id, data, outgoing)? {
            return self.send_call_status(
                call_id,
                status(
                    StatusCode::ResourceExhausted,
                    "Response exceeds the negotiated frame limit",
                ),
                outgoing,
            );
        }
        self.send_call_status(call_id, status(StatusCode::OkUnspecified, ""), outgoing)?;
        if let Some(delivery) = delivery {
            delivery.confirm();
        }
        Ok(())
    }

    fn send_stream_payload(
        &mut self,
        call_id: u64,
        payload: super::protocol_call::ProtocolPayload,
        outgoing: &RpcOutgoing,
    ) -> Result<(), SessionError> {
        let (data, _budget, delivery) = payload.into_parts();
        if !self.connection.send_payload(call_id, data, outgoing)? {
            let _ = self.calls.cancel(call_id);
            return self.send_call_status(
                call_id,
                status(
                    StatusCode::ResourceExhausted,
                    "Stream payload exceeds the negotiated frame limit",
                ),
                outgoing,
            );
        }
        if let Some(delivery) = delivery {
            delivery.confirm();
        }
        Ok(())
    }

    fn send_failure(
        &mut self,
        failure: CallFailure,
        outgoing: &RpcOutgoing,
    ) -> Result<(), SessionError> {
        self.send_reply(failure.into_reply(), outgoing)
    }

    fn send_call_status(
        &mut self,
        call_id: u64,
        status: Status,
        outgoing: &RpcOutgoing,
    ) -> Result<(), SessionError> {
        self.connection.send(
            Body::CallEnd(CallEnd {
                call_id,
                status: Some(status),
            }),
            outgoing,
        )
    }
}

fn protocol_error(message: &str) -> SessionError {
    SessionError::Protocol(message.to_owned())
}

fn reverse_error(error: ReverseProtocolError) -> SessionError {
    protocol_error(&error.to_string())
}

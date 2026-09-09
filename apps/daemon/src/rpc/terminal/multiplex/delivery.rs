use super::*;

impl MultiplexSession<'_> {
    pub(super) fn handle_stream_event(&mut self, event: StreamEvent) -> Result<(), SessionError> {
        let (route_id, event) = match event {
            StreamEvent::Snapshot(built) => return self.handle_snapshot_built(built),
            StreamEvent::Provider { event, route_id } => (route_id, event),
        };
        match event {
            Ok(TerminalStreamEvent::SideEffects { sequence, facts }) => {
                if !self.streams.contains_key(&route_id) {
                    return Ok(());
                }
                let mut batch = Vec::new();
                let mut bytes = 0;
                for fact in facts {
                    let value = serde_json::to_value(fact)
                        .map_err(|_| SessionError::InvalidTerminalFrame)?;
                    let length = value.to_string().len();
                    if bytes + length > 48 * 1_024 && !batch.is_empty() {
                        self.send_json(
                            0x22,
                            route_id,
                            sequence,
                            0,
                            json!({ "facts": batch, "replay": false }),
                        )?;
                        batch = Vec::new();
                        bytes = 0;
                    }
                    bytes += length;
                    batch.push(value);
                }
                if !batch.is_empty() {
                    self.send_json(
                        0x22,
                        route_id,
                        sequence,
                        0,
                        json!({ "facts": batch, "replay": false }),
                    )?;
                }
                Ok(())
            }
            Ok(TerminalStreamEvent::Output(output)) => {
                let Some(stream) = self.streams.get_mut(&route_id) else {
                    return Ok(());
                };
                if !stream.delivery_visible && !stream.delivery_interested {
                    stream.telemetry.note_hidden_drop();
                    self.send_json(
                        OP_MODEL_RESTORE,
                        route_id,
                        output.end_sequence,
                        0,
                        json!({
                            "reason": "hidden-drop",
                            "markerSeq": output.end_sequence.to_string(),
                            "snapshotFollows": false
                        }),
                    )?;
                    return Ok(());
                }
                let expected_sequence = stream
                    .pending
                    .back()
                    .map_or(stream.last_sent_sequence, |pending| pending.end_sequence);
                if output.end_sequence
                    != output
                        .start_sequence
                        .saturating_add(output.bytes.len() as u64)
                {
                    stream.telemetry.note_gap();
                    self.recover_stream(route_id, "provider-gap")?;
                    return Ok(());
                }
                if output.end_sequence <= expected_sequence {
                    return Ok(());
                }
                if output.start_sequence > expected_sequence {
                    stream.telemetry.note_gap();
                    self.recover_stream(route_id, "provider-gap")?;
                    return Ok(());
                }
                let offset = usize::try_from(expected_sequence - output.start_sequence)
                    .unwrap_or(usize::MAX)
                    .min(output.bytes.len());
                let bytes = output.bytes[offset..].to_vec();
                stream.pending_bytes = stream.pending_bytes.saturating_add(bytes.len());
                stream.pending.push_back(PendingOutput {
                    bytes,
                    end_sequence: output.end_sequence,
                });
                if stream.pending_bytes > MAX_PENDING_BYTES {
                    stream.telemetry.note_gap();
                    self.recover_stream(route_id, "pending-cap")?;
                    return Ok(());
                }
                self.flush_stream(route_id)
            }
            Ok(TerminalStreamEvent::Exited {
                exit_code,
                sequence,
            }) => {
                if let Some(stream) = self.streams.get_mut(&route_id) {
                    stream.exit_pending = Some((exit_code, sequence));
                }
                self.flush_stream(route_id)
            }
            Ok(TerminalStreamEvent::Resized {
                cols,
                rows,
                sequence,
            }) => self.send_json(
                OP_RESIZED,
                route_id,
                sequence,
                0,
                json!({
                    "cols": cols,
                    "rows": rows,
                    "displayMode": "auto",
                    "reason": "provider",
                    "applied": true
                }),
            ),
            Ok(TerminalStreamEvent::Cleared { sequence }) => self.send_json(
                OP_CLEAR_BUFFER,
                route_id,
                sequence,
                0,
                json!({ "operation": "applied" }),
            ),
            Err(broadcast::error::RecvError::Lagged(_)) => {
                if let Some(stream) = self.streams.get_mut(&route_id) {
                    stream.telemetry.note_gap();
                }
                self.recover_stream(route_id, "provider-gap")
            }
            Err(broadcast::error::RecvError::Closed) => {
                self.remove_stream(route_id);
                Ok(())
            }
        }
    }

    pub(super) fn flush_stream(&mut self, route_id: u32) -> Result<(), SessionError> {
        let result = self.flush_stream_output(route_id);
        self.refresh_stream_flow(route_id);
        result
    }

    fn flush_stream_output(&mut self, route_id: u32) -> Result<(), SessionError> {
        loop {
            let next = {
                let Some(stream) = self.streams.get_mut(&route_id) else {
                    return Ok(());
                };
                if !stream.delivery_visible && !stream.delivery_interested {
                    return Ok(());
                }
                if stream.snapshot.is_active() {
                    return Ok(());
                }
                let in_flight = usize::try_from(
                    stream
                        .last_sent_sequence
                        .saturating_sub(stream.last_ack_sequence),
                )
                .unwrap_or(usize::MAX);
                let Some(front) = stream.pending.front() else {
                    if stream.in_flight.is_empty()
                        && let Some((exit_code, sequence)) = stream.exit_pending.take()
                    {
                        self.send_json(
                            OP_END,
                            route_id,
                            sequence,
                            0,
                            json!({
                                "exitCode": exit_code,
                                "reason": "exit",
                                "historyKept": true
                            }),
                        )?;
                        self.remove_stream(route_id);
                    }
                    return Ok(());
                };
                let allowed = stream.credit_bytes.saturating_sub(in_flight);
                if allowed == 0 || self.connection_in_flight >= CONNECTION_IN_FLIGHT_BYTES {
                    return Ok(());
                }
                let take = front.bytes.len();
                if take == 0
                    || take > OUTPUT_FRAME_BYTES
                    || take > allowed
                    || take > CONNECTION_IN_FLIGHT_BYTES - self.connection_in_flight
                {
                    return Ok(());
                }
                let Some(pending) = stream.pending.pop_front() else {
                    return Ok(());
                };
                stream.pending_bytes = stream.pending_bytes.saturating_sub(take);
                (pending.bytes, pending.end_sequence)
            };
            self.send_frame(OP_OUTPUT, route_id, next.1, 0, &next.0)?;
            if let Some(stream) = self.streams.get_mut(&route_id) {
                stream.last_sent_sequence = next.1;
                stream.in_flight.push_back(SentOutput {
                    bytes: next.0.len(),
                    end_sequence: next.1,
                    sent_at: Instant::now(),
                });
            }
            self.connection_in_flight = self.connection_in_flight.saturating_add(next.0.len());
            if self.outgoing.buffered_bytes() >= DEFAULT_MAX_FRAME_BYTES * 4 {
                return Ok(());
            }
        }
    }

    pub(super) fn reject_stalled_streams(&mut self) -> Result<(), SessionError> {
        let stalled = self
            .streams
            .iter()
            .filter(|(_, stream)| {
                !stream.in_flight.is_empty()
                    && !stream.snapshot.is_active()
                    && stream
                        .in_flight
                        .front()
                        .is_some_and(|sent| sent.sent_at.elapsed() >= Duration::from_secs(2))
            })
            .map(|(route_id, _)| *route_id)
            .collect::<Vec<_>>();
        for route_id in stalled {
            if let Some(stream) = self.streams.get_mut(&route_id) {
                stream.telemetry.note_ack_stall();
            }
            self.recover_stream(route_id, "ack-stall")?;
        }
        Ok(())
    }

    pub(super) fn send_epoch(&self) -> Result<(), SessionError> {
        let mut payload = vec![0_u8; EPOCH_BYTES];
        payload[0] = 0;
        payload[1] = 0;
        payload[4..8].copy_from_slice(&(DEFAULT_MAX_FRAME_BYTES as u32).to_le_bytes());
        payload[8..12].copy_from_slice(&(MAX_STREAMS as u32).to_le_bytes());
        payload[12..16].copy_from_slice(&(HEARTBEAT.as_millis() as u32).to_le_bytes());
        payload[16..20].copy_from_slice(&self.generation.to_le_bytes());
        self.send_frame(OP_EPOCH, 0, 0, 0, &payload)
    }

    pub(super) fn send_heartbeat_offer(&mut self) -> Result<(), SessionError> {
        self.heartbeat_id = self.heartbeat_id.wrapping_add(1).max(1);
        let micros = frame::monotonic_micros();
        self.heartbeat_pending.insert(self.heartbeat_id, micros);
        self.send_heartbeat(0, self.heartbeat_id, micros)
    }

    pub(super) fn send_heartbeat(
        &self,
        phase: u8,
        correlation_id: u32,
        micros: u64,
    ) -> Result<(), SessionError> {
        let mut payload = vec![0_u8; HEARTBEAT_BYTES];
        payload[0] = phase;
        payload[1] = 2;
        let queued = u32::try_from(self.outgoing.buffered_bytes()).unwrap_or(u32::MAX);
        payload[4..8].copy_from_slice(&queued.to_le_bytes());
        payload[8..16].copy_from_slice(&micros.to_le_bytes());
        self.send_frame(OP_HEARTBEAT, 0, 0, correlation_id, &payload)
    }

    pub(super) fn send_credit(
        &self,
        route_id: u32,
        direction: u8,
        reason: u8,
        max_in_flight: u32,
        ack_every: u32,
    ) -> Result<(), SessionError> {
        let mut payload = vec![0_u8; CREDIT_BYTES];
        payload[0] = direction;
        payload[1] = reason;
        payload[4..8].copy_from_slice(&max_in_flight.to_le_bytes());
        payload[8..12].copy_from_slice(&ack_every.to_le_bytes());
        payload[12..16].copy_from_slice(&(DEFAULT_MAX_FRAME_BYTES as u32).to_le_bytes());
        self.send_frame(OP_CREDIT, route_id, 0, 0, &payload)
    }

    pub(super) fn send_ack(
        &self,
        route_id: u32,
        correlation_id: u32,
        kind: u8,
        status: u8,
        error_code: u16,
        sequence: u64,
    ) -> Result<(), SessionError> {
        let mut payload = vec![0_u8; ACK_BYTES];
        payload[0] = kind;
        payload[1] = status;
        payload[2..4].copy_from_slice(&error_code.to_le_bytes());
        payload[8..16].copy_from_slice(&sequence.to_le_bytes());
        self.send_frame(OP_ACK, route_id, sequence, correlation_id, &payload)
    }

    pub(super) fn send_error(
        &self,
        route_id: u32,
        correlation_id: u32,
        code: &str,
        fatal: bool,
    ) -> Result<(), SessionError> {
        self.send_json(
            OP_ERROR,
            route_id,
            0,
            correlation_id,
            json!({ "code": code, "message": code, "fatal": fatal, "retryable": !fatal }),
        )
    }

    pub(super) fn send_json(
        &self,
        opcode: u8,
        route_id: u32,
        sequence: u64,
        correlation_id: u32,
        value: Value,
    ) -> Result<(), SessionError> {
        let payload = serde_json::to_vec(&value)
            .map_err(|error| SessionError::Protocol(error.to_string()))?;
        self.send_frame(opcode, route_id, sequence, correlation_id, &payload)
    }

    pub(super) fn send_frame(
        &self,
        opcode: u8,
        route_id: u32,
        sequence: u64,
        correlation_id: u32,
        payload: &[u8],
    ) -> Result<(), SessionError> {
        let frame = frame::encode_frame(
            opcode,
            route_id,
            self.epoch,
            sequence,
            correlation_id,
            payload,
        )?;
        self.outgoing.send_binary(&frame)?;
        self.telemetry
            .borrow_mut()
            .note_frame(FrameDirection::Sent, opcode, frame.len());
        Ok(())
    }

    pub(super) fn reject_stream_frame(&self, frame: &Frame) -> Result<(), SessionError> {
        self.send_error(
            frame.route_id,
            frame.correlation_id,
            "invalid_payload",
            true,
        )
    }

    pub(super) fn protocol_close<T>(
        &self,
        code: u16,
        reason: &'static str,
    ) -> Result<T, SessionError> {
        self.note_connection_event(reason);
        self.outgoing.close(code, reason);
        Err(SessionError::InvalidTerminalFrame)
    }

    pub(super) fn remove_stream(&mut self, route_id: u32) {
        if let Some(mut stream) = self.streams.remove(&route_id) {
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
                self.outgoing.buffered_bytes(),
            );
            stream.telemetry.flush(FlushReason::Close);
            self.authority
                .unregister_viewer(&stream.handle, &stream.client.id);
            self.connection_in_flight = self.connection_in_flight.saturating_sub(
                stream
                    .in_flight
                    .iter()
                    .map(|sent| sent.bytes)
                    .sum::<usize>(),
            );
        }
    }
}

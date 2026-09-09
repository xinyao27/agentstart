use super::*;

impl MultiplexSession<'_> {
    pub(super) async fn handle_stream_frame(&mut self, frame: Frame) -> Result<(), SessionError> {
        if !self.streams.contains_key(&frame.route_id) {
            self.send_error(
                frame.route_id,
                frame.correlation_id,
                "unknown_stream",
                false,
            )?;
            return Ok(());
        }
        match frame.opcode {
            OP_ACK => self.handle_ack(&frame),
            OP_CREDIT => self.handle_credit(&frame),
            OP_INPUT => self.handle_input(frame).await,
            OP_RESIZE => self.handle_resize(frame).await,
            OP_CLAIM_VIEWPORT => self.handle_claim(frame).await,
            OP_CLEAR_BUFFER => self.handle_clear(frame).await,
            OP_SIGNAL => self.handle_signal(frame).await,
            OP_KILL => self.handle_kill(frame).await,
            OP_VISIBILITY_GATE => self.handle_visibility(&frame),
            OP_UNSUBSCRIBE => self.handle_unsubscribe(&frame),
            OP_REVEAL_SNAPSHOT => self.handle_reveal_snapshot(frame),
            OP_SNAPSHOT_REQUEST => self.handle_snapshot_request(frame),
            _ => {
                self.send_error(
                    frame.route_id,
                    frame.correlation_id,
                    "unsupported_opcode",
                    true,
                )?;
                self.remove_stream(frame.route_id);
                Ok(())
            }
        }
    }

    pub(super) fn handle_ack(&mut self, frame: &Frame) -> Result<(), SessionError> {
        let Some((kind, status, acknowledged_bytes, cumulative, receiver_queue)) =
            frame::decode_ack(&frame.payload)
        else {
            return self.reject_stream_frame(frame);
        };
        if kind == 2 {
            if status != 0
                || acknowledged_bytes != 0
                || receiver_queue != 0
                || frame.correlation_id == 0
                || cumulative != frame.sequence
                || !self.acknowledge_snapshot(frame.route_id, frame.correlation_id, cumulative)?
            {
                return self.reject_stream_frame(frame);
            }
            return Ok(());
        }
        if kind != 0 || status != 0 || frame.correlation_id != 0 || cumulative != frame.sequence {
            return self.reject_stream_frame(frame);
        }
        let Some(stream) = self.streams.get_mut(&frame.route_id) else {
            return Ok(());
        };
        if cumulative <= stream.last_ack_sequence || cumulative > stream.last_sent_sequence {
            return Ok(());
        }
        let expected = cumulative.saturating_sub(stream.last_ack_sequence);
        if u64::from(acknowledged_bytes) > expected || receiver_queue > 64 * 1024 * 1024 {
            return self.reject_stream_frame(frame);
        }
        let oldest_sent_at = stream.in_flight.front().map(|sent| sent.sent_at);
        stream.last_ack_sequence = cumulative;
        while stream
            .in_flight
            .front()
            .is_some_and(|sent| sent.end_sequence <= cumulative)
        {
            if let Some(sent) = stream.in_flight.pop_front() {
                self.connection_in_flight = self.connection_in_flight.saturating_sub(sent.bytes);
            }
        }
        stream.telemetry.note_ack(
            usize::try_from(expected).unwrap_or(usize::MAX),
            usize::try_from(receiver_queue).unwrap_or(usize::MAX),
            oldest_sent_at,
        );
        self.flush_stream(frame.route_id)
    }

    pub(super) fn handle_credit(&mut self, frame: &Frame) -> Result<(), SessionError> {
        let Some((direction, max_in_flight, _ack_every, max_frame)) =
            frame::decode_credit(&frame.payload)
        else {
            return self.reject_stream_frame(frame);
        };
        if direction != 0
            || frame.sequence != 0
            || frame.correlation_id != 0
            || max_frame == 0
            || max_frame > 1024 * 1024
        {
            return self.reject_stream_frame(frame);
        }
        if let Some(stream) = self.streams.get_mut(&frame.route_id) {
            stream.credit_bytes = usize::try_from(max_in_flight).unwrap_or(usize::MAX);
        }
        self.flush_stream(frame.route_id)
    }

    pub(super) async fn handle_input(&mut self, frame: Frame) -> Result<(), SessionError> {
        let record = frame::decode_input(&frame.payload);
        let Some(stream) = self.streams.get(&frame.route_id) else {
            return Ok(());
        };
        let expected = stream
            .input_sequence
            .saturating_add(record.as_ref().map_or(0, |(_, data)| data.len() as u64));
        if frame.correlation_id == 0 || frame.sequence != expected || record.is_none() {
            let error_code = if record.is_some() { 12 } else { 1 };
            return self.send_ack(
                frame.route_id,
                frame.correlation_id,
                1,
                1,
                error_code,
                stream.input_sequence,
            );
        }
        let Some((input_kind, data)) = record else {
            return self.reject_stream_frame(&frame);
        };
        let text = match String::from_utf8(data) {
            Ok(text) => text,
            Err(_) => {
                return self.send_ack(
                    frame.route_id,
                    frame.correlation_id,
                    1,
                    1,
                    1,
                    stream.input_sequence,
                );
            }
        };
        let handle = stream.handle.clone();
        let client = stream.client.clone();
        let prior_sequence = stream.input_sequence;
        let request = crate::terminal_session::TerminalSendRequest {
            claim_viewport: false,
            client: Some(client.clone()),
            enter: false,
            input_kind: (input_kind == 1)
                .then_some(crate::terminal_session::TerminalSendInputKind::QueryReply),
            interrupt: false,
            require_agent_sendable: false,
            terminal: handle,
            text: Some(text),
            viewport: None,
        };
        match self.authority.send_guarded(request, &client.id).await {
            Ok(result) if result.accepted => {
                if let Some(stream) = self.streams.get_mut(&frame.route_id) {
                    stream.input_sequence = frame.sequence;
                }
                self.send_ack(
                    frame.route_id,
                    frame.correlation_id,
                    1,
                    0,
                    0,
                    frame.sequence,
                )
            }
            Ok(_) | Err(_) => self.send_ack(
                frame.route_id,
                frame.correlation_id,
                1,
                1,
                10,
                prior_sequence,
            ),
        }
    }

    pub(super) async fn handle_resize(&mut self, frame: Frame) -> Result<(), SessionError> {
        let record = serde_json::from_slice::<ResizeRecord>(&frame.payload).ok();
        let Some(stream) = self.streams.get(&frame.route_id) else {
            return Ok(());
        };
        let Some(record) = record.filter(|record| {
            (1..=1_000).contains(&record.cols)
                && (1..=500).contains(&record.rows)
                && matches!(record.reason.as_str(), "fit" | "user" | "restore-pulse")
                && frame.correlation_id != 0
        }) else {
            return self.reject_stream_frame(&frame);
        };
        let result = self
            .authority
            .update_viewport(
                &stream.handle,
                stream.client.clone(),
                record.cols,
                record.rows,
                true,
            )
            .await;
        let applied = result.as_ref().is_ok_and(|(_, applied)| *applied);
        self.send_ack(
            frame.route_id,
            frame.correlation_id,
            3,
            if result.is_ok() { 0 } else { 1 },
            if result.is_ok() { 0 } else { 6 },
            0,
        )?;
        self.send_json(
            OP_RESIZED,
            frame.route_id,
            0,
            frame.correlation_id,
            json!({
                "cols": record.cols,
                "rows": record.rows,
                "displayMode": "auto",
                "reason": "apply-layout",
                "applied": applied
            }),
        )?;
        if applied && !self.authority.terminal_is_alternate_screen(&stream.handle) {
            let snapshot_id = self.allocate_snapshot_id();
            self.start_snapshot(
                frame.route_id,
                snapshot_id,
                snapshot::SnapshotReason::NormalBufferResize,
                None,
                None,
            )?;
        }
        Ok(())
    }

    pub(super) async fn handle_claim(&mut self, frame: Frame) -> Result<(), SessionError> {
        let value = serde_json::from_slice::<Value>(&frame.payload).ok();
        let Some(stream) = self.streams.get(&frame.route_id) else {
            return Ok(());
        };
        let valid = value.as_ref().and_then(Value::as_object).filter(|object| {
            object.get("clientId").and_then(Value::as_str) == Some(stream.client.id.as_str())
                && object
                    .get("action")
                    .and_then(Value::as_str)
                    .is_some_and(|action| {
                        matches!(action, "register" | "claim" | "release" | "report")
                    })
                && frame.correlation_id != 0
        });
        let Some(record) = valid else {
            return self.reject_stream_frame(&frame);
        };
        let action = record
            .get("action")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let result = if action == "release" {
            self.authority
                .restore_fit(&stream.handle, &stream.client.id)
                .await
                .map(|_| ())
        } else {
            let viewport = frame::parse_viewport(record);
            match viewport {
                Some(viewport) => self
                    .authority
                    .update_viewport(
                        &stream.handle,
                        stream.client.clone(),
                        viewport.cols,
                        viewport.rows,
                        action == "claim",
                    )
                    .await
                    .map(|_| ()),
                None => Err(TerminalSessionError::InvalidInput("viewport")),
            }
        };
        self.send_ack(
            frame.route_id,
            frame.correlation_id,
            3,
            if result.is_ok() { 0 } else { 1 },
            if result.is_ok() { 0 } else { 6 },
            0,
        )
    }

    pub(super) async fn handle_clear(&mut self, frame: Frame) -> Result<(), SessionError> {
        let is_request = serde_json::from_slice::<Value>(&frame.payload)
            .ok()
            .and_then(|value| value.get("operation").cloned())
            .and_then(|value| value.as_str().map(str::to_owned))
            .as_deref()
            == Some("request");
        let Some(stream) = self.streams.get(&frame.route_id) else {
            return Ok(());
        };
        if !is_request || frame.correlation_id == 0 {
            return self.reject_stream_frame(&frame);
        }
        let handle = stream.handle.clone();
        let result = self.authority.clear(&handle).await;
        self.send_ack(
            frame.route_id,
            frame.correlation_id,
            3,
            if result.is_ok() { 0 } else { 1 },
            if result.is_ok() { 0 } else { 10 },
            frame.sequence,
        )
    }

    pub(super) async fn handle_signal(&mut self, frame: Frame) -> Result<(), SessionError> {
        let signal = serde_json::from_slice::<Value>(&frame.payload)
            .ok()
            .and_then(|value| value.get("signal").cloned())
            .and_then(|value| value.as_str().map(str::to_owned));
        let Some(stream) = self.streams.get(&frame.route_id) else {
            return Ok(());
        };
        let result = match signal.as_deref().filter(|_| frame.correlation_id != 0) {
            Some("SIGINT") => self
                .authority
                .send(&stream.handle, None, false, true)
                .await
                .map(|_| ()),
            _ => Err(TerminalSessionError::InvalidInput("unsupported signal")),
        };
        let error_code = match (&signal, &result) {
            (Some(signal), Err(_)) if signal != "SIGINT" => 7,
            (_, Err(_)) => 10,
            (_, Ok(())) => 0,
        };
        self.send_ack(
            frame.route_id,
            frame.correlation_id,
            3,
            if result.is_ok() { 0 } else { 1 },
            error_code,
            0,
        )
    }

    pub(super) async fn handle_kill(&mut self, frame: Frame) -> Result<(), SessionError> {
        let keep_history = frame::decode_kill(&frame.payload).filter(|_| frame.correlation_id != 0);
        let Some(stream) = self.streams.get(&frame.route_id) else {
            return Ok(());
        };
        let Some(keep_history) = keep_history else {
            return self.reject_stream_frame(&frame);
        };
        let result = if keep_history {
            self.authority.close(&stream.handle).await.map(|_| ())
        } else {
            Err(TerminalSessionError::InvalidInput(
                "discarding terminal history is unavailable",
            ))
        };
        self.send_ack(
            frame.route_id,
            frame.correlation_id,
            3,
            if result.is_ok() { 0 } else { 1 },
            if result.is_ok() { 0 } else { 10 },
            0,
        )
    }

    pub(super) fn handle_visibility(&mut self, frame: &Frame) -> Result<(), SessionError> {
        let Some((visible, interested, _priority, state_version)) =
            frame::decode_visibility(&frame.payload)
        else {
            return self.reject_stream_frame(frame);
        };
        if state_version != frame.correlation_id {
            return self.reject_stream_frame(frame);
        }
        let Some(stream) = self.streams.get_mut(&frame.route_id) else {
            return Ok(());
        };
        stream.delivery_visible = visible;
        stream.delivery_interested = interested;
        stream.state_version = state_version;
        stream.snapshot.set_delivery_active(visible || interested);
        if !visible && !interested && stream.pending_bytes > 0 {
            stream.telemetry.note_hidden_drop();
            let sequence = stream.last_sent_sequence;
            stream.pending.clear();
            stream.pending_bytes = 0;
            self.send_json(
                OP_MODEL_RESTORE,
                frame.route_id,
                sequence,
                0,
                json!({
                    "reason": "hidden-drop",
                    "markerSeq": sequence.to_string(),
                    "snapshotFollows": false
                }),
            )?;
        }
        self.send_ack(
            frame.route_id,
            frame.correlation_id,
            3,
            0,
            0,
            frame.sequence,
        )?;
        self.refresh_stream_flow(frame.route_id);
        Ok(())
    }

    pub(super) fn handle_unsubscribe(&mut self, frame: &Frame) -> Result<(), SessionError> {
        if frame.correlation_id == 0 || !frame.payload.is_empty() {
            return self.reject_stream_frame(frame);
        }
        self.send_ack(
            frame.route_id,
            frame.correlation_id,
            3,
            0,
            0,
            frame.sequence,
        )?;
        self.remove_stream(frame.route_id);
        Ok(())
    }

    pub(super) fn handle_reveal_snapshot(&mut self, frame: Frame) -> Result<(), SessionError> {
        let record = serde_json::from_slice::<RevealSnapshotRecord>(&frame.payload).ok();
        let valid = self.streams.get(&frame.route_id).is_some_and(|stream| {
            frame.correlation_id != 0
                && record
                    .as_ref()
                    .is_some_and(|record| record.state_version == stream.state_version)
        });
        if !valid {
            return self.reject_stream_frame(&frame);
        }
        self.start_snapshot(
            frame.route_id,
            frame.correlation_id,
            snapshot::SnapshotReason::Reveal,
            None,
            None,
        )
    }

    pub(super) fn handle_snapshot_request(&mut self, frame: Frame) -> Result<(), SessionError> {
        let record = serde_json::from_slice::<SnapshotRequestRecord>(&frame.payload)
            .ok()
            .filter(|record| {
                record.requested_scrollback_rows <= u64::from(u32::MAX)
                    && record
                        .snapshot_max_bytes
                        .is_none_or(|bytes| bytes <= u64::from(u32::MAX))
            });
        let Some(record) = record.filter(|_| frame.correlation_id != 0) else {
            return self.reject_stream_frame(&frame);
        };
        if self
            .streams
            .get(&frame.route_id)
            .is_some_and(|stream| stream.snapshot.is_active())
        {
            return self.send_ack(
                frame.route_id,
                frame.correlation_id,
                3,
                2,
                8,
                frame.sequence,
            );
        }
        self.start_snapshot(
            frame.route_id,
            frame.correlation_id,
            snapshot::SnapshotReason::Manual,
            Some(usize::try_from(record.requested_scrollback_rows).unwrap_or(usize::MAX)),
            record
                .snapshot_max_bytes
                .map(|bytes| usize::try_from(bytes).unwrap_or(usize::MAX)),
        )
    }
}

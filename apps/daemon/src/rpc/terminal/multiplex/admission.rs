use super::*;

impl MultiplexSession<'_> {
    pub(super) async fn handle_binary(&mut self, bytes: Vec<u8>) -> Result<(), SessionError> {
        let frame_bytes = bytes.len();
        let frame = match frame::decode_frame(bytes) {
            Ok(frame) => frame,
            Err(failure) => return self.protocol_close(failure.close_code, failure.reason),
        };
        self.telemetry.borrow_mut().note_frame(
            FrameDirection::Received,
            telemetry_opcode(frame.opcode),
            frame_bytes,
        );
        if frame.epoch < self.epoch {
            return Ok(());
        }
        if frame.epoch > self.epoch {
            return self.protocol_close(1002, "future epoch");
        }
        self.last_authenticated = Instant::now();
        match frame.opcode {
            OP_EPOCH => self.handle_epoch(&frame),
            _ if self.phase == Phase::Offer => self.protocol_close(1002, "epoch not accepted"),
            OP_HEARTBEAT => self.handle_heartbeat(&frame).await,
            _ if self.phase != Phase::Ready => {
                self.protocol_close(1002, "heartbeat not established")
            }
            OP_SUBSCRIBE => self.handle_subscribe(frame).await,
            _ => self.handle_stream_frame(frame).await,
        }
    }

    pub(super) fn handle_epoch(&mut self, frame: &Frame) -> Result<(), SessionError> {
        if self.phase != Phase::Offer
            || frame.route_id != 0
            || frame.sequence != 0
            || frame.correlation_id != 0
            || !frame::valid_epoch_accept(&frame.payload, self.generation)
        {
            return self.protocol_close(1002, "invalid epoch accept");
        }
        if self
            .authority
            .multiplex()
            .activate_epoch(&self.connection_id, &self.request_id)
            .is_err()
        {
            return self.protocol_close(1008, "bulk admission expired");
        }
        self.phase = Phase::Heartbeat;
        self.send_heartbeat_offer()
    }

    pub(super) async fn handle_heartbeat(&mut self, frame: &Frame) -> Result<(), SessionError> {
        let Some((phase, micros)) = frame::decode_heartbeat(&frame.payload) else {
            return self.protocol_close(1002, "invalid heartbeat");
        };
        if frame.route_id != 0 || frame.sequence != 0 || frame.correlation_id == 0 {
            return self.protocol_close(1002, "invalid heartbeat");
        }
        if phase == 0 {
            self.send_heartbeat(1, frame.correlation_id, micros)?;
        } else if self.heartbeat_pending.remove(&frame.correlation_id) != Some(micros) {
            return self.protocol_close(1002, "invalid heartbeat pong");
        }
        if self.phase == Phase::Heartbeat {
            self.phase = Phase::Ready;
            self.outgoing.ready().await?;
        }
        Ok(())
    }

    pub(super) async fn handle_subscribe(&mut self, frame: Frame) -> Result<(), SessionError> {
        let record = frame::decode_subscribe(&frame.payload);
        if frame.route_id == 0
            || frame.route_id > 0x7fff_ffff
            || frame.correlation_id == 0
            || frame.route_id <= self.last_stream_id
            || self.streams.len() >= MAX_STREAMS
        {
            self.send_error(
                frame.route_id,
                frame.correlation_id,
                "invalid_payload",
                true,
            )?;
            return Ok(());
        }
        let Some(record) = record else {
            self.send_error(
                frame.route_id,
                frame.correlation_id,
                "invalid_payload",
                true,
            )?;
            return Ok(());
        };
        let Some(last_sequence) = frame::parse_decimal_u64(&record.last_parsed_seq) else {
            self.send_error(
                frame.route_id,
                frame.correlation_id,
                "invalid_payload",
                true,
            )?;
            return Ok(());
        };
        // Why: route IDs remain monotonic for the connection even when terminal admission fails.
        self.last_stream_id = frame.route_id;
        let mut subscription = match self.authority.subscribe(&record.terminal, last_sequence) {
            Ok(subscription) => subscription,
            Err(_) => {
                self.send_error(
                    frame.route_id,
                    frame.correlation_id,
                    "terminal_not_found",
                    true,
                )?;
                return Ok(());
            }
        };
        if subscription.transport_generation != record.transport_generation {
            self.send_error(
                frame.route_id,
                frame.correlation_id,
                "transport_generation_claimed",
                true,
            )?;
            return Ok(());
        }
        let client = TerminalClient {
            id: record.client.id.clone(),
            kind: if record.client.r#type == "mobile" {
                TerminalClientType::Mobile
            } else {
                TerminalClientType::Desktop
            },
        };
        let stream_telemetry = self
            .telemetry
            .borrow()
            .open_stream()
            .map_err(|_| SessionError::TerminalDuplexUnavailable)?;
        if !self
            .authority
            .register_viewer(&record.terminal, client.clone())
        {
            self.send_error(
                frame.route_id,
                frame.correlation_id,
                "terminal_not_found",
                true,
            )?;
            return Ok(());
        }
        if let Some(viewport) = record.viewport {
            let _ = self
                .authority
                .update_viewport(
                    &record.terminal,
                    client.clone(),
                    viewport.cols,
                    viewport.rows,
                    client.kind == TerminalClientType::Mobile,
                )
                .await;
        }
        let snapshot_id = self.allocate_snapshot_id();
        let subscribed = self.send_json(
            OP_SUBSCRIBED,
            frame.route_id,
            subscription.sequence,
            frame.correlation_id,
            json!({
                "terminal": record.terminal,
                "transportGeneration": record.transport_generation,
                "ptyState": if subscription.exit_code.is_some() { "exited" } else { "running" },
                "cols": subscription.cols,
                "rows": subscription.rows,
                "displayMode": "auto",
                "driver": { "kind": "desktop" },
                "initialState": "snapshot",
                "snapshotId": snapshot_id,
                "truncated": false
            }),
        );
        if let Err(error) =
            subscribed.and_then(|()| self.send_credit(frame.route_id, 1, 0, 64 * 1024, 16 * 1024))
        {
            self.authority
                .unregister_viewer(&record.terminal, &client.id);
            return Err(error);
        }
        let forward = self.stream_event_sender.clone();
        let route_id = frame.route_id;
        let forwarder = tokio::spawn(async move {
            loop {
                let event = subscription.receiver.recv().await;
                let is_closed = matches!(event, Err(broadcast::error::RecvError::Closed));
                if forward
                    .send(StreamEvent::Provider { event, route_id })
                    .await
                    .is_err()
                    || is_closed
                {
                    return;
                }
            }
        });
        let mut stream = Stream {
            client,
            credit_bytes: 0,
            delivery_interested: record.delivery.interested,
            delivery_visible: record.delivery.visible,
            exit_pending: subscription
                .exit_code
                .map(|exit_code| (exit_code, subscription.sequence)),
            forwarder: forwarder.abort_handle(),
            handle: record.terminal,
            in_flight: VecDeque::new(),
            input_sequence: 0,
            last_ack_sequence: last_sequence,
            last_sent_sequence: last_sequence,
            pending: subscription
                .backlog
                .into_iter()
                .map(|output| PendingOutput {
                    bytes: output.bytes,
                    end_sequence: output.end_sequence,
                })
                .collect(),
            pending_bytes: 0,
            snapshot: snapshot::SnapshotCoordinator::new(
                usize::try_from(record.snapshot_max_bytes).unwrap_or(usize::MAX),
                record.delivery.visible || record.delivery.interested,
            ),
            state_version: 0,
            telemetry: stream_telemetry,
        };
        stream.pending_bytes = stream.pending.iter().map(|output| output.bytes.len()).sum();
        self.streams.insert(route_id, stream);
        self.start_snapshot(
            route_id,
            snapshot_id,
            if last_sequence == 0 {
                snapshot::SnapshotReason::Initial
            } else {
                snapshot::SnapshotReason::Resume
            },
            None,
            None,
        )?;
        Ok(())
    }
}

fn telemetry_opcode(opcode: u8) -> u8 {
    if matches!(opcode, OP_EPOCH | OP_HEARTBEAT | 0x10..=0x29) {
        opcode
    } else {
        OP_ERROR
    }
}

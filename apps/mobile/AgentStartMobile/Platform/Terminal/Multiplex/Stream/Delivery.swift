import Foundation

nonisolated enum TerminalMultiplexDeliveryError: Error, Equatable, Sendable {
    case invalidOutput
    case invalidAcknowledgement
    case snapshotUnavailable(status: UInt8)
    case repeatedRecovery
}

actor TerminalMultiplexDelivery {
    typealias PublishEvent = @Sendable (TerminalSessionEvent) async -> Void

    private struct PendingOutput: Sendable {
        let bytes: Data
        let startSequence: UInt64
        let endSequence: UInt64
    }

    private let route: TerminalBulkRoute
    private let publishEvent: PublishEvent
    private var assembler = TerminalSnapshotAssembler()
    private var pendingOutput: [PendingOutput] = []
    private var parsedSequence: UInt64 = 0
    private var expectedSequence: UInt64 = 0
    private var initialSnapshotID: UInt32 = 0
    private var awaitingSnapshot: TerminalReplaySnapshot?
    private var pendingEndSequence: UInt64?
    private var isSnapshotting = true
    private var hasRequestedRecovery = false

    init(
        route: TerminalBulkRoute,
        publishEvent: @escaping PublishEvent
    ) {
        self.route = route
        self.publishEvent = publishEvent
    }

    func beginInitialSnapshot(id: UInt32) async throws {
        initialSnapshotID = id
        isSnapshotting = true
        try await setOutputCredit(0)
    }

    func handle(_ frame: TerminalMultiplexFrame) async throws -> Bool {
        switch frame.opcode {
        case .output:
            try await handleOutput(frame)
        case .snapshotStart:
            do {
                try assembler.start(frame)
                isSnapshotting = true
                hasRequestedRecovery = false
            } catch {
                try await recover()
            }
        case .snapshotChunk:
            do {
                try assembler.append(frame)
            } catch {
                try await recover()
            }
        case .snapshotEnd:
            try await handleSnapshotEnd(frame)
        case .modelRestore:
            try await prepareForModelRestore(frame)
        case .end:
            guard frame.correlationID == 0,
                (try? JSONDecoder().decode(TerminalMultiplexEndRecord.self, from: frame.payload))
                    != nil
            else {
                throw TerminalMultiplexDeliveryError.invalidOutput
            }
            pendingEndSequence = frame.sequence
            await publishEndIfParsed()
        default:
            return false
        }
        return true
    }

    func acknowledgeOutput(endSequence: UInt64, receiverQueueBytes: UInt32) async throws {
        guard endSequence > parsedSequence, endSequence <= expectedSequence else {
            try await recover()
            throw TerminalMultiplexDeliveryError.invalidAcknowledgement
        }
        let acknowledged = endSequence - parsedSequence
        guard acknowledged <= UInt32.max else {
            try await recover()
            throw TerminalMultiplexDeliveryError.invalidAcknowledgement
        }
        parsedSequence = endSequence
        try await sendAck(
            kind: 0,
            correlationID: 0,
            sequence: endSequence,
            acknowledgedBytes: UInt32(acknowledged),
            receiverQueueBytes: receiverQueueBytes
        )
        await publishEndIfParsed()
    }

    func acknowledgeSnapshot(id: UInt32) async throws {
        guard let snapshot = awaitingSnapshot, snapshot.id == id else {
            try await recover()
            throw TerminalMultiplexDeliveryError.invalidAcknowledgement
        }
        awaitingSnapshot = nil
        parsedSequence = snapshot.coverageEndSequence
        expectedSequence = snapshot.coverageEndSequence
        try await sendAck(
            kind: 2,
            correlationID: snapshot.id,
            sequence: snapshot.coverageEndSequence,
            acknowledgedBytes: 0,
            receiverQueueBytes: 0
        )
        isSnapshotting = false
        try await setOutputCredit(1_024 * 1_024)
        let queued = pendingOutput
        pendingOutput.removeAll(keepingCapacity: true)
        for output in queued {
            if output.endSequence > snapshot.pendingDeliveryStartSequence,
                output.endSequence <= snapshot.coverageEndSequence
            {
                continue
            }
            guard output.endSequence > snapshot.pendingDeliveryStartSequence else {
                try await recover()
                throw TerminalMultiplexDeliveryError.invalidOutput
            }
            try await deliver(output)
        }
        if snapshot.id == initialSnapshotID {
            await publishEvent(.subscribed)
        }
    }

    func currentParsedSequence() -> UInt64 {
        parsedSequence
    }

    func applyOutputCredit(_ bytes: UInt32, reason: UInt8) async throws {
        let clamped = bytes == 0 ? 0 : min(8 * 1_024 * 1_024, max(512 * 1_024, bytes))
        try await setOutputCredit(clamped, reason: reason)
    }

    func suspendDelivery() async throws {
        try await setOutputCredit(0)
    }

    func beginReveal() async throws {
        isSnapshotting = true
        hasRequestedRecovery = true
        awaitingSnapshot = nil
        assembler.clear()
        try await setOutputCredit(0)
    }

    private func handleOutput(_ frame: TerminalMultiplexFrame) async throws {
        guard frame.sequence >= UInt64(frame.payload.count) else {
            try await recover()
            throw TerminalMultiplexDeliveryError.invalidOutput
        }
        let output = PendingOutput(
            bytes: frame.payload,
            startSequence: frame.sequence - UInt64(frame.payload.count),
            endSequence: frame.sequence
        )
        if isSnapshotting {
            pendingOutput.append(output)
        } else {
            try await deliver(output)
        }
    }

    private func deliver(_ output: PendingOutput) async throws {
        guard output.endSequence > expectedSequence else { return }
        var bytes = output.bytes
        var startSequence = output.startSequence
        if startSequence < expectedSequence {
            let overlap = Int(expectedSequence - startSequence)
            bytes = bytes.subdata(in: overlap..<bytes.count)
            startSequence = expectedSequence
        }
        guard startSequence == expectedSequence,
            String(data: bytes, encoding: .utf8) != nil
        else {
            try await recover()
            throw TerminalMultiplexDeliveryError.invalidOutput
        }
        expectedSequence = output.endSequence
        await publishEvent(
            .output(TerminalOutputChunk(bytes: bytes, endSequence: output.endSequence))
        )
    }

    private func handleSnapshotEnd(_ frame: TerminalMultiplexFrame) async throws {
        do {
            let snapshot = try assembler.finish(frame)
            awaitingSnapshot = snapshot
            await publishEvent(.snapshot(snapshot))
        } catch TerminalSnapshotAssemblerError.superseded {
            // Why: supersession is normal snapshot arbitration; its replacement stays on this stream.
            return
        } catch TerminalSnapshotAssemblerError.unavailable(let status) {
            throw TerminalMultiplexDeliveryError.snapshotUnavailable(status: status)
        } catch {
            try await recover()
        }
    }

    private func prepareForModelRestore(_ frame: TerminalMultiplexFrame) async throws {
        guard frame.correlationID == 0,
            let record = try? JSONDecoder().decode(
                TerminalMultiplexModelRestoreRecord.self,
                from: frame.payload
            ),
            record.markerSeq == String(frame.sequence)
        else {
            throw TerminalMultiplexDeliveryError.invalidOutput
        }
        isSnapshotting = true
        hasRequestedRecovery = record.snapshotFollows
        awaitingSnapshot = nil
        assembler.clear()
        try await setOutputCredit(0)
    }

    private func recover() async throws {
        guard !hasRequestedRecovery else {
            throw TerminalMultiplexDeliveryError.repeatedRecovery
        }
        hasRequestedRecovery = true
        isSnapshotting = true
        awaitingSnapshot = nil
        assembler.clear()
        try await setOutputCredit(0)
        let correlationID = try await route.allocateCorrelationID()
        let payload = try JSONEncoder().encode(
            TerminalMultiplexSnapshotRequestRecord(
                requestedScrollbackRows: 1_000,
                snapshotMaxBytes: nil
            )
        )
        try await send(
            opcode: .snapshotRequest,
            sequence: parsedSequence,
            correlationID: correlationID,
            payload: payload
        )
    }

    private func setOutputCredit(_ bytes: UInt32, reason: UInt8 = 0) async throws {
        let threshold = bytes == 0 ? 16 * 1_024 : min(256 * 1_024, max(16 * 1_024, bytes / 8))
        let record = TerminalMultiplexCreditRecord(
            direction: 0,
            reason: reason,
            maxInFlightBytes: bytes,
            acknowledgeEveryBytes: threshold,
            maxFrameBytes: 64 * 1_024
        )
        guard let payload = TerminalMultiplexFlowRecordCodec.encode(record) else {
            throw TerminalMultiplexDeliveryError.invalidOutput
        }
        try await send(opcode: .credit, payload: payload)
    }

    private func sendAck(
        kind: UInt8,
        correlationID: UInt32,
        sequence: UInt64,
        acknowledgedBytes: UInt32,
        receiverQueueBytes: UInt32
    ) async throws {
        let record = TerminalMultiplexAckRecord(
            kind: kind,
            status: 0,
            errorCode: 0,
            acknowledgedBytes: acknowledgedBytes,
            cumulativeSequence: sequence,
            receiverQueueBytes: receiverQueueBytes
        )
        guard let payload = TerminalMultiplexFlowRecordCodec.encode(record) else {
            throw TerminalMultiplexDeliveryError.invalidAcknowledgement
        }
        try await send(
            opcode: .ack,
            sequence: sequence,
            correlationID: correlationID,
            payload: payload
        )
    }

    private func send(
        opcode: TerminalMultiplexOpcodeWire,
        sequence: UInt64 = 0,
        correlationID: UInt32 = 0,
        payload: Data = Data()
    ) async throws {
        try await route.send(
            opcode: opcode,
            sequence: sequence,
            correlationID: correlationID,
            payload: payload
        )
    }

    private func publishEndIfParsed() async {
        guard let pendingEndSequence, parsedSequence >= pendingEndSequence else { return }
        self.pendingEndSequence = nil
        await publishEvent(.ended)
    }
}

import Foundation

actor TerminalMultiplexInputFlow {
    private struct PendingInput: Sendable {
        let kind: UInt8
        let bytes: Data
    }

    private struct ConfirmationWaiter {
        let startSequence: UInt64
        let endSequence: UInt64
        let continuation: CheckedContinuation<Void, Error>
    }

    nonisolated private static let pendingBytesLimit = 256 * 1_024

    private let route: TerminalBulkRoute
    private var inputSequence: UInt64 = 0
    private var acknowledgedSequence: UInt64 = 0
    private var creditBytes: UInt32 = 0
    private var maxFrameBytes = 64 * 1_024
    private var pending: [PendingInput] = []
    private var pendingBytes = 0
    private var confirmationWaiters: [ConfirmationWaiter] = []

    init(route: TerminalBulkRoute) {
        self.route = route
    }

    func enqueue(_ data: Data, kind: UInt8) async throws {
        _ = try append(data, kind: kind)
        try await flush()
    }

    func enqueueConfirmed(_ data: Data, kind: UInt8) async throws {
        let range = try append(data, kind: kind)
        do {
            try await flush()
        } catch {
            if inputSequence > range.startSequence {
                throw TerminalInputConfirmationError.deliveryUnknown
            }
            throw error
        }
        guard acknowledgedSequence < range.endSequence else { return }
        try await withCheckedThrowingContinuation { continuation in
            confirmationWaiters.append(
                ConfirmationWaiter(
                    startSequence: range.startSequence,
                    endSequence: range.endSequence,
                    continuation: continuation
                )
            )
        }
    }

    func applyCredit(_ record: TerminalMultiplexCreditRecord) async throws {
        creditBytes = record.maxInFlightBytes
        maxFrameBytes = min(64 * 1_024, Int(record.maxFrameBytes))
        try await flush()
    }

    func acknowledge(_ frame: TerminalMultiplexFrame) async throws {
        guard let record = TerminalMultiplexFlowRecordCodec.decodeAck(frame.payload),
            record.cumulativeSequence == frame.sequence
        else {
            throw TerminalMultiplexSessionError.invalidAcknowledgement
        }
        guard record.kind == 1 else {
            if record.status != 0 {
                throw TerminalMultiplexSessionError.invalidAcknowledgement
            }
            return
        }
        guard record.status == 0,
            record.cumulativeSequence >= acknowledgedSequence,
            record.cumulativeSequence <= inputSequence
        else {
            inputSequence = record.cumulativeSequence
            acknowledgedSequence = record.cumulativeSequence
            throw TerminalMultiplexSessionError.invalidAcknowledgement
        }
        acknowledgedSequence = record.cumulativeSequence
        resumeAcknowledgedWaiters()
        try await flush()
    }

    func fail() {
        let waiters = confirmationWaiters
        confirmationWaiters.removeAll(keepingCapacity: true)
        for waiter in waiters {
            let error =
                inputSequence > waiter.startSequence
                ? TerminalInputConfirmationError.deliveryUnknown
                : TerminalInputConfirmationError.rejected
            waiter.continuation.resume(throwing: error)
        }
    }

    private func append(_ data: Data, kind: UInt8) throws
        -> (startSequence: UInt64, endSequence: UInt64)
    {
        guard let chunks = TerminalInputChunks.split(data, maxBytes: maxFrameBytes) else {
            throw TerminalMultiplexSessionError.invalidInput
        }
        let addedBytes = chunks.reduce(0) { $0 + $1.count }
        guard pendingBytes + addedBytes <= Self.pendingBytesLimit else {
            throw TerminalMultiplexSessionError.inputBackpressured
        }
        let startSequence = inputSequence + UInt64(pendingBytes)
        pending.append(contentsOf: chunks.map { PendingInput(kind: kind, bytes: $0) })
        pendingBytes += addedBytes
        return (startSequence, startSequence + UInt64(addedBytes))
    }

    private func resumeAcknowledgedWaiters() {
        var waiting: [ConfirmationWaiter] = []
        for waiter in confirmationWaiters {
            if waiter.endSequence <= acknowledgedSequence {
                waiter.continuation.resume()
            } else {
                waiting.append(waiter)
            }
        }
        confirmationWaiters = waiting
    }

    private func flush() async throws {
        while let next = pending.first {
            let inFlight = inputSequence - acknowledgedSequence
            guard inFlight + UInt64(next.bytes.count) <= UInt64(creditBytes) else { return }
            guard
                let payload = TerminalMultiplexFlowRecordCodec.encode(
                    TerminalMultiplexInputRecord(kind: next.kind, data: next.bytes)
                )
            else {
                throw TerminalMultiplexSessionError.invalidInput
            }
            pending.removeFirst()
            pendingBytes -= next.bytes.count
            inputSequence += UInt64(next.bytes.count)
            try await route.send(
                opcode: .input,
                sequence: inputSequence,
                correlationID: try await route.allocateCorrelationID(),
                payload: payload
            )
        }
    }
}

import Foundation

nonisolated enum TerminalMultiplexWireEvent: Sendable {
    case accepted(maxStreams: UInt32)
    case streamFrame(TerminalMultiplexFrame)
}

nonisolated enum TerminalMultiplexWireError: Error, Sendable {
    case correlationIDsExhausted
    case duplicateEpoch
    case epochMismatch
    case frameBeforeAcceptance
    case heartbeatTimedOut
    case invalidEpoch
    case invalidHeartbeat
}

actor TerminalMultiplexWire {
    typealias SendBytes = @Sendable (Data) async throws -> Void
    typealias PublishEvent = @Sendable (TerminalMultiplexWireEvent) async -> Void
    typealias PublishFailure = @Sendable (Error) async -> Void

    private let sendBytes: SendBytes
    private let publishEvent: PublishEvent
    private let publishFailure: PublishFailure
    private let clock = ContinuousClock()
    private var maxFrameBytes: Int
    private var epoch: UInt64 = 0
    private var heartbeatMilliseconds = 15_000
    private var lastAuthenticatedFrameAt: ContinuousClock.Instant?
    private var pendingHeartbeats: [UInt32: UInt64] = [:]
    private var nextCorrelationID: UInt32 = 1
    private var initialHeartbeatID: UInt32?
    private var acceptedMaxStreams: UInt32?
    private var heartbeatTask: Task<Void, Never>?
    private var appState = TerminalMultiplexAppState.foreground
    private var isAccepted = false
    private var isClosed = false

    init(
        maxFrameBytes: Int,
        sendBytes: @escaping SendBytes,
        publishEvent: @escaping PublishEvent,
        publishFailure: @escaping PublishFailure
    ) {
        self.maxFrameBytes = min(
            max(0, maxFrameBytes),
            MobileTerminalMultiplexWireContract.hardMaxFrameBytes
        )
        self.sendBytes = sendBytes
        self.publishEvent = publishEvent
        self.publishFailure = publishFailure
    }

    func handle(_ bytes: Data) async throws {
        guard !isClosed else { return }
        let frame = try TerminalMultiplexFrameCodec.decode(bytes, maxFrameBytes: maxFrameBytes)
        lastAuthenticatedFrameAt = clock.now
        switch frame.opcode {
        case .epoch:
            try await acceptEpoch(frame)
        case .heartbeat:
            try await handleHeartbeat(frame)
        default:
            guard epoch != 0, frame.epoch == epoch else {
                throw TerminalMultiplexWireError.epochMismatch
            }
            guard isAccepted else {
                throw TerminalMultiplexWireError.frameBeforeAcceptance
            }
            await publishEvent(.streamFrame(frame))
        }
    }

    func send(
        opcode: TerminalMultiplexOpcodeWire,
        routeID: UInt32,
        sequence: UInt64 = 0,
        correlationID: UInt32 = 0,
        payload: Data = Data()
    ) async throws {
        guard !isClosed, epoch != 0 else {
            throw TerminalMultiplexWireError.frameBeforeAcceptance
        }
        let frame = TerminalMultiplexFrame(
            opcode: opcode,
            routeID: routeID,
            epoch: epoch,
            sequence: sequence,
            correlationID: correlationID,
            payload: payload
        )
        try await sendBytes(TerminalMultiplexFrameCodec.encode(frame))
    }

    func allocateCorrelationID() throws -> UInt32 {
        guard nextCorrelationID != 0 else {
            throw TerminalMultiplexWireError.correlationIDsExhausted
        }
        let allocated = nextCorrelationID
        if nextCorrelationID == UInt32.max {
            nextCorrelationID = 0
        } else {
            nextCorrelationID += 1
        }
        return allocated
    }

    func isFresh() -> Bool {
        guard let lastAuthenticatedFrameAt else { return false }
        return lastAuthenticatedFrameAt.duration(to: clock.now) <= heartbeatDuration()
    }

    func setAppState(_ state: TerminalMultiplexAppState) {
        appState = state
    }

    func close() {
        guard !isClosed else { return }
        isClosed = true
        heartbeatTask?.cancel()
        heartbeatTask = nil
        pendingHeartbeats.removeAll()
    }

    private func acceptEpoch(_ frame: TerminalMultiplexFrame) async throws {
        guard epoch == 0 else { throw TerminalMultiplexWireError.duplicateEpoch }
        guard frame.epoch != 0, frame.sequence == 0, frame.correlationID == 0,
            let record = TerminalMultiplexConnectionRecordCodec.decodeEpoch(frame.payload),
            record.phase == .offer,
            record.maxStreams > 0
        else {
            throw TerminalMultiplexWireError.invalidEpoch
        }
        epoch = frame.epoch
        acceptedMaxStreams = record.maxStreams
        heartbeatMilliseconds = max(1_000, Int(record.heartbeatMilliseconds))
        maxFrameBytes = min(maxFrameBytes, Int(record.maxFrameBytes))
        let accept = TerminalMultiplexEpochRecord(
            phase: .accept,
            protocolMinor: record.protocolMinor,
            maxFrameBytes: record.maxFrameBytes,
            maxStreams: record.maxStreams,
            heartbeatMilliseconds: record.heartbeatMilliseconds,
            connectionGeneration: record.connectionGeneration
        )
        try await send(
            opcode: .epoch,
            routeID: 0,
            payload: TerminalMultiplexConnectionRecordCodec.encode(accept)
        )
        let heartbeatID = try allocateCorrelationID()
        initialHeartbeatID = heartbeatID
        try await sendHeartbeat(phase: .offer, correlationID: heartbeatID)
        startHeartbeatLoop()
    }

    private func handleHeartbeat(_ frame: TerminalMultiplexFrame) async throws {
        guard epoch != 0, frame.epoch == epoch, frame.sequence == 0,
            frame.correlationID != 0,
            let record = TerminalMultiplexConnectionRecordCodec.decodeHeartbeat(frame.payload)
        else {
            throw TerminalMultiplexWireError.invalidHeartbeat
        }
        switch record.phase {
        case .offer:
            try await sendHeartbeat(
                phase: .accept,
                correlationID: frame.correlationID,
                monotonicMicroseconds: record.monotonicMicroseconds
            )
        case .accept:
            guard
                pendingHeartbeats.removeValue(forKey: frame.correlationID)
                    == record.monotonicMicroseconds
            else {
                throw TerminalMultiplexWireError.invalidHeartbeat
            }
            if frame.correlationID == initialHeartbeatID {
                guard let acceptedMaxStreams else {
                    throw TerminalMultiplexWireError.invalidEpoch
                }
                initialHeartbeatID = nil
                isAccepted = true
                await publishEvent(.accepted(maxStreams: acceptedMaxStreams))
            }
        }
    }

    private func startHeartbeatLoop() {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                do {
                    try await Task.sleep(for: await self.heartbeatDuration())
                    try await self.heartbeatTick()
                } catch is CancellationError {
                    return
                } catch {
                    await self.publishFailure(error)
                    return
                }
            }
        }
    }

    private func heartbeatDuration() -> Duration {
        .milliseconds(Int64(heartbeatMilliseconds))
    }

    private func heartbeatTick() async throws {
        guard !isClosed, let lastAuthenticatedFrameAt else { return }
        let elapsed = lastAuthenticatedFrameAt.duration(to: clock.now)
        let interval = heartbeatDuration()
        if elapsed >= interval * 2 {
            throw TerminalMultiplexWireError.heartbeatTimedOut
        }
        if elapsed >= interval {
            try await sendHeartbeat(phase: .offer, correlationID: allocateCorrelationID())
        }
    }

    private func sendHeartbeat(
        phase: TerminalMultiplexHandshakePhase,
        correlationID: UInt32,
        monotonicMicroseconds: UInt64 = DispatchTime.now().uptimeNanoseconds / 1_000
    ) async throws {
        if phase == .offer {
            pendingHeartbeats[correlationID] = monotonicMicroseconds
        }
        let record = TerminalMultiplexHeartbeatRecord(
            phase: phase,
            appState: appState,
            senderQueueBytes: 0,
            monotonicMicroseconds: monotonicMicroseconds
        )
        try await send(
            opcode: .heartbeat,
            routeID: 0,
            correlationID: correlationID,
            payload: TerminalMultiplexConnectionRecordCodec.encode(record)
        )
    }
}

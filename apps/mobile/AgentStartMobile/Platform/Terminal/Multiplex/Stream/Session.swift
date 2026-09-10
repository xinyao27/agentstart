import Foundation

nonisolated enum TerminalMultiplexSessionError: Error, Sendable {
    case closed
    case invalidFrame
    case invalidSubscription
    case invalidCredit
    case invalidAcknowledgement
    case inputBackpressured
    case invalidInput
    case server(message: String?)
}

nonisolated enum TerminalInputConfirmationError: Error, Equatable, Sendable {
    case rejected
    case deliveryUnknown
}

nonisolated private enum TerminalMultiplexEffectiveDisplayMode: String, Decodable, Sendable {
    case auto
    case desktop
    case phone
}

nonisolated private struct TerminalMultiplexResizedRecord: Decodable, Sendable {
    let cols: Int
    let rows: Int
    let displayMode: TerminalMultiplexEffectiveDisplayMode
    let applied: Bool?
}

nonisolated private struct TerminalMultiplexFitOverrideRecord: Decodable, Sendable {
    let cols: Int
    let rows: Int
}

actor TerminalMultiplexSession: TerminalSession {
    private let route: TerminalBulkRoute
    private let terminalID: String
    private let transportGeneration: String
    private let clientID: String
    private let stream: AsyncThrowingStream<TerminalSessionEvent, Error>
    private let continuation: AsyncThrowingStream<TerminalSessionEvent, Error>.Continuation
    private let delivery: TerminalMultiplexDelivery
    private let deliveryState: TerminalMultiplexDeliveryState
    private let input: TerminalMultiplexInputFlow
    private var receiveTask: Task<Void, Never>?
    private var viewport: TerminalGridSize?
    private var sentViewport: TerminalGridSize?
    private var isSubscribed = false
    private var isClosed = false

    init(
        route: TerminalBulkRoute,
        terminalID: String,
        transportGeneration: String,
        clientID: String,
        viewport: TerminalGridSize?
    ) {
        let pair = AsyncThrowingStream.makeStream(of: TerminalSessionEvent.self)
        stream = pair.stream
        continuation = pair.continuation
        self.route = route
        self.terminalID = terminalID
        self.transportGeneration = transportGeneration
        self.clientID = clientID
        self.viewport = viewport
        input = TerminalMultiplexInputFlow(route: route)
        let delivery = TerminalMultiplexDelivery(
            route: route,
            publishEvent: { event in pair.continuation.yield(event) }
        )
        self.delivery = delivery
        deliveryState = TerminalMultiplexDeliveryState(
            route: route,
            delivery: delivery
        )
    }

    func start() {
        guard receiveTask == nil, !isClosed else { return }
        receiveTask = Task { [weak self] in
            await self?.receiveLoop()
        }
    }

    func events() -> AsyncThrowingStream<TerminalSessionEvent, Error> {
        stream
    }

    func sendInput(_ data: Data) async throws {
        try await input.enqueue(data, kind: 0)
    }

    func sendInputConfirmed(_ data: Data) async throws {
        try await input.enqueueConfirmed(data, kind: 0)
    }

    func sendQueryReply(_ data: Data) async throws {
        try await input.enqueue(data, kind: 1)
    }

    func resize(_ size: TerminalGridSize) async throws {
        guard
            (TerminalMultiplexStreamRecordWire
                .columnsMin...TerminalMultiplexStreamRecordWire.columnsMax).contains(size.columns),
            (TerminalMultiplexStreamRecordWire.rowsMin...TerminalMultiplexStreamRecordWire.rowsMax)
                .contains(size.rows)
        else {
            throw TerminalMultiplexSessionError.invalidFrame
        }
        viewport = size
        guard isSubscribed else { return }
        try await sendResize(size)
    }

    private func sendResize(_ size: TerminalGridSize) async throws {
        let payload = try JSONEncoder().encode(
            TerminalMultiplexResizeRecord(
                cols: size.columns,
                rows: size.rows,
                reason: .fit
            )
        )
        try await send(
            opcode: .resize,
            sequence: 0,
            correlationID: try await route.allocateCorrelationID(),
            payload: payload
        )
    }

    func acknowledgeOutput(endSequence: UInt64, receiverQueueBytes: UInt32) async throws {
        try await delivery.acknowledgeOutput(
            endSequence: endSequence,
            receiverQueueBytes: receiverQueueBytes
        )
    }

    func acknowledgeSnapshot(id: UInt32) async throws {
        try await delivery.acknowledgeSnapshot(id: id)
    }

    func setAppState(_ state: TerminalSessionAppState) async {
        do {
            try await deliveryState.transition(to: state, isSubscribed: isSubscribed)
        } catch {
            await fail(error)
        }
    }

    func close() async {
        guard !isClosed else { return }
        let sequence = await delivery.currentParsedSequence()
        if let correlationID = try? await route.allocateCorrelationID() {
            try? await send(
                opcode: .unsubscribe,
                sequence: sequence,
                correlationID: correlationID
            )
        }
        await finish()
    }

    private func receiveLoop() async {
        do {
            let events = route.events()
            for try await event in events {
                switch event {
                case .accepted:
                    try await subscribe()
                case .frame(let frame):
                    try await handle(frame)
                }
            }
            if !isClosed {
                throw TerminalMultiplexSessionError.closed
            }
        } catch is CancellationError {
            return
        } catch {
            await fail(error)
        }
    }

    private func subscribe() async throws {
        let appState = await deliveryState.prepareSubscription()
        let subscriptionViewport = viewport
        let size = subscriptionViewport.map {
            TerminalMultiplexViewportRecord(cols: $0.columns, rows: $0.rows)
        }
        let payload = try JSONEncoder().encode(
            TerminalMultiplexSubscribeRecord(
                terminal: terminalID,
                transportGeneration: transportGeneration,
                client: TerminalMultiplexClientRecord(id: clientID, type: .mobile),
                viewport: size,
                lastParsedSeq: String(await delivery.currentParsedSequence()),
                delivery: TerminalMultiplexDeliveryRecord(
                    visible: appState == .foreground,
                    interested: appState == .foreground,
                    priority: appState == .foreground ? .active : .parked
                ),
                snapshotMaxBytes: TerminalMultiplexStreamRecordWire.snapshotMaxBytes,
                capabilities: TerminalMultiplexCapabilitiesRecord()
            )
        )
        try await send(
            opcode: .subscribe,
            sequence: await delivery.currentParsedSequence(),
            correlationID: try await route.allocateCorrelationID(),
            payload: payload
        )
        // Why: actor reentrancy can update `viewport` while the subscribe frame
        // is being assembled and sent. Track the dimensions actually encoded in
        // that frame so `handleSubscribed` can send a late measurement instead
        // of incorrectly treating it as already delivered.
        sentViewport = subscriptionViewport
    }

    private func handle(_ frame: TerminalMultiplexFrame) async throws {
        guard frame.routeID == route.id, frame.unsupportedOpcode == nil else {
            throw TerminalMultiplexSessionError.invalidFrame
        }
        if try await delivery.handle(frame) { return }
        switch frame.opcode {
        case .subscribed:
            try await handleSubscribed(frame)
        case .credit:
            try await handleCredit(frame)
        case .ack:
            try await handleAcknowledgement(frame)
        case .error:
            let record = try? JSONDecoder().decode(
                TerminalMultiplexErrorRecord.self,
                from: frame.payload
            )
            throw TerminalMultiplexSessionError.server(message: record?.message)
        case .clearBuffer:
            continuation.yield(.clearBuffer)
        case .resized:
            try handleResized(frame)
        case .fitOverride:
            try handleFitOverride(frame)
        case .metadata, .driver, .sideEffectBatch:
            break
        case .epoch, .heartbeat, .subscribe, .unsubscribe, .end, .output, .input,
            .resize, .claimViewport, .snapshotRequest, .snapshotStart, .snapshotChunk,
            .snapshotEnd, .visibilityGate, .revealSnapshot, .modelRestore, .signal, .kill:
            throw TerminalMultiplexSessionError.invalidFrame
        }
    }

    private func handleSubscribed(_ frame: TerminalMultiplexFrame) async throws {
        let record = try JSONDecoder().decode(
            TerminalMultiplexSubscribedRecord.self,
            from: frame.payload
        )
        guard record.terminal == terminalID,
            record.transportGeneration == transportGeneration,
            record.ptyState == .running,
            record.cols >= TerminalMultiplexStreamRecordWire.columnsMin,
            record.cols <= TerminalMultiplexStreamRecordWire.columnsMax,
            record.rows >= TerminalMultiplexStreamRecordWire.rowsMin,
            record.rows <= TerminalMultiplexStreamRecordWire.rowsMax,
            record.initialState == .snapshot,
            let snapshotID = record.snapshotId,
            snapshotID != 0
        else {
            throw TerminalMultiplexSessionError.invalidSubscription
        }
        switch record.displayMode {
        case .auto:
            continuation.yield(.displayMode(.auto))
        case .desktop:
            continuation.yield(.displayMode(.desktop))
        }
        continuation.yield(
            .gridSizeChanged(TerminalGridSize(columns: record.cols, rows: record.rows))
        )
        isSubscribed = true
        if let viewport, viewport != sentViewport {
            try await sendResize(viewport)
        }
        try await delivery.beginInitialSnapshot(id: snapshotID)
        try await deliveryState.reconcileAfterSubscription()
    }

    private func handleResized(_ frame: TerminalMultiplexFrame) throws {
        let record = try JSONDecoder().decode(
            TerminalMultiplexResizedRecord.self, from: frame.payload)
        let size = try validatedGridSize(columns: record.cols, rows: record.rows)
        switch record.displayMode {
        case .auto, .phone:
            continuation.yield(.displayMode(.auto))
        case .desktop:
            continuation.yield(.displayMode(.desktop))
        }
        if record.applied != false {
            continuation.yield(.gridSizeChanged(size))
        }
    }

    private func handleFitOverride(_ frame: TerminalMultiplexFrame) throws {
        let record = try JSONDecoder().decode(
            TerminalMultiplexFitOverrideRecord.self,
            from: frame.payload
        )
        guard record.cols > 0, record.rows > 0 else { return }
        continuation.yield(
            .gridSizeChanged(
                try validatedGridSize(columns: record.cols, rows: record.rows)
            )
        )
    }

    private func validatedGridSize(columns: Int, rows: Int) throws -> TerminalGridSize {
        guard
            (TerminalMultiplexStreamRecordWire
                .columnsMin...TerminalMultiplexStreamRecordWire.columnsMax)
                .contains(columns),
            (TerminalMultiplexStreamRecordWire.rowsMin...TerminalMultiplexStreamRecordWire.rowsMax)
                .contains(rows)
        else {
            throw TerminalMultiplexSessionError.invalidFrame
        }
        return TerminalGridSize(columns: columns, rows: rows)
    }

    private func handleCredit(_ frame: TerminalMultiplexFrame) async throws {
        guard frame.sequence == 0, frame.correlationID == 0,
            let credit = TerminalMultiplexFlowRecordCodec.decodeCredit(frame.payload),
            credit.maxFrameBytes > 0,
            credit.maxFrameBytes <= UInt32(MobileTerminalMultiplexWireContract.hardMaxFrameBytes)
        else {
            throw TerminalMultiplexSessionError.invalidCredit
        }
        if credit.direction == 0 {
            try await delivery.applyOutputCredit(
                credit.maxInFlightBytes,
                reason: credit.reason
            )
            return
        }
        try await input.applyCredit(credit)
    }

    private func handleAcknowledgement(_ frame: TerminalMultiplexFrame) async throws {
        if try await deliveryState.handleAcknowledgement(frame) { return }
        try await input.acknowledge(frame)
    }

    private func send(
        opcode: TerminalMultiplexOpcodeWire,
        sequence: UInt64 = 0,
        correlationID: UInt32 = 0,
        payload: Data = Data()
    ) async throws {
        guard !isClosed else { throw TerminalMultiplexSessionError.closed }
        try await route.send(
            opcode: opcode,
            sequence: sequence,
            correlationID: correlationID,
            payload: payload
        )
    }

    private func fail(_ error: Error) async {
        guard !isClosed else { return }
        isClosed = true
        receiveTask = nil
        await input.fail()
        await route.close()
        continuation.finish(throwing: error)
    }

    private func finish() async {
        guard !isClosed else { return }
        isClosed = true
        receiveTask?.cancel()
        receiveTask = nil
        await input.fail()
        await route.close()
        continuation.finish()
    }
}

import Foundation
import SwiftProtobuf
import YiruProtocol

actor TerminalBulkConnection {
    typealias IsControlGenerationCurrent = @Sendable () async -> Bool

    private let connection: AuthenticatedRuntimeConnection
    private let isControlGenerationCurrent: IsControlGenerationCurrent
    private let protocolAdapter: RuntimeProtocolAdapter
    private var duplex: RuntimeProtocolDuplex?
    private var streamTask: Task<Void, Never>?
    private var wire: TerminalMultiplexWire?
    private var receiveTask: Task<Void, Never>?
    private var routeContinuations:
        [UInt32: AsyncThrowingStream<TerminalBulkRouteEvent, Error>.Continuation] = [:]
    private var nextRouteID: UInt32 = 1
    private var maxStreams: UInt32?
    private var hasAcceptedEpoch = false
    private var hasIteratorReady = false
    private var hasPublishedReady = false
    private var readyWaiters: [CheckedContinuation<Void, Error>] = []
    private var backgroundedAt: Date?
    private var routeAppStates: [UInt32: TerminalMultiplexAppState] = [:]
    private var appState = TerminalMultiplexAppState.foreground
    private var appStateGeneration: UInt64 = 0
    private var isClosed = false

    private init(
        connection: AuthenticatedRuntimeConnection,
        isControlGenerationCurrent: @escaping IsControlGenerationCurrent
    ) {
        self.connection = connection
        self.protocolAdapter = RuntimeProtocolAdapter(
            sendBinary: { data in try await connection.sendBinary(data) },
            closeConnection: { await connection.close() }
        )
        self.isControlGenerationCurrent = isControlGenerationCurrent
    }

    static func connect(
        ticket: MobileTerminalOpenMultiplexWire,
        credential: HostCredential,
        isControlGenerationCurrent: @escaping IsControlGenerationCurrent
    ) async throws -> TerminalBulkConnection {
        guard ticket.expiresAt > Int64(Date().timeIntervalSince1970 * 1_000) else {
            throw TerminalBulkConnectionError.expiredTicket
        }
        let connection = try await AuthenticatedRuntimeConnection.connect(
            endpoint: credential.profile.endpoint,
            desktopPublicKeyBase64: credential.profile.publicKeyBase64,
            deviceToken: credential.deviceToken
        )
        let bulk = TerminalBulkConnection(
            connection: connection,
            isControlGenerationCurrent: isControlGenerationCurrent
        )
        do {
            try await withThrowingTaskGroup(of: Void.self) { group in
                group.addTask {
                    try await bulk.start(ticket: ticket)
                    try await bulk.waitUntilReady()
                }
                group.addTask {
                    try await Task.sleep(for: .seconds(10))
                    throw RuntimeTransportError.deadlineExceeded
                }
                defer { group.cancelAll() }
                _ = try await group.next()
            }
            return bulk
        } catch {
            await bulk.fail(error)
            throw error
        }
    }

    func openRoute() throws -> TerminalBulkRoute {
        guard !isClosed else { throw TerminalBulkConnectionError.invalidPeerMessage }
        guard nextRouteID > 0, nextRouteID <= 0x7fff_ffff else {
            throw TerminalBulkConnectionError.routeIDsExhausted
        }
        if let maxStreams, routeContinuations.count >= Int(maxStreams) {
            throw TerminalBulkConnectionError.maxStreamsExceeded
        }
        let routeID = nextRouteID
        nextRouteID += 1
        let pair = AsyncThrowingStream.makeStream(of: TerminalBulkRouteEvent.self)
        routeContinuations[routeID] = pair.continuation
        routeAppStates[routeID] = .background
        if hasPublishedReady {
            pair.continuation.yield(.accepted)
        }
        return TerminalBulkRoute(id: routeID, bulk: self, stream: pair.stream)
    }

    func isOpen() -> Bool {
        !isClosed
    }

    func closeRoute(_ routeID: UInt32) async {
        routeContinuations.removeValue(forKey: routeID)?.finish()
        routeAppStates.removeValue(forKey: routeID)
        if routeContinuations.isEmpty {
            await close()
        } else {
            await synchronizeAppState()
        }
    }

    func send(_ frame: TerminalMultiplexFrame) async throws {
        try await requireCurrentControlGeneration()
        guard hasPublishedReady, routeContinuations[frame.routeID] != nil, let wire else {
            throw TerminalBulkConnectionError.invalidPeerMessage
        }
        try await wire.send(
            opcode: frame.opcode,
            routeID: frame.routeID,
            sequence: frame.sequence,
            correlationID: frame.correlationID,
            payload: frame.payload
        )
    }

    func allocateCorrelationID() async throws -> UInt32 {
        guard let wire else { throw TerminalBulkConnectionError.invalidPeerMessage }
        do {
            return try await wire.allocateCorrelationID()
        } catch TerminalMultiplexWireError.correlationIDsExhausted {
            await fail(TerminalMultiplexWireError.correlationIDsExhausted)
            throw TerminalMultiplexWireError.correlationIDsExhausted
        }
    }

    func setAppState(_ state: TerminalMultiplexAppState, routeID: UInt32) async {
        guard routeContinuations[routeID] != nil else { return }
        routeAppStates[routeID] = state
        await synchronizeAppState()
    }

    private func synchronizeAppState() async {
        // Why: tabs share one wire; parking one must not suspend another visible terminal.
        let state: TerminalMultiplexAppState =
            routeAppStates.values.contains(.foreground)
            ? .foreground : .background
        guard state != appState else { return }
        appState = state
        appStateGeneration += 1
        let generation = appStateGeneration
        guard let wire, !isClosed else { return }
        if state == .background {
            backgroundedAt = Date()
            await wire.setAppState(state)
            return
        }
        let backgroundSeconds = backgroundedAt.map { Date().timeIntervalSince($0) } ?? 0
        backgroundedAt = nil
        let isFresh = await wire.isFresh()
        let isConnected = await connection.isOpen()
        let isCurrentControl = await isControlGenerationCurrent()
        guard generation == appStateGeneration, !isClosed else { return }
        guard backgroundSeconds <= 5, isFresh, isConnected, isCurrentControl else {
            await fail(TerminalBulkConnectionError.staleAfterBackground)
            return
        }
        await wire.setAppState(state)
    }

    func close() async {
        guard !isClosed else { return }
        isClosed = true
        receiveTask?.cancel()
        receiveTask = nil
        streamTask?.cancel()
        streamTask = nil
        let closingDuplex = duplex
        duplex = nil
        let closingWire = wire
        wire = nil
        let waiters = readyWaiters
        readyWaiters.removeAll()
        waiters.forEach { $0.resume(throwing: CancellationError()) }
        finishRoutes()
        // Why: readiness and route cancellation must finish even if network cleanup stalls.
        try? await closingDuplex?.source.cancel(reason: "Terminal bulk closed")
        await closingWire?.close()
        await protocolAdapter.close()
        await connection.close()
    }

    private func start(ticket: MobileTerminalOpenMultiplexWire) async throws {
        wire = TerminalMultiplexWire(
            maxFrameBytes: ticket.maxFrameBytes,
            sendBytes: { [weak self] bytes in
                guard let self else { throw CancellationError() }
                try await self.sendInner(bytes)
            },
            publishEvent: { [weak self] event in
                await self?.publish(event)
            },
            publishFailure: { [weak self] error in
                await self?.fail(error)
            }
        )
        receiveTask = Task { [weak self] in
            await self?.receiveLoop()
        }
        do {
            guard connection.capabilities.contains(authenticatedRuntimeProtobufCapability) else {
                throw RuntimeTransportError.unsupportedVersion
            }
            try await protocolAdapter.open(peerVersion: mobileRuntimeProtocolPeerVersion())
            try await requireCurrentControlGeneration()
            var request = Yiru_Runtime_V1_TerminalServiceMultiplexRequest()
            request.content = .bulkTicket(ticket.bulkTicket)
            let stream = try await protocolAdapter.duplex(
                RuntimeUnaryCall(
                    procedure: "/yiru.runtime.v1.TerminalService/Multiplex",
                    payload: try request.serializedData()
                ))
            duplex = stream
            streamTask = Task { [weak self] in await self?.receiveStream(stream.source) }
        } catch {
            await fail(error)
            throw error
        }
    }

    private func waitUntilReady() async throws {
        guard !isClosed else { throw TerminalBulkConnectionError.invalidPeerMessage }
        if hasPublishedReady { return }
        try await withTaskCancellationHandler {
            try Task.checkCancellation()
            try await withCheckedThrowingContinuation {
                (continuation: CheckedContinuation<Void, Error>) in
                readyWaiters.append(continuation)
            }
        } onCancel: {
            Task { await self.close() }
        }
    }

    private func receiveLoop() async {
        do {
            while !Task.isCancelled && !isClosed {
                switch try await connection.receive() {
                case .text:
                    throw TerminalBulkConnectionError.invalidPeerMessage
                case .binary(let data):
                    try await protocolAdapter.receive(data)
                }
            }
        } catch is CancellationError {
            return
        } catch {
            await fail(error)
        }
    }

    private func receiveStream(_ source: RuntimeStream) async {
        do {
            for try await payload in source.events {
                try await requireCurrentControlGeneration()
                let response = try Yiru_Runtime_V1_TerminalServiceMultiplexEvent(
                    serializedBytes: payload)
                switch response.content {
                case .ready:
                    guard !hasIteratorReady else {
                        throw TerminalBulkConnectionError.invalidPeerMessage
                    }
                    hasIteratorReady = true
                    publishReadyIfNeeded()
                case .frame(let bytes):
                    guard let wire else { throw TerminalBulkConnectionError.invalidPeerMessage }
                    try await wire.handle(bytes)
                case nil:
                    throw TerminalBulkConnectionError.invalidPeerMessage
                }
            }
            if !isClosed { await fail(TerminalBulkConnectionError.iteratorEnded) }
        } catch is CancellationError {
            return
        } catch {
            await fail(error)
        }
    }

    private func sendInner(_ bytes: Data) async throws {
        try await requireCurrentControlGeneration()
        guard let duplex else { throw TerminalBulkConnectionError.invalidPeerMessage }
        var request = Yiru_Runtime_V1_TerminalServiceMultiplexRequest()
        request.content = .frame(bytes)
        try await duplex.send(request.serializedData())
    }

    private func requireCurrentControlGeneration() async throws {
        guard await isControlGenerationCurrent() else {
            let error = TerminalBulkConnectionError.staleControlGeneration
            await fail(error)
            throw error
        }
    }

    private func publish(_ event: TerminalMultiplexWireEvent) async {
        switch event {
        case .accepted(let maxStreams):
            guard routeContinuations.count <= Int(maxStreams) else {
                await fail(TerminalBulkConnectionError.maxStreamsExceeded)
                return
            }
            self.maxStreams = maxStreams
            hasAcceptedEpoch = true
            publishReadyIfNeeded()
        case .streamFrame(let frame):
            routeContinuations[frame.routeID]?.yield(.frame(frame))
        }
    }

    private func publishReadyIfNeeded() {
        guard !isClosed, hasAcceptedEpoch, hasIteratorReady, !hasPublishedReady else { return }
        hasPublishedReady = true
        routeContinuations.values.forEach { $0.yield(.accepted) }
        let waiters = readyWaiters
        readyWaiters.removeAll()
        waiters.forEach { $0.resume() }
    }

    private func fail(_ error: Error) async {
        guard !isClosed else { return }
        isClosed = true
        receiveTask?.cancel()
        receiveTask = nil
        streamTask?.cancel()
        streamTask = nil
        let closingDuplex = duplex
        duplex = nil
        let closingWire = wire
        wire = nil
        let waiters = readyWaiters
        readyWaiters.removeAll()
        waiters.forEach { $0.resume(throwing: error) }
        finishRoutes(throwing: error)
        try? await closingDuplex?.source.cancel(reason: "Terminal bulk failed")
        await closingWire?.close()
        let details = terminalBulkCloseDetails(error)
        await connection.close(code: details.code, reason: details.reason)
        await protocolAdapter.close()
    }

    private func finishRoutes(throwing error: Error? = nil) {
        let continuations = routeContinuations.values
        routeContinuations.removeAll()
        routeAppStates.removeAll()
        for continuation in continuations {
            if let error {
                continuation.finish(throwing: error)
            } else {
                continuation.finish()
            }
        }
    }
}

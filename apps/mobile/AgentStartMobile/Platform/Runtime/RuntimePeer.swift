import AgentStartProtocol
import Foundation
import SwiftProtobuf

nonisolated private let runtimeProtocolHandshakeTimeout: Duration = .seconds(3)
nonisolated private let runtimeProtocolAccountsReadyTimeout: Duration = .seconds(4)
nonisolated private let runtimeProtocolNotificationReadyTimeout: Duration = .seconds(4)

actor RuntimePeer {
    private let connection: AuthenticatedRuntimeConnection
    private var receiveTask: Task<Void, Never>?
    // Why: internal so per-feature runtime extensions can call the generated
    // protobuf clients without each one routing through this actor's methods.
    let protocolAdapter: RuntimeProtocolAdapter
    private var runtimeCapabilities: Set<String>?
    private var runtimeCapabilitiesTask: (id: UUID, task: Task<Set<String>, Error>)?
    private var isClosed = false

    init(connection: AuthenticatedRuntimeConnection) {
        self.connection = connection
        self.protocolAdapter = RuntimeProtocolAdapter(
            sendBinary: { data in try await connection.sendBinary(data) },
            closeConnection: { await connection.close() }
        )
    }

    func ping() async throws {
        guard !isClosed else { throw RuntimeServiceError.closed }
        try await connection.ping()
    }

    // Why: the git, github, and files protobuf services have no generated Swift
    // client wrappers, so feature extensions share this single typed unary path.
    // The session layer owns the timeout race; no transport deadline is set so a
    // slow call cannot tear down a healthy encrypted connection.
    func runtimeProtocolUnary<Request: SwiftProtobuf.Message, Response: SwiftProtobuf.Message>(
        procedure: String,
        request: Request,
        response: Response.Type
    ) async throws -> Response {
        guard !isClosed else { throw RuntimeServiceError.closed }
        let bytes = try await protocolAdapter.unary(
            RuntimeUnaryCall(
                procedure: procedure,
                payload: try request.serializedData(),
                options: RuntimeCallOptions()
            )
        )
        return try Response(serializedBytes: bytes)
    }

    func runtimeProtocolStatus() async throws -> MobileRuntimeStatusWire {
        guard !isClosed else { throw RuntimeServiceError.closed }
        let status = try await StatusClient(transport: protocolAdapter).get(
            options: RuntimeCallOptions(timeout: .seconds(4))
        )
        if runtimeCapabilities == nil {
            runtimeCapabilities = Set(status.capabilities)
        }
        return MobileRuntimeStatusWire(protocolStatus: status)
    }

    func supportsCapability(_ capability: String) async throws -> Bool {
        guard !isClosed else { throw RuntimeServiceError.closed }
        if let runtimeCapabilities {
            return runtimeCapabilities.contains(capability)
        }
        let id: UUID
        let task: Task<Set<String>, Error>
        if let runtimeCapabilitiesTask {
            id = runtimeCapabilitiesTask.id
            task = runtimeCapabilitiesTask.task
        } else {
            let adapter = protocolAdapter
            id = UUID()
            task = Task {
                let status = try await StatusClient(transport: adapter).get(
                    options: RuntimeCallOptions(timeout: .seconds(4))
                )
                return Set(status.capabilities)
            }
            runtimeCapabilitiesTask = (id, task)
        }
        do {
            let capabilities = try await task.value
            runtimeCapabilities = capabilities
            clearRuntimeCapabilitiesTask(id: id)
            return capabilities.contains(capability)
        } catch {
            clearRuntimeCapabilitiesTask(id: id)
            throw error
        }
    }

    func runtimeProtocolProjectRevision(projectID: String) async throws -> UInt64 {
        guard !isClosed else { throw RuntimeServiceError.closed }
        return try await WorkspaceEventsClient(transport: protocolAdapter).getProjectRevision(
            projectID: projectID,
            options: RuntimeCallOptions(timeout: .seconds(4))
        )
    }

    func runtimeProtocolRepoHooks(projectID: String) async throws
        -> AgentStart_Runtime_V1_RepoServiceGetHooksResponse
    {
        guard !isClosed else { throw RuntimeServiceError.closed }
        return try await RepoClient(transport: protocolAdapter).getHooks(
            projectID: projectID,
            options: RuntimeCallOptions(timeout: .seconds(4))
        )
    }

    func runtimeProtocolCreateWorktree(
        request: AgentStart_Runtime_V1_WorktreeServiceCreateRequest
    ) async throws -> AgentStart_Runtime_V1_WorktreeServiceCreateResponse {
        guard !isClosed else { throw RuntimeServiceError.closed }
        return try await WorktreeClient(transport: protocolAdapter).create(
            request: request,
            options: RuntimeCallOptions(timeout: .seconds(600))
        )
    }

    func runtimeProtocolStatsSummary(
        range: AgentStart_Runtime_V1_StatsUsageRange,
        refreshUsage: Bool
    ) async throws -> AgentStart_Runtime_V1_GetSummaryResponse {
        guard !isClosed else { throw RuntimeServiceError.closed }
        return try await StatsClient(transport: protocolAdapter).getSummary(
            refreshUsage: refreshUsage,
            range: range,
            options: RuntimeCallOptions(timeout: .seconds(12))
        )
    }

    func runtimeProtocolAgentHistory(
        limit: UInt32,
        force: Bool,
        compact: Bool,
        scopePaths: [String]
    ) async throws -> AgentStart_Runtime_V1_AiVaultServiceListSessionsResponse {
        guard !isClosed else { throw RuntimeServiceError.closed }
        return try await AiVaultClient(transport: protocolAdapter).listSessions(
            limit: limit,
            force: force,
            compact: compact,
            scopePaths: scopePaths,
            options: RuntimeCallOptions(timeout: .seconds(20))
        )
    }

    func runtimeProtocolInferAgentInterrupt(
        paneKey: String,
        baselineUpdatedAt: Double,
        baselineStateStartedAt: Double,
        baselinePrompt: String,
        baselineAgentType: String?
    ) async throws -> Bool {
        guard !isClosed else { throw RuntimeServiceError.closed }
        return try await AgentStatusClient(transport: protocolAdapter).inferInterrupt(
            paneKey: paneKey,
            baselineUpdatedAt: baselineUpdatedAt,
            baselineStateStartedAt: baselineStateStartedAt,
            baselinePrompt: baselinePrompt,
            baselineAgentType: baselineAgentType,
            intent: .plainEscape,
            inputCount: nil,
            options: RuntimeCallOptions(timeout: .seconds(4))
        )
    }

    func runtimeProtocolAccounts() async throws -> AgentStart_Runtime_V1_AccountsSnapshot {
        guard !isClosed else { throw RuntimeServiceError.closed }
        let response = try await AccountsClient(transport: protocolAdapter).list(
            options: RuntimeCallOptions(timeout: .seconds(20))
        )
        guard response.hasSnapshot else {
            throw RuntimeResponseValidationError("accounts.snapshot")
        }
        return response.snapshot
    }

    func runtimeProtocolSelectAccount(
        provider: AgentStart_Runtime_V1_AccountProvider,
        accountID: String?
    ) async throws -> AgentStart_Runtime_V1_AccountsServiceSelectResponse {
        guard !isClosed else { throw RuntimeServiceError.closed }
        return try await AccountsClient(transport: protocolAdapter).select(
            provider: provider,
            accountID: accountID,
            options: RuntimeCallOptions(timeout: .seconds(20))
        )
    }

    func runtimeProtocolAccountUpdates() async throws
        -> AsyncThrowingStream<AgentStart_Runtime_V1_AccountsSnapshot, Error>
    {
        guard !isClosed else { throw RuntimeServiceError.closed }
        let source = try await AccountsClient(transport: protocolAdapter).subscribe()
        let cursor = ProtocolAccountsCursor(
            source: source,
            iterator: source.makeAsyncIterator()
        )
        do {
            try await withThrowingTaskGroup(of: Void.self) { group in
                group.addTask { try await cursor.consumeReady() }
                group.addTask {
                    try await Task.sleep(for: runtimeProtocolAccountsReadyTimeout)
                    throw RuntimeSessionError.timeout
                }
                defer { group.cancelAll() }
                _ = try await group.next()
            }
        } catch {
            await cursor.cancel()
            throw error
        }

        let (stream, continuation) = AsyncThrowingStream.makeStream(
            of: AgentStart_Runtime_V1_AccountsSnapshot.self
        )
        let forwardingTask = Task {
            do {
                while let snapshot = try await cursor.next() {
                    continuation.yield(snapshot)
                }
                await cursor.cancel()
                continuation.finish()
            } catch is CancellationError {
                await cursor.cancel()
                continuation.finish()
            } catch {
                await cursor.cancel()
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in
            forwardingTask.cancel()
            Task { await cursor.cancel() }
        }
        return stream
    }

    func runtimeProtocolTerminalAutoRestoreFit() async throws -> TimeInterval? {
        guard !isClosed else { throw RuntimeServiceError.closed }
        let response = try await TerminalPreferencesClient(transport: protocolAdapter)
            .getAutoRestoreFit(options: RuntimeCallOptions(timeout: .seconds(4)))
        return response.hasMilliseconds ? response.milliseconds : nil
    }

    func runtimeProtocolTerminalList(
        worktree: String,
        limit: UInt32,
        requireFreshPtyLiveness: Bool
    ) async throws -> AgentStart_Runtime_V1_TerminalServiceListResponse {
        guard !isClosed else { throw RuntimeServiceError.closed }
        return try await TerminalClient(transport: protocolAdapter).list(
            worktree: worktree,
            limit: limit,
            requireFreshPtyLiveness: requireFreshPtyLiveness,
            options: RuntimeCallOptions(timeout: .seconds(4))
        )
    }

    func runtimeProtocolTerminalClose(
        terminal: String
    ) async throws -> AgentStart_Runtime_V1_TerminalServiceCloseResponse {
        guard !isClosed else { throw RuntimeServiceError.closed }
        return try await TerminalClient(transport: protocolAdapter).close(
            terminal: terminal,
            options: RuntimeCallOptions(timeout: .seconds(4))
        )
    }

    func runtimeProtocolSetTerminalAutoRestoreFit(
        milliseconds: TimeInterval?
    ) async throws -> TimeInterval? {
        guard !isClosed else { throw RuntimeServiceError.closed }
        let response = try await TerminalPreferencesClient(transport: protocolAdapter)
            .setAutoRestoreFit(
                milliseconds: milliseconds,
                options: RuntimeCallOptions(timeout: .seconds(4))
            )
        return response.hasMilliseconds ? response.milliseconds : nil
    }

    func runtimeProtocolMissedNotifications(after sequence: Int64) async throws
        -> AgentStart_Runtime_V1_GetMissedSinceResponse
    {
        guard !isClosed else { throw RuntimeServiceError.closed }
        return try await NotificationsClient(transport: protocolAdapter).getMissedSince(
            lastSeenSequence: sequence,
            options: RuntimeCallOptions(timeout: .seconds(4))
        )
    }

    func runtimeProtocolNotificationUpdates() async throws
        -> RuntimeNotificationStream
    {
        guard !isClosed else { throw RuntimeServiceError.closed }
        let source = try await NotificationsClient(transport: protocolAdapter).subscribe()
        let cursor = ProtocolNotificationCursor(
            source: source,
            iterator: source.makeAsyncIterator()
        )
        do {
            try await withThrowingTaskGroup(of: Void.self) { group in
                group.addTask { try await cursor.consumeReady() }
                group.addTask {
                    try await Task.sleep(for: runtimeProtocolNotificationReadyTimeout)
                    throw RuntimeSessionError.timeout
                }
                defer { group.cancelAll() }
                _ = try await group.next()
            }
        } catch {
            await cursor.cancel()
            throw error
        }
        return RuntimeNotificationStream(
            next: { try await cursor.next() },
            cancel: { await cursor.cancel() }
        )
    }

    func openRuntimeProtocol() async throws {
        guard !isClosed else { throw RuntimeServiceError.closed }
        guard connection.capabilities.contains(authenticatedRuntimeProtobufCapability) else {
            throw RuntimeTransportError.unsupportedVersion
        }
        startReceivingIfNeeded()
        let adapter = protocolAdapter
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                try await adapter.open(peerVersion: mobileRuntimeProtocolPeerVersion())
            }
            group.addTask {
                try await Task.sleep(for: runtimeProtocolHandshakeTimeout)
                throw RuntimeTransportError.handshakeFailed
            }
            defer { group.cancelAll() }
            _ = try await group.next()
        }
    }

    func close() async {
        guard !isClosed else { return }
        isClosed = true
        runtimeCapabilitiesTask?.task.cancel()
        runtimeCapabilitiesTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        await connection.close()
        await protocolAdapter.close()
    }

    private func startReceivingIfNeeded() {
        guard receiveTask == nil else { return }
        receiveTask = Task { [weak self] in
            guard let self else { return }
            await self.receiveLoop()
        }
    }

    private func clearRuntimeCapabilitiesTask(id: UUID) {
        guard runtimeCapabilitiesTask?.id == id else { return }
        runtimeCapabilitiesTask = nil
    }

    private func receiveLoop() async {
        do {
            while !Task.isCancelled && !isClosed {
                switch try await connection.receive() {
                case .text:
                    throw RuntimeTransportError.unexpectedMessage
                case .binary(let data):
                    try await receiveBinary(data)
                }
            }
        } catch is CancellationError {
            await protocolAdapter.close()
        } catch {
            // Why: frame decoding failures mean the peer stream is unusable. Response-body
            // decoding happens after dispatch and remains a request-local protocol error.
            await protocolAdapter.close()
        }
        if !isClosed {
            isClosed = true
            await connection.close()
        }
    }

    private func receiveBinary(_ data: Data) async throws {
        // Why: a frame without the runtime protocol preamble is not addressed to
        // the protobuf adapter; dropping it keeps a stray binary frame from
        // tearing down an otherwise healthy encrypted connection.
        guard RuntimeFrameCodec.hasPreamble(data) else { return }
        try await protocolAdapter.receive(data)
    }
}

private actor ProtocolNotificationCursor {
    private var isCancelled = false
    private var isReadyPending = false
    private var iterator: NotificationsStream.AsyncIterator?
    private let source: NotificationsStream

    init(source: NotificationsStream, iterator: NotificationsStream.AsyncIterator) {
        self.source = source
        self.iterator = iterator
    }

    func consumeReady() async throws {
        guard let first = try await nextResponse(), case .ready? = first.event else {
            throw RuntimeResponseValidationError("notifications.ready")
        }
        isReadyPending = true
    }

    func next() async throws -> RuntimeNotificationEvent? {
        if isReadyPending {
            isReadyPending = false
            return .ready
        }
        while let response = try await nextResponse() {
            if let event = try mapProtocolSubscribeEvent(response) {
                return event
            }
        }
        return nil
    }

    func cancel() async {
        isCancelled = true
        iterator = nil
        try? await source.cancel(reason: "Notification stream consumer stopped")
    }

    private func nextResponse() async throws -> AgentStart_Runtime_V1_SubscribeResponse? {
        guard !isCancelled, var iterator else { return nil }
        self.iterator = nil
        do {
            let response = try await iterator.next()
            if !isCancelled { self.iterator = iterator }
            return response
        } catch {
            if !isCancelled { self.iterator = iterator }
            throw error
        }
    }
}

private actor ProtocolAccountsCursor {
    private var isCancelled = false
    private var readySnapshot: AgentStart_Runtime_V1_AccountsSnapshot?
    private var iterator: AccountsStream.AsyncIterator?
    private let source: AccountsStream

    init(source: AccountsStream, iterator: AccountsStream.AsyncIterator) {
        self.source = source
        self.iterator = iterator
    }

    func consumeReady() async throws {
        guard let first = try await nextResponse(), case .ready(let ready)? = first.event,
            ready.hasSnapshot
        else {
            throw RuntimeResponseValidationError("accounts.ready.snapshot")
        }
        readySnapshot = ready.snapshot
    }

    func next() async throws -> AgentStart_Runtime_V1_AccountsSnapshot? {
        if let readySnapshot {
            self.readySnapshot = nil
            return readySnapshot
        }
        while let response = try await nextResponse() {
            guard let event = response.event else { continue }
            switch event {
            case .snapshot(let snapshot): return snapshot
            case .ready(let ready):
                guard ready.hasSnapshot else {
                    throw RuntimeResponseValidationError("accounts.ready.snapshot")
                }
                // Why: environment-routed streams restart from their original
                // request after reconnect and intentionally emit a fresh ready.
                return ready.snapshot
            case .end: return nil
            }
        }
        return nil
    }

    func cancel() async {
        guard !isCancelled else { return }
        isCancelled = true
        iterator = nil
        try? await source.cancel(reason: "Accounts stream consumer stopped")
    }

    private func nextResponse() async throws
        -> AgentStart_Runtime_V1_AccountsServiceSubscribeResponse?
    {
        guard !isCancelled, var iterator else { return nil }
        self.iterator = nil
        do {
            let response = try await iterator.next()
            if !isCancelled { self.iterator = iterator }
            return response
        } catch {
            if !isCancelled { self.iterator = iterator }
            throw error
        }
    }
}

nonisolated enum RuntimeServiceError: LocalizedError {
    case invalidMessage
    case unexpectedResponse
    case server(status: Int, code: String?, message: String?)
    case closed

    var serverMessage: String? {
        guard case .server(_, _, let message) = self else { return nil }
        return message
    }

    var serverCode: String? {
        guard case .server(_, let code, _) = self else { return nil }
        return code
    }

    var errorDescription: String? {
        switch self {
        case .invalidMessage:
            String(localized: "Daemon returned an invalid response")
        case .unexpectedResponse:
            String(localized: "Daemon returned an unexpected response")
        case .server(let status, let code, let message):
            if let message = message?.trimmingCharacters(in: .whitespacesAndNewlines),
                !message.isEmpty
            {
                message
            } else if let code = code?.trimmingCharacters(in: .whitespacesAndNewlines),
                !code.isEmpty
            {
                String(localized: "Daemon request failed: \(code)")
            } else {
                String(localized: "Daemon request failed with status \(status)")
            }
        case .closed:
            String(localized: "The daemon connection closed")
        }
    }
}

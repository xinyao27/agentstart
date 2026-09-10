import AgentStartProtocol
import Foundation
import SwiftProtobuf

actor RuntimeHostSession {
    private let credential: HostCredential
    private let policy: RuntimeReconnectPolicy
    private let callTimeout: Duration
    private let publishSnapshot: @Sendable (RuntimeConnectionSnapshot) async -> Void
    private let publishLog: RuntimeConnectionLogSink

    private var phase: RuntimeConnectionPhase = .idle
    private var reconnectAttempt = 0
    private var authenticationRejections = 0
    private var lastConnectedAt: Date?
    var connectionGeneration = 0
    private var connectionAttemptGeneration = 0
    private var reconnectGeneration = 0
    private var peer: RuntimePeer?
    private var connectTask: Task<RuntimePeer, Error>?
    private var reconnectTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var runtimeProtocolOpenTask: (generation: Int, token: UUID, task: Task<Void, Error>)?
    private var runtimeProtocolOpenGeneration: Int?
    private var deferredRevivalTask: Task<Void, Never>?
    private var lastRevivalAt: ContinuousClock.Instant?
    private var nextConnectionAttemptAt: ContinuousClock.Instant?
    private var isStopped = false

    init(
        credential: HostCredential,
        policy: RuntimeReconnectPolicy = .mobile,
        callTimeout: Duration = .seconds(25),
        publishSnapshot: @escaping @Sendable (RuntimeConnectionSnapshot) async -> Void,
        publishLog: @escaping RuntimeConnectionLogSink
    ) {
        self.credential = credential
        self.policy = policy
        self.callTimeout = callTimeout
        self.publishSnapshot = publishSnapshot
        self.publishLog = publishLog
    }

    func snapshot() -> RuntimeConnectionSnapshot {
        RuntimeConnectionSnapshot(
            hostID: credential.profile.id,
            hostName: credential.profile.name,
            phase: phase,
            reconnectAttempt: reconnectAttempt,
            lastConnectedAt: lastConnectedAt
        )
    }

    func generation() -> Int {
        connectionGeneration
    }

    func start() async {
        guard !isStopped, phase != .authenticationFailed else { return }
        if peer == nil && connectTask == nil {
            phase = reconnectAttempt == 0 ? .connecting : .reconnecting
            await publish()
        }
        startReconnectLoop()
    }

    func protocolStatus() async throws -> MobileRuntimeStatusWire {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolStatus()
        }
    }

    func supportsCapability(_ capability: String) async throws -> Bool {
        try await runtimeProtocolCall { peer in
            try await peer.supportsCapability(capability)
        }
    }

    func protocolProjectRevision(projectID: String) async throws -> UInt64 {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolProjectRevision(projectID: projectID)
        }
    }

    func protocolRepoHooks(projectID: String) async throws
        -> AgentStart_Runtime_V1_RepoServiceGetHooksResponse
    {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolRepoHooks(projectID: projectID)
        }
    }

    func protocolCreateWorktree(
        request: AgentStart_Runtime_V1_WorktreeServiceCreateRequest
    ) async throws -> AgentStart_Runtime_V1_WorktreeServiceCreateResponse {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolCreateWorktree(request: request)
        }
    }

    func protocolStatsSummary(
        range: AgentStart_Runtime_V1_StatsUsageRange,
        refreshUsage: Bool
    ) async throws -> AgentStart_Runtime_V1_GetSummaryResponse {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolStatsSummary(
                range: range,
                refreshUsage: refreshUsage
            )
        }
    }

    func protocolAgentHistory(
        limit: UInt32,
        force: Bool,
        compact: Bool,
        scopePaths: [String]
    ) async throws -> AgentStart_Runtime_V1_AiVaultServiceListSessionsResponse {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolAgentHistory(
                limit: limit,
                force: force,
                compact: compact,
                scopePaths: scopePaths
            )
        }
    }

    func protocolInferAgentInterrupt(
        paneKey: String,
        baselineUpdatedAt: Double,
        baselineStateStartedAt: Double,
        baselinePrompt: String,
        baselineAgentType: String?
    ) async throws -> Bool {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolInferAgentInterrupt(
                paneKey: paneKey,
                baselineUpdatedAt: baselineUpdatedAt,
                baselineStateStartedAt: baselineStateStartedAt,
                baselinePrompt: baselinePrompt,
                baselineAgentType: baselineAgentType
            )
        }
    }

    func protocolAccounts() async throws -> AgentStart_Runtime_V1_AccountsSnapshot {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolAccounts()
        }
    }

    func protocolSelectAccount(
        provider: AgentStart_Runtime_V1_AccountProvider,
        accountID: String?
    ) async throws -> AgentStart_Runtime_V1_AccountsServiceSelectResponse {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolSelectAccount(
                provider: provider,
                accountID: accountID
            )
        }
    }

    func protocolAccountUpdates() async throws
        -> AsyncThrowingStream<AgentStart_Runtime_V1_AccountsSnapshot, Error>
    {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolAccountUpdates()
        }
    }

    func protocolTerminalAutoRestoreFit() async throws -> TimeInterval? {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolTerminalAutoRestoreFit()
        }
    }

    func protocolTerminalList(
        worktree: String,
        limit: UInt32,
        requireFreshPtyLiveness: Bool
    ) async throws -> AgentStart_Runtime_V1_TerminalServiceListResponse {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolTerminalList(
                worktree: worktree,
                limit: limit,
                requireFreshPtyLiveness: requireFreshPtyLiveness
            )
        }
    }

    func protocolTerminalClose(
        terminal: String
    ) async throws -> AgentStart_Runtime_V1_TerminalServiceCloseResponse {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolTerminalClose(terminal: terminal)
        }
    }

    func protocolSetTerminalAutoRestoreFit(
        milliseconds: TimeInterval?
    ) async throws -> TimeInterval? {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolSetTerminalAutoRestoreFit(milliseconds: milliseconds)
        }
    }

    func protocolMissedNotifications(after sequence: Int64) async throws
        -> [RuntimeNotificationEvent]
    {
        try await runtimeProtocolCall { peer in
            let response = try await peer.runtimeProtocolMissedNotifications(after: sequence)
            return try response.notifications.compactMap(mapProtocolNotificationEvent)
        }
    }

    func protocolNotificationUpdates() async throws
        -> RuntimeNotificationStream
    {
        try await runtimeProtocolCall { peer in
            try await peer.runtimeProtocolNotificationUpdates()
        }
    }

    func protocolSessionTabsEvents(worktree: String) async throws -> SessionTabsEventSource {
        try await runtimeProtocolCall { peer in
            try await peer.sessionTabsEvents(worktree: worktree)
        }
    }

    func protocolSessionTabsAllEvents() async throws -> SessionTabsAllEventSource {
        try await runtimeProtocolCall { peer in
            try await peer.sessionTabsAllEvents()
        }
    }

    func protocolClientEvents() async throws -> ClientEventsEventSource {
        try await runtimeProtocolCall { peer in
            try await peer.clientEventsEvents()
        }
    }

    func protocolBrowserScreencast(
        request: AgentStart_Runtime_V1_BrowserScreencastSubscribeRequest
    ) async throws -> BrowserScreencastEventSource {
        try await runtimeProtocolCall { peer in
            try await peer.browserScreencastEvents(request: request)
        }
    }

    // Why: a slow call times out without invalidating the encrypted transport.
    func protocolUnary<Request: SwiftProtobuf.Message, Response: SwiftProtobuf.Message>(
        procedure: String,
        request: Request,
        response: Response.Type,
        timeout: Duration? = nil
    ) async throws -> Response {
        let activePeer = try await connectIfNeeded()
        let generation = connectionGeneration
        let requestTimeout = timeout ?? callTimeout
        do {
            try await openRuntimeProtocol(peer: activePeer, generation: generation)
            return try await withThrowingTaskGroup(of: Response.self) { group in
                group.addTask {
                    try await activePeer.runtimeProtocolUnary(
                        procedure: procedure,
                        request: request,
                        response: response
                    )
                }
                group.addTask {
                    try await Task.sleep(for: requestTimeout)
                    throw RuntimeSessionError.timeout
                }
                defer { group.cancelAll() }
                guard let result = try await group.next() else {
                    throw RuntimeSessionError.timeout
                }
                return result
            }
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            if isRuntimeConnectionFailure(error) {
                await invalidate(generation: generation)
            }
            throw error
        }
    }

    func revive() async {
        guard !isStopped, phase != .authenticationFailed else { return }
        if let peer {
            do {
                try await pingWithTimeout(peer)
                return
            } catch {
                lastRevivalAt = ContinuousClock.now
                await invalidate(generation: connectionGeneration)
                return
            }
        }
        await requestDisconnectedRevival()
    }

    func forceReconnect() async {
        guard !isStopped else { return }
        authenticationRejections = 0
        reconnectAttempt = 0
        restartReconnectLoop()
        connectionAttemptGeneration += 1
        connectTask?.cancel()
        connectTask = nil
        heartbeatTask?.cancel()
        heartbeatTask = nil
        resetRevivalSchedule()
        nextConnectionAttemptAt = nil
        resetRuntimeProtocolOpen()
        if let peer {
            await peer.close()
            self.peer = nil
        }
        phase = .connecting
        await publishLog(.info, "Reconnect requested", credential.profile.endpoint)
        await publish()
        startReconnectLoop()
    }

    func shutdown() async {
        guard !isStopped else { return }
        isStopped = true
        reconnectGeneration += 1
        connectionAttemptGeneration += 1
        reconnectTask?.cancel()
        reconnectTask = nil
        connectTask?.cancel()
        connectTask = nil
        heartbeatTask?.cancel()
        heartbeatTask = nil
        resetRevivalSchedule()
        nextConnectionAttemptAt = nil
        resetRuntimeProtocolOpen()
        if let peer {
            await peer.close()
            self.peer = nil
        }
        phase = .idle
    }

    func connectIfNeeded() async throws -> RuntimePeer {
        while true {
            guard !isStopped else { throw RuntimeSessionError.closed }
            if let peer { return peer }
            if let connectTask {
                let attemptGeneration = connectionAttemptGeneration
                do {
                    let connectedPeer = try await connectTask.value
                    return try await adopt(connectedPeer, attemptGeneration: attemptGeneration)
                } catch {
                    try await recordConnectionFailure(error, attemptGeneration: attemptGeneration)
                    throw error
                }
            }
            guard phase != .authenticationFailed else {
                throw RuntimeSessionError.authenticationFailed
            }
            if let nextConnectionAttemptAt, ContinuousClock.now < nextConnectionAttemptAt {
                try await Task.sleep(until: nextConnectionAttemptAt)
                continue
            }

            nextConnectionAttemptAt = nil
            phase = reconnectAttempt == 0 ? .connecting : .reconnecting
            await publish()
            let credential = credential
            connectionAttemptGeneration += 1
            let attemptGeneration = connectionAttemptGeneration
            let task = Task {
                let connection = try await AuthenticatedRuntimeConnection.connect(
                    endpoint: credential.profile.endpoint,
                    desktopPublicKeyBase64: credential.profile.publicKeyBase64,
                    deviceToken: credential.deviceToken,
                    log: publishLog
                )
                return RuntimePeer(connection: connection)
            }
            connectTask = task

            do {
                let connectedPeer = try await task.value
                return try await adopt(connectedPeer, attemptGeneration: attemptGeneration)
            } catch {
                try await recordConnectionFailure(error, attemptGeneration: attemptGeneration)
                throw error
            }
        }
    }

    private func adopt(_ connectedPeer: RuntimePeer, attemptGeneration: Int) async throws
        -> RuntimePeer
    {
        guard !isStopped, attemptGeneration == connectionAttemptGeneration else {
            await connectedPeer.close()
            throw CancellationError()
        }
        if let peer { return peer }
        connectTask = nil
        peer = connectedPeer
        reconnectAttempt = 0
        authenticationRejections = 0
        lastConnectedAt = Date()
        nextConnectionAttemptAt = nil
        connectionGeneration += 1
        resetRevivalSchedule()
        resetRuntimeProtocolOpen()
        phase = .connected
        await publishLog(.success, "Connected", credential.profile.endpoint)
        await publish()
        startHeartbeat(peer: connectedPeer, generation: connectionGeneration)
        return connectedPeer
    }

    private func recordConnectionFailure(_ error: Error, attemptGeneration: Int) async throws {
        guard attemptGeneration == connectionAttemptGeneration, connectTask != nil else { return }
        connectTask = nil
        if error is CancellationError { return }
        reconnectAttempt = min(reconnectAttempt + 1, policy.fastAttemptLimit)
        if let runtimeError = error as? AuthenticatedRuntimeError,
            case .authenticationFailed = runtimeError
        {
            authenticationRejections += 1
            if authenticationRejections >= policy.authenticationRetryLimit {
                phase = .authenticationFailed
                await publishLog(.error, "Authentication failed", String(describing: error))
                await publish()
                throw RuntimeSessionError.authenticationFailed
            }
        }
        phase = reconnectAttempt >= policy.fastAttemptLimit ? .unreachable : .reconnecting
        nextConnectionAttemptAt = ContinuousClock.now + policy.delay(after: reconnectAttempt)
        await publishLog(
            .warning,
            phase == .unreachable ? "Host unreachable" : "Connection failed",
            "attempt \(reconnectAttempt) · \(String(describing: error))"
        )
        await publish()
    }

    private func startReconnectLoop() {
        guard !isStopped, reconnectTask == nil, peer == nil,
            phase != .authenticationFailed
        else { return }
        reconnectGeneration += 1
        let generation = reconnectGeneration
        reconnectTask = Task { [weak self] in
            await self?.runReconnectLoop(generation: generation)
        }
    }

    private func restartReconnectLoop() {
        reconnectGeneration += 1
        reconnectTask?.cancel()
        reconnectTask = nil
    }

    private func runReconnectLoop(generation: Int) async {
        defer {
            if reconnectGeneration == generation {
                reconnectTask = nil
            }
        }
        while !Task.isCancelled && reconnectGeneration == generation {
            do {
                _ = try await connectIfNeeded()
                return
            } catch is CancellationError {
                return
            } catch RuntimeSessionError.authenticationFailed {
                return
            } catch {
                continue
            }
        }
    }

    private func startHeartbeat(peer: RuntimePeer, generation: Int) {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    try await Task.sleep(for: .seconds(20))
                    try await self?.pingWithTimeout(peer)
                } catch is CancellationError {
                    return
                } catch {
                    await self?.publishLog(.warning, "Heartbeat failed", String(describing: error))
                    await self?.invalidate(generation: generation)
                    return
                }
            }
        }
    }

    private func pingWithTimeout(_ peer: RuntimePeer) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask { try await peer.ping() }
            group.addTask {
                try await Task.sleep(for: .seconds(8))
                await peer.close()
                throw RuntimeSessionError.timeout
            }
            _ = try await group.next()
            group.cancelAll()
        }
    }

    func invalidate(generation: Int) async {
        guard generation == connectionGeneration else { return }
        heartbeatTask?.cancel()
        heartbeatTask = nil
        resetRuntimeProtocolOpen()
        if let peer {
            await peer.close()
            self.peer = nil
        }
        phase = .reconnecting
        await publish()
        startReconnectLoop()
    }

    private func publish() async {
        await publishSnapshot(snapshot())
    }

    private func runtimeProtocolCall<Output: Sendable>(
        call: @escaping @Sendable (RuntimePeer) async throws -> Output
    ) async throws -> Output {
        let activePeer = try await connectIfNeeded()
        let generation = connectionGeneration
        do {
            try await openRuntimeProtocol(peer: activePeer, generation: generation)
            return try await call(activePeer)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            if isRuntimeConnectionFailure(error) {
                await invalidate(generation: generation)
            }
            throw error
        }
    }

    private func openRuntimeProtocol(peer activePeer: RuntimePeer, generation: Int) async throws {
        try Task.checkCancellation()
        if runtimeProtocolOpenGeneration == generation {
            guard connectionGeneration == generation, peer === activePeer else {
                throw CancellationError()
            }
            return
        }
        let token: UUID
        let task: Task<Void, Error>
        if let pending = runtimeProtocolOpenTask, pending.generation == generation {
            token = pending.token
            task = pending.task
        } else {
            token = UUID()
            let pending = Task { try await activePeer.openRuntimeProtocol() }
            runtimeProtocolOpenTask = (generation, token, pending)
            task = pending
        }
        do {
            try await task.value
        } catch {
            discardRuntimeProtocolOpen(generation: generation, token: token)
            throw error
        }
        completeRuntimeProtocolOpen(generation: generation, token: token)
        try Task.checkCancellation()
        guard connectionGeneration == generation, peer === activePeer else {
            throw CancellationError()
        }
    }

    private func completeRuntimeProtocolOpen(
        generation: Int,
        token: UUID
    ) {
        guard let pending = runtimeProtocolOpenTask,
            pending.generation == generation,
            pending.token == token
        else { return }
        runtimeProtocolOpenTask = nil
        runtimeProtocolOpenGeneration = generation
    }

    private func discardRuntimeProtocolOpen(
        generation: Int,
        token: UUID
    ) {
        guard let pending = runtimeProtocolOpenTask,
            pending.generation == generation,
            pending.token == token
        else { return }
        runtimeProtocolOpenTask = nil
    }

    private func resetRuntimeProtocolOpen() {
        runtimeProtocolOpenTask?.task.cancel()
        runtimeProtocolOpenTask = nil
        runtimeProtocolOpenGeneration = nil
    }

    private func requestDisconnectedRevival() async {
        guard deferredRevivalTask == nil else { return }
        let now = ContinuousClock.now
        if let lastRevivalAt {
            let elapsed = now - lastRevivalAt
            if elapsed < policy.revivalMinimumInterval {
                let delay = policy.revivalMinimumInterval - elapsed
                deferredRevivalTask = Task { [weak self] in
                    do {
                        try await Task.sleep(for: delay)
                    } catch {
                        return
                    }
                    await self?.performDisconnectedRevival()
                }
                return
            }
        }
        await performDisconnectedRevival()
    }

    private func performDisconnectedRevival() async {
        deferredRevivalTask = nil
        guard !isStopped, peer == nil, phase != .authenticationFailed else { return }
        lastRevivalAt = ContinuousClock.now
        nextConnectionAttemptAt = nil
        restartReconnectLoop()
        await start()
    }

    private func resetRevivalSchedule() {
        deferredRevivalTask?.cancel()
        deferredRevivalTask = nil
        lastRevivalAt = nil
    }
}

nonisolated enum RuntimeSessionError: LocalizedError {
    case authenticationFailed
    case timeout
    case closed

    var errorDescription: String? {
        switch self {
        case .authenticationFailed: "The daemon authentication failed."
        case .timeout: "The daemon request timed out."
        case .closed: "The daemon connection closed."
        }
    }
}

nonisolated func isRuntimeConnectionFailure(_ error: Error) -> Bool {
    if error is RuntimeResponseValidationError {
        return false
    }
    if let sessionError = error as? RuntimeSessionError {
        // Why: a slow RPC is a request failure, not proof that the encrypted transport died.
        // Reconnecting here tears down healthy subscriptions and makes one busy screen block
        // every other feature on the host.
        if case .timeout = sessionError { return false }
    }
    if let serviceError = error as? RuntimeServiceError {
        switch serviceError {
        case .server:
            return false
        case .invalidMessage, .unexpectedResponse, .closed:
            return true
        }
    }
    if error is DecodingError {
        return false
    }
    if let transportError = error as? RuntimeTransportError {
        switch transportError {
        case .serverStatus, .pendingCallsExceeded, .requestExceedsCredit:
            return false
        case .unsupportedVersion:
            return false
        case .callBufferExceeded, .closed, .deadlineExceeded, .handshakeFailed, .sequenceViolation,
            .unexpectedMessage:
            return true
        }
    }
    return true
}

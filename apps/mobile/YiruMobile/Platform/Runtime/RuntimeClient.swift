import Foundation
import SwiftProtobuf
import YiruProtocol

actor RuntimeClient: ConnectionDiagnosticsRepository, HomeRuntime, HostConnectionRuntime,
    TerminalSessionRuntime
{
    private let hosts: any HostRepository
    let timeout: Duration
    // Why: AppDependencies retains one RuntimeClient for the process lifetime, so the path
    // monitor intentionally has the same app-lifetime ownership instead of scene teardown.
    private let revivalMonitor: ConnectionRevivalMonitor
    private let connectionLogStore = RuntimeConnectionLogStore()
    let terminalClientInstanceID = UUID().uuidString.lowercased()
    private var sessions: [String: ManagedSession] = [:]
    var terminalMultiplexers: [String: ManagedRuntimeTerminalMultiplexer] = [:]
    private var snapshots: [String: RuntimeConnectionSnapshot] = [:]
    private var homeContinuations: [UUID: AsyncStream<RuntimeConnectionState>.Continuation] = [:]
    private var snapshotSubscriptions: [UUID: SnapshotSubscription] = [:]
    private var primaryHostID: String?
    private var primaryHostName: String?
    private var isMonitoringNetwork = false

    init(
        hosts: any HostRepository,
        timeout: Duration = .seconds(25),
        revivalMonitor: ConnectionRevivalMonitor = ConnectionRevivalMonitor()
    ) {
        self.hosts = hosts
        self.timeout = timeout
        self.revivalMonitor = revivalMonitor
    }

    func currentConnectionState() async -> RuntimeConnectionState {
        guard let credential = try? await primaryCredential() else { return .unpaired }
        let session = await session(for: credential)
        await session.start()
        return map(await session.snapshot())
    }

    func connectionStates() -> AsyncStream<RuntimeConnectionState> {
        let id = UUID()
        let (stream, continuation) = AsyncStream.makeStream(
            of: RuntimeConnectionState.self,
            bufferingPolicy: .bufferingNewest(1)
        )
        homeContinuations[id] = continuation
        continuation.yield(currentHomeState())
        continuation.onTermination = { [weak self] _ in
            Task { await self?.removeHomeContinuation(id) }
        }
        return stream
    }

    func reconnectMostRecentHost() async {
        guard let credential = try? await primaryCredential() else { return }
        let session = await session(for: credential)
        await session.forceReconnect()
    }

    func connectionSnapshots(forHostIDs hostIDs: [String]) async -> AsyncStream<
        [String: RuntimeConnectionSnapshot]
    > {
        let id = UUID()
        let hostIDs = Set(hostIDs)
        let (stream, continuation) = AsyncStream.makeStream(
            of: [String: RuntimeConnectionSnapshot].self,
            bufferingPolicy: .bufferingNewest(1)
        )
        snapshotSubscriptions[id] = SnapshotSubscription(
            hostIDs: hostIDs,
            continuation: continuation
        )
        continuation.onTermination = { [weak self] _ in
            Task { await self?.removeSnapshotSubscription(id) }
        }

        for hostID in hostIDs {
            guard let credential = try? await credential(for: hostID) else { continue }
            let session = await session(for: credential)
            await session.start()
        }
        continuation.yield(filteredSnapshots(hostIDs: hostIDs))
        return stream
    }

    func applicationDidBecomeActive() async {
        await reviveConnections()
    }

    func reconnect(hostID: String) async {
        guard let credential = try? await credential(for: hostID) else { return }
        let session = await session(for: credential)
        await session.forceReconnect()
    }

    func disconnect(hostID: String) async {
        await connectionLogStore.append(
            hostID: hostID,
            level: .info,
            message: "Disconnected by user"
        )
        if let managed = sessions.removeValue(forKey: hostID) {
            await managed.session.shutdown()
        }
        if let terminal = terminalMultiplexers.removeValue(forKey: hostID) {
            await terminal.multiplexer.shutdown()
        }
        snapshots.removeValue(forKey: hostID)
        for subscription in snapshotSubscriptions.values
        where subscription.hostIDs.contains(hostID) {
            subscription.continuation.yield(
                filteredSnapshots(hostIDs: subscription.hostIDs)
            )
        }
        if primaryHostID == hostID {
            primaryHostID = nil
            primaryHostName = nil
            homeContinuations.values.forEach { $0.yield(.unpaired) }
        }
    }

    func connectionDiagnostics(for hostID: String) async throws
        -> AsyncStream<ConnectionDiagnosticsSnapshot>
    {
        let credential = try await credential(for: hostID)
        let session = await session(for: credential)
        await session.start()
        return await connectionLogStore.updates(hostID: hostID)
    }

    func terminalConnectionContext(for hostID: String) async throws
        -> RuntimeTerminalConnectionContext
    {
        let credential = try await credential(for: hostID)
        return RuntimeTerminalConnectionContext(
            credential: credential,
            controlSession: await session(for: credential),
            clientInstanceID: terminalClientInstanceID
        )
    }

    private func primaryCredential() async throws -> HostCredential {
        guard
            let profile = try await hosts.hosts().sorted(by: {
                $0.lastConnected > $1.lastConnected
            }).first,
            let credential = try await hosts.credential(for: profile.id)
        else {
            primaryHostID = nil
            primaryHostName = nil
            throw RuntimeClientError.hostNotFound
        }
        primaryHostID = profile.id
        primaryHostName = profile.name
        return credential
    }

    private func credential(for hostID: String) async throws -> HostCredential {
        guard let credential = try await hosts.credential(for: hostID) else {
            throw WorkspaceRepositoryError.hostNotFound
        }
        return credential
    }

    func protocolStatus(hostID: String) async throws
        -> MobileRuntimeStatusWire
    {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolStatus()
    }

    func supportsCapability(hostID: String, capability: String) async throws -> Bool {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).supportsCapability(capability)
    }

    func protocolProjectRevision(hostID: String, projectID: String) async throws -> UInt64 {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolProjectRevision(projectID: projectID)
    }

    func protocolRepoHooks(hostID: String, projectID: String) async throws
        -> Yiru_Runtime_V1_RepoServiceGetHooksResponse
    {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolRepoHooks(projectID: projectID)
    }

    func protocolTerminalList(
        hostID: String,
        worktree: String,
        limit: UInt32,
        requireFreshPtyLiveness: Bool
    ) async throws -> Yiru_Runtime_V1_TerminalServiceListResponse {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolTerminalList(
            worktree: worktree,
            limit: limit,
            requireFreshPtyLiveness: requireFreshPtyLiveness
        )
    }

    func protocolTerminalClose(
        hostID: String,
        terminal: String
    ) async throws -> Yiru_Runtime_V1_TerminalServiceCloseResponse {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolTerminalClose(terminal: terminal)
    }

    func protocolCreateWorktree(
        hostID: String,
        request: Yiru_Runtime_V1_WorktreeServiceCreateRequest
    ) async throws -> Yiru_Runtime_V1_WorktreeServiceCreateResponse {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolCreateWorktree(request: request)
    }

    func protocolStatsSummary(
        hostID: String,
        range: Yiru_Runtime_V1_StatsUsageRange,
        refreshUsage: Bool
    ) async throws -> Yiru_Runtime_V1_GetSummaryResponse {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolStatsSummary(
            range: range,
            refreshUsage: refreshUsage
        )
    }

    func protocolAgentHistory(
        hostID: String,
        limit: UInt32,
        force: Bool,
        compact: Bool,
        scopePaths: [String]
    ) async throws -> Yiru_Runtime_V1_AiVaultServiceListSessionsResponse {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolAgentHistory(
            limit: limit,
            force: force,
            compact: compact,
            scopePaths: scopePaths
        )
    }

    func protocolInferAgentInterrupt(
        hostID: String,
        baseline: TerminalAgentInterruptBaseline
    ) async throws -> Bool {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolInferAgentInterrupt(
            paneKey: baseline.paneKey,
            baselineUpdatedAt: baseline.updatedAt,
            baselineStateStartedAt: baseline.stateStartedAt,
            baselinePrompt: baseline.prompt,
            baselineAgentType: baseline.agentType
        )
    }

    func protocolAccounts(hostID: String) async throws -> Yiru_Runtime_V1_AccountsSnapshot {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolAccounts()
    }

    func protocolSelectAccount(
        hostID: String,
        provider: Yiru_Runtime_V1_AccountProvider,
        accountID: String?
    ) async throws -> Yiru_Runtime_V1_AccountsServiceSelectResponse {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolSelectAccount(
            provider: provider,
            accountID: accountID
        )
    }

    func protocolAccountUpdates(hostID: String) async throws
        -> AsyncThrowingStream<Yiru_Runtime_V1_AccountsSnapshot, Error>
    {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolAccountUpdates()
    }

    func protocolTerminalAutoRestoreFit(hostID: String) async throws -> TimeInterval? {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolTerminalAutoRestoreFit()
    }

    func protocolSetTerminalAutoRestoreFit(
        hostID: String,
        milliseconds: TimeInterval?
    ) async throws -> TimeInterval? {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolSetTerminalAutoRestoreFit(
            milliseconds: milliseconds
        )
    }

    func protocolMissedNotifications(hostID: String, after sequence: Int64) async throws
        -> [RuntimeNotificationEvent]
    {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolMissedNotifications(after: sequence)
    }

    func protocolRegisterPush(
        hostID: String,
        registration: NotificationsPushRegistration?
    ) async throws {
        let credential = try await credential(for: hostID)
        try await session(for: credential).protocolRegisterPush(registration: registration)
    }

    func protocolNotificationUpdates(hostID: String) async throws
        -> RuntimeNotificationStream
    {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolNotificationUpdates()
    }

    func protocolSessionTabsEvents(
        hostID: String,
        worktree: String
    ) async throws -> SessionTabsEventSource {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolSessionTabsEvents(worktree: worktree)
    }

    func protocolSessionTabsAllEvents(hostID: String) async throws -> SessionTabsAllEventSource {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolSessionTabsAllEvents()
    }

    func protocolClientEvents(hostID: String) async throws -> ClientEventsEventSource {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolClientEvents()
    }

    func protocolBrowserScreencast(
        hostID: String,
        request: Yiru_Runtime_V1_BrowserScreencastSubscribeRequest
    ) async throws -> BrowserScreencastEventSource {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolBrowserScreencast(request: request)
    }

    func protocolClientEventsUnsubscribe(
        hostID: String,
        subscriptionID: String
    ) async throws -> Bool {
        var request = Yiru_Runtime_V1_ClientEventsServiceUnsubscribeRequest()
        request.subscriptionID = subscriptionID
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1ClientEventsServiceMethods.unsubscribe,
            request: request,
            response: Yiru_Runtime_V1_ClientEventsServiceUnsubscribeResponse.self
        )
        return response.unsubscribed
    }

    func protocolUnary<Request: SwiftProtobuf.Message, Response: SwiftProtobuf.Message>(
        hostID: String,
        procedure: String,
        request: Request,
        response: Response.Type
    ) async throws -> Response {
        let credential = try await credential(for: hostID)
        return try await session(for: credential).protocolUnary(
            procedure: procedure,
            request: request,
            response: response
        )
    }

    private func session(for credential: HostCredential) async -> RuntimeHostSession {
        beginMonitoringNetworkIfNeeded()
        if let managed = sessions[credential.profile.id], managed.credential == credential {
            return managed.session
        }
        if let previous = sessions.removeValue(forKey: credential.profile.id) {
            await previous.session.shutdown()
        }
        if let terminal = terminalMultiplexers.removeValue(forKey: credential.profile.id) {
            await terminal.multiplexer.shutdown()
        }
        let logStore = connectionLogStore
        let session = RuntimeHostSession(
            credential: credential,
            callTimeout: timeout,
            publishSnapshot: { [weak self] snapshot in
                await self?.record(snapshot)
            },
            publishLog: { level, message, detail in
                await logStore.append(
                    hostID: credential.profile.id,
                    level: level,
                    message: message,
                    detail: detail
                )
            }
        )
        sessions[credential.profile.id] = ManagedSession(credential: credential, session: session)
        snapshots[credential.profile.id] = await session.snapshot()
        return session
    }

    private func record(_ snapshot: RuntimeConnectionSnapshot) {
        guard snapshots[snapshot.hostID] != snapshot else { return }
        Task { await connectionLogStore.record(snapshot) }
        snapshots[snapshot.hostID] = snapshot
        for subscription in snapshotSubscriptions.values
        where subscription.hostIDs.contains(snapshot.hostID) {
            subscription.continuation.yield(
                filteredSnapshots(hostIDs: subscription.hostIDs)
            )
        }
        guard snapshot.hostID == primaryHostID else { return }
        let state = map(snapshot)
        homeContinuations.values.forEach { $0.yield(state) }
    }

    private func currentHomeState() -> RuntimeConnectionState {
        guard let primaryHostID, let primaryHostName else { return .unpaired }
        guard let snapshot = snapshots[primaryHostID] else {
            return .paired(hostName: primaryHostName)
        }
        return map(snapshot)
    }

    private func map(_ snapshot: RuntimeConnectionSnapshot) -> RuntimeConnectionState {
        switch snapshot.phase {
        case .idle:
            .paired(hostName: snapshot.hostName)
        case .connecting:
            .connecting(hostName: snapshot.hostName)
        case .connected:
            .connected(hostName: snapshot.hostName)
        case .reconnecting:
            .reconnecting(
                hostName: snapshot.hostName,
                reconnectAttempt: snapshot.reconnectAttempt
            )
        case .unreachable:
            .unavailable(
                hostName: snapshot.hostName,
                reconnectAttempt: snapshot.reconnectAttempt
            )
        case .authenticationFailed:
            .authenticationFailed(hostName: snapshot.hostName)
        }
    }

    private func beginMonitoringNetworkIfNeeded() {
        guard !isMonitoringNetwork else { return }
        isMonitoringNetwork = true
        revivalMonitor.start { [weak self] in
            Task { await self?.reviveConnections() }
        }
    }

    private func reviveConnections() async {
        for managed in sessions.values {
            await managed.session.revive()
        }
    }

    private func removeHomeContinuation(_ id: UUID) {
        homeContinuations.removeValue(forKey: id)
    }

    private func removeSnapshotSubscription(_ id: UUID) {
        snapshotSubscriptions.removeValue(forKey: id)
    }

    private func filteredSnapshots(hostIDs: Set<String>) -> [String: RuntimeConnectionSnapshot] {
        snapshots.filter { hostIDs.contains($0.key) }
    }
}

nonisolated private struct ManagedSession: Sendable {
    let credential: HostCredential
    let session: RuntimeHostSession
}

nonisolated private struct SnapshotSubscription: Sendable {
    let hostIDs: Set<String>
    let continuation: AsyncStream<[String: RuntimeConnectionSnapshot]>.Continuation
}

nonisolated private enum RuntimeClientError: Error {
    case hostNotFound
}

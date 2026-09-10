import Foundation
import Observation

@Observable
@MainActor
final class HomeModel {
    private(set) var phase: HomePhase = .loading
    private(set) var actionFailure: LocalizedStringResource?

    @ObservationIgnored
    private let hostRepository: any HostRepository
    @ObservationIgnored
    private let connectionRuntime: any HostConnectionRuntime
    @ObservationIgnored
    private let workspaceRepository: any WorkspaceRepository
    @ObservationIgnored
    private let accountsRepository: any AccountsRepository
    @ObservationIgnored
    private let activityRepository: any ActivityStatsRepository
    @ObservationIgnored
    private let widgetSnapshotWriter: WidgetSnapshotWriter
    @ObservationIgnored
    private let recentWorkspaceStore: RecentWorkspaceStore
    @ObservationIgnored
    private let snapshotCache: HomeSnapshotCache
    @ObservationIgnored
    private var hosts: [HostProfile] = []
    @ObservationIgnored
    private var connections: [String: RuntimeConnectionSnapshot] = [:]
    @ObservationIgnored
    private var workspaces: [String: [WorkspaceSummary]] = [:]
    @ObservationIgnored
    private var accounts: [String: AccountsSnapshot] = [:]
    @ObservationIgnored
    private var activityStats: [String: ActivityStatsSummary] = [:]
    @ObservationIgnored
    private var accountSubscriptionTasks: [String: Task<Void, Never>] = [:]
    @ObservationIgnored
    private var didHydrateCache = false

    init(
        hostRepository: any HostRepository,
        connectionRuntime: any HostConnectionRuntime,
        workspaceRepository: any WorkspaceRepository,
        accountsRepository: any AccountsRepository,
        activityRepository: any ActivityStatsRepository,
        widgetSnapshotWriter: WidgetSnapshotWriter,
        recentWorkspaceStore: RecentWorkspaceStore,
        snapshotCache: HomeSnapshotCache
    ) {
        self.hostRepository = hostRepository
        self.connectionRuntime = connectionRuntime
        self.workspaceRepository = workspaceRepository
        self.accountsRepository = accountsRepository
        self.activityRepository = activityRepository
        self.widgetSnapshotWriter = widgetSnapshotWriter
        self.recentWorkspaceStore = recentWorkspaceStore
        self.snapshotCache = snapshotCache
    }

    func observe() async {
        defer { stopAccountSubscriptions() }
        guard await loadHosts() else { return }
        let snapshots = await connectionRuntime.connectionSnapshots(forHostIDs: hosts.map(\.id))
        for await snapshots in snapshots {
            guard !Task.isCancelled else { return }
            let previouslyConnectedHostIDs = connectedHostIDs
            connections = snapshots
            reconcileAccountSubscriptions()
            let newlyConnectedHostIDs = connectedHostIDs.subtracting(previouslyConnectedHostIDs)
            if newlyConnectedHostIDs.isEmpty {
                publish()
                persistCurrentSnapshot()
            } else {
                await refreshHostContent(for: newlyConnectedHostIDs)
            }
        }
    }

    func refresh() async {
        guard await loadHosts() else { return }
        await refreshHostContent()
    }

    func reconnect(hostID: String) async {
        await connectionRuntime.reconnect(hostID: hostID)
    }

    func disconnect(hostID: String) async {
        await connectionRuntime.disconnect(hostID: hostID)
    }

    func remove(_ host: HostProfile) async -> Bool {
        actionFailure = nil
        do {
            try await hostRepository.removeHost(hostID: host.id)
            snapshotCache.remove(hostID: host.id)
            await connectionRuntime.disconnect(hostID: host.id)
            connections.removeValue(forKey: host.id)
            workspaces.removeValue(forKey: host.id)
            accounts.removeValue(forKey: host.id)
            activityStats.removeValue(forKey: host.id)
            accountSubscriptionTasks.removeValue(forKey: host.id)?.cancel()
            recentWorkspaceStore.remove(hostID: host.id)
            _ = await loadHosts()
            await refreshHostContent()
            return true
        } catch {
            actionFailure = "AgentStart could not remove this host. Please try again."
            return false
        }
    }

    func clearActionFailure() {
        actionFailure = nil
    }

    private func loadHosts() async -> Bool {
        do {
            hosts = try await hostRepository.hosts().sorted { $0.lastConnected > $1.lastConnected }
            hydrateCacheIfNeeded()
            publish()
            return true
        } catch {
            phase = .failed("AgentStart could not read the hosts stored on this device.")
            return false
        }
    }

    private func loadWorkspaces(
        for liveHostIDs: Set<String>
    ) async -> [String: [WorkspaceSummary]] {
        let hosts = hosts
        let repository = workspaceRepository
        let loaded = await withTaskGroup(of: (String, [WorkspaceSummary]?).self) { group in
            for host in hosts where liveHostIDs.contains(host.id) {
                group.addTask {
                    let snapshot = try? await repository.workspaces(for: host.id)
                    return (host.id, snapshot?.workspaces)
                }
            }
            var values: [String: [WorkspaceSummary]] = [:]
            for await (hostID, snapshot) in group {
                if let snapshot { values[hostID] = snapshot }
            }
            return values
        }
        return loaded
    }

    private var connectedHostIDs: Set<String> {
        Set(
            hosts.compactMap { host in
                connections[host.id]?.phase == .connected ? host.id : nil
            }
        )
    }

    private func refreshHostContent(for requestedHostIDs: Set<String>? = nil) async {
        let profiles = hosts
        let hostIDs = requestedHostIDs.map { connectedHostIDs.intersection($0) } ?? connectedHostIDs
        async let loadedWorkspaces = loadWorkspaces(for: hostIDs)
        async let loadedAccounts = withTaskGroup(of: (String, AccountsSnapshot?).self) { group in
            for host in profiles where hostIDs.contains(host.id) {
                group.addTask { [accountsRepository] in
                    (host.id, try? await accountsRepository.accounts(for: host.id))
                }
            }
            var values: [String: AccountsSnapshot] = [:]
            for await (hostID, snapshot) in group {
                if let snapshot { values[hostID] = snapshot }
            }
            return values
        }
        let range =
            ActivityUsageRange(
                rawValue: UserDefaults.standard.string(forKey: "agentstart:home-usage-range:v1")
                    ?? ""
            ) ?? .thirtyDays
        async let loadedStats = withTaskGroup(of: (String, ActivityStatsSummary?).self) { group in
            for host in profiles where hostIDs.contains(host.id) {
                group.addTask { [activityRepository] in
                    let summary = try? await activityRepository.activityStats(
                        for: host.id,
                        range: range,
                        refreshUsage: true
                    )
                    return (host.id, summary ?? nil)
                }
            }
            var values: [String: ActivityStatsSummary] = [:]
            for await (hostID, summary) in group {
                if let summary { values[hostID] = summary }
            }
            return values
        }
        let (nextWorkspaces, nextAccounts, nextStats) = await (
            loadedWorkspaces,
            loadedAccounts,
            loadedStats
        )
        guard !Task.isCancelled else { return }
        for (hostID, snapshot) in nextWorkspaces { workspaces[hostID] = snapshot }
        for (hostID, snapshot) in nextAccounts { accounts[hostID] = snapshot }
        for (hostID, summary) in nextStats { activityStats[hostID] = summary }
        publish()
        persistCurrentSnapshot()
    }

    private func publish() {
        phase = .loaded(
            HomeSnapshot(
                hosts: hosts.map {
                    HomeHostWorkspaceSnapshot(
                        host: $0,
                        connection: connections[$0.id],
                        workspaces: workspaces[$0.id] ?? [],
                        accounts: accounts[$0.id],
                        activityStats: activityStats[$0.id]
                    )
                },
                recentWorkspace: recentWorkspaceStore.load()
            )
        )
    }

    private func hydrateCacheIfNeeded() {
        guard !didHydrateCache else { return }
        didHydrateCache = true
        guard let cached = snapshotCache.load() else { return }
        let hostIDs = Set(hosts.map(\.id))
        workspaces = cached.workspaces.filter { hostIDs.contains($0.key) }
        accounts = cached.accounts.filter { hostIDs.contains($0.key) }
        activityStats = cached.activityStats.filter { hostIDs.contains($0.key) }
    }

    private func persistCurrentSnapshot() {
        snapshotCache.save(
            accounts: accounts,
            activityStats: activityStats,
            workspaces: workspaces
        )
        if case .loaded(let snapshot) = phase { widgetSnapshotWriter.write(snapshot) }
    }

    private func reconcileAccountSubscriptions() {
        for (hostID, task) in accountSubscriptionTasks where !connectedHostIDs.contains(hostID) {
            task.cancel()
            accountSubscriptionTasks.removeValue(forKey: hostID)
        }
        for hostID in connectedHostIDs where accountSubscriptionTasks[hostID] == nil {
            accountSubscriptionTasks[hostID] = Task { [weak self] in
                await self?.observeAccounts(hostID: hostID)
            }
        }
    }

    private func observeAccounts(hostID: String) async {
        while !Task.isCancelled, connections[hostID]?.phase == .connected {
            do {
                let updates = try await accountsRepository.accountUpdates(for: hostID)
                for try await snapshot in updates {
                    guard !Task.isCancelled else { return }
                    accounts[hostID] = snapshot
                    publish()
                    persistCurrentSnapshot()
                }
            } catch is CancellationError {
                return
            } catch {
            }
            // Why: a normal subscription end is not a connection transition.
            // Backing off both normal ends and failures prevents a desktop that
            // repeatedly closes the stream from causing a tight resubscribe loop.
            try? await Task.sleep(for: .seconds(1))
        }
        accountSubscriptionTasks.removeValue(forKey: hostID)
    }

    private func stopAccountSubscriptions() {
        for task in accountSubscriptionTasks.values { task.cancel() }
        accountSubscriptionTasks.removeAll()
    }
}

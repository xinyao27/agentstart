import Foundation
import Observation

nonisolated enum WorkspaceListPhase {
    case loading
    case loaded(WorkspaceSnapshot)
    case failed(LocalizedStringResource)
}

nonisolated struct WorkspaceActionFailure: Identifiable, Sendable {
    let id = UUID()
    let message: LocalizedStringResource
}

@Observable
@MainActor
final class WorkspaceListModel {
    private(set) var phase: WorkspaceListPhase = .loading
    private(set) var sections: [WorkspaceListSection] = []
    private(set) var openTabsByWorkspace: [String: [WorkspaceOpenTab]] = [:]
    private(set) var now = Date()
    private(set) var searchText = ""
    var mutatingWorkspaceIDs: Set<String> = []
    var actionFailure: WorkspaceActionFailure?
    private(set) var connectionSnapshot: RuntimeConnectionSnapshot?
    private(set) var hostCompatibility: WorkspaceHostCompatibility?

    @ObservationIgnored let hostID: String
    @ObservationIgnored let repository: any WorkspaceRepository
    @ObservationIgnored let connectionRuntime: any HostConnectionRuntime
    @ObservationIgnored let cache: WorkspaceListCache
    @ObservationIgnored var snapshot: WorkspaceSnapshot?
    @ObservationIgnored var viewSettings = WorkspaceListViewSettings.standard
    @ObservationIgnored var loadRevision = 0
    @ObservationIgnored var isLoadInFlight = false
    @ObservationIgnored var optimisticMutations: [String: WorkspaceListOptimisticMutation] = [:]
    @ObservationIgnored var optimisticBackups: [String: WorkspaceSummary] = [:]
    @ObservationIgnored var optimisticBackupIndexes: [String: Int] = [:]
    @ObservationIgnored var optimisticActiveWorkspaceID: String?
    @ObservationIgnored var optimisticActivationBackups: [String: WorkspaceSummary] = [:]
    @ObservationIgnored var optimisticActivationBackupIndexes: [String: Int] = [:]

    init(
        hostID: String,
        repository: any WorkspaceRepository,
        connectionRuntime: any HostConnectionRuntime,
        cache: WorkspaceListCache = WorkspaceListCache()
    ) {
        self.hostID = hostID
        self.repository = repository
        self.connectionRuntime = connectionRuntime
        self.cache = cache
        if let cached = cache.load(hostID: hostID) {
            let snapshot = WorkspaceSnapshot(
                workspaces: cached,
                repos: [],
                totalCount: cached.count,
                isTruncated: false
            )
            self.snapshot = snapshot
            phase = .loaded(snapshot)
            sections = buildWorkspaceListSections(
                snapshot: snapshot,
                searchText: "",
                viewSettings: .standard,
                now: now
            )
        }
    }

    func observe() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.pollWorkspaces() }
            group.addTask { await self.consumeOpenTabs() }
            group.addTask { await self.updateClock() }
            group.addTask { await self.consumeConnectionUpdates() }
            await group.waitForAll()
        }
    }

    func refresh() async {
        await refreshViewSettings()
        await load(replacingFailure: snapshot == nil)
    }

    func refreshViewSettings() async {
        guard canUseHost else { return }
        await loadViewSettings()
        rebuildSections()
    }

    func reconnectAndLoad() async {
        // Why: keep the last worktree snapshot interactive while the host client reconnects.
        // Replacing a loaded phase with a full-screen loader turns a brief desktop outage into
        // a blocked route.
        if snapshot == nil {
            phase = .loading
        }
        await repository.reconnect(hostID: hostID)
        await load(replacingFailure: snapshot == nil)
    }

    func setSearchText(_ value: String) {
        guard searchText != value else { return }
        searchText = value
        rebuildSections()
    }

    func toggleSection(_ id: String) {
        if viewSettings.collapsedGroups.contains(id) {
            viewSettings.collapsedGroups.remove(id)
        } else {
            viewSettings.collapsedGroups.insert(id)
        }
        rebuildSections()
        persistCollapsedGroups()
    }

    func isSectionCollapsed(_ id: String) -> Bool {
        viewSettings.collapsedGroups.contains(id)
    }

    func openTabs(for workspaceID: String) -> [WorkspaceOpenTab] {
        openTabsByWorkspace[workspaceID] ?? []
    }

    func isMutating(_ workspaceID: String) -> Bool {
        mutatingWorkspaceIDs.contains(workspaceID)
    }

    var isReadOnly: Bool {
        connectionSnapshot?.phase == .authenticationFailed
    }

    var canUseHost: Bool {
        connectionSnapshot?.phase == .connected
    }

    var showsReconnect: Bool {
        // Why: the authentication-failed banner already owns a "Retry" action;
        // offering the toolbar's Reconnect menu item too would duplicate it.
        connectionSnapshot?.shouldShowRetry == true && !isReadOnly
    }

    var activeRowID: String? {
        sections.lazy
            .flatMap(\.rows)
            .first(where: { $0.workspace.isActive })?
            .id
    }

    var shouldShowConnectionLoading: Bool {
        guard sections.isEmpty else { return false }
        switch connectionSnapshot?.phase {
        case .connecting, .reconnecting: return true
        case nil, .idle, .connected, .unreachable, .authenticationFailed: return false
        }
    }

    var shouldShowEmptyState: Bool {
        guard sections.isEmpty else { return false }
        return connectionSnapshot?.phase == .connected
    }

    var emptyStateTitle: LocalizedStringResource {
        if !searchText.isEmpty { return "No matching workspaces" }
        if hasActiveFilters { return "No workspaces match filters" }
        return "No workspaces"
    }

    private var hasActiveFilters: Bool {
        viewSettings.hideSleeping
            || viewSettings.hideDefaultBranch
            || !viewSettings.filterRepoIDs.isEmpty
    }

    var protocolBlock: WorkspaceHostCompatibility? {
        guard let hostCompatibility, hostCompatibility != .compatible else { return nil }
        return hostCompatibility
    }

    private func pollWorkspaces() async {
        while !Task.isCancelled {
            do {
                try await Task.sleep(for: .seconds(3))
            } catch {
                return
            }
            guard canUseHost else { continue }
            await load(replacingFailure: false)
        }
    }

    private func consumeOpenTabs() async {
        while !Task.isCancelled {
            guard canUseHost else {
                do {
                    try await Task.sleep(for: .seconds(2))
                } catch {
                    return
                }
                continue
            }
            do {
                let updates = try await repository.allWorkspaceTabUpdates(for: hostID)
                for try await update in updates {
                    guard !Task.isCancelled else { return }
                    openTabsByWorkspace = update
                }
            } catch is CancellationError {
                return
            } catch {
                do {
                    try await Task.sleep(for: .seconds(2))
                } catch {
                    return
                }
            }
        }
    }

    private func updateClock() async {
        while !Task.isCancelled {
            do {
                try await Task.sleep(for: .seconds(30))
            } catch {
                return
            }
            now = Date()
            rebuildSections()
        }
    }

    private func consumeConnectionUpdates() async {
        let updates = await connectionRuntime.connectionSnapshots(forHostIDs: [hostID])
        for await snapshots in updates {
            guard !Task.isCancelled else { return }
            let wasConnected = connectionSnapshot?.phase == .connected
            let next = snapshots[hostID]
            connectionSnapshot = next
            guard next?.phase == .connected else {
                hostCompatibility = nil
                continue
            }
            hostCompatibility = await repository.workspaceHostCompatibility(for: hostID)
            if !wasConnected {
                await refreshViewSettings()
                await load(replacingFailure: snapshot == nil)
            }
        }
    }

    func load(replacingFailure: Bool) async {
        guard canUseHost else { return }
        guard !isLoadInFlight else { return }
        isLoadInFlight = true
        loadRevision += 1
        let revision = loadRevision
        defer {
            if loadRevision == revision { isLoadInFlight = false }
        }
        do {
            let snapshot = try await repository.workspaces(for: hostID)
            guard canUseHost, loadRevision == revision, !Task.isCancelled else { return }
            let authoritativeSnapshot = snapshot
            // Why: lifecycle RPCs can acknowledge before the Desktop renderer has stopped its
            // PTYs or published the next worktree snapshot. Hold the optimistic overlay until
            // that authoritative state confirms the mutation, instead of flashing the old row
            // back in between.
            reconcileOptimisticMutations(with: authoritativeSnapshot)
            let effectiveSnapshot = applyOptimisticMutations(to: authoritativeSnapshot)
            if let currentSnapshot = self.snapshot,
                currentSnapshot.workspaces == effectiveSnapshot.workspaces,
                currentSnapshot.repos == effectiveSnapshot.repos,
                currentSnapshot.totalCount == effectiveSnapshot.totalCount,
                currentSnapshot.isTruncated == effectiveSnapshot.isTruncated
            {
                // Why: Desktop polls every few seconds. Avoid replacing the observed snapshot
                // and rebuilding every workspace row when the host published no new state.
                return
            }
            self.snapshot = effectiveSnapshot
            cache.save(effectiveSnapshot.workspaces, hostID: hostID)
            phase = .loaded(effectiveSnapshot)
            rebuildSections()
        } catch is CancellationError {
            return
        } catch WorkspaceRepositoryError.timeout {
            guard loadRevision == revision else { return }
            if replacingFailure {
                phase = .failed("The host did not respond. Check its connection and try again.")
            }
        } catch {
            guard loadRevision == revision else { return }
            if replacingFailure {
                phase = .failed("AgentStart could not load workspaces from this host.")
            }
        }
    }

    func rebuildSections() {
        guard let snapshot else {
            sections = []
            return
        }
        sections = buildWorkspaceListSections(
            snapshot: snapshot,
            searchText: searchText,
            viewSettings: viewSettings,
            now: now
        )
    }

    func setOptimisticSnapshot(_ snapshot: WorkspaceSnapshot) {
        self.snapshot = snapshot
        phase = .loaded(snapshot)
        rebuildSections()
    }

    private func loadViewSettings() async {
        guard canUseHost else { return }
        guard let loaded = try? await repository.workspaceListViewSettings(for: hostID) else {
            return
        }
        viewSettings = loaded
    }

    private func persistCollapsedGroups() {
        let groups = viewSettings.collapsedGroups
        Task { try? await repository.setWorkspaceCollapsedGroups(hostID: hostID, groups: groups) }
    }

}

import Foundation
import Observation

nonisolated enum TerminalWorkspacePhase: Sendable {
    case loading
    case loaded
    case failed(LocalizedStringResource)
}

nonisolated enum TerminalWorkspaceOperation: Equatable, Sendable {
    case closing(String)
    case creating
    case resuming
}

@Observable
@MainActor
final class TerminalWorkspaceModel {
    var phase = TerminalWorkspacePhase.loading
    var tabs: [TerminalWorkspaceTab] = []
    var activeTabID: String?
    var operation: TerminalWorkspaceOperation?
    var mutationError: LocalizedStringResource?
    var visitedTabIDs: Set<String> = []
    var displayName: String
    var isConnected = false

    @ObservationIgnored let hostID: String
    @ObservationIgnored let worktreeID: String
    @ObservationIgnored let repoID: String
    @ObservationIgnored let initialTabID: String?
    @ObservationIgnored let repository: any TerminalWorkspaceRepository
    @ObservationIgnored let connectionRuntime: any HostConnectionRuntime
    @ObservationIgnored let quickCommandRepository: any TerminalQuickCommandRepository
    @ObservationIgnored var snapshotGate = TerminalWorkspaceSnapshotGate()
    @ObservationIgnored var pendingActiveTabID: String?
    @ObservationIgnored var activatingTabID: String?
    @ObservationIgnored var activationGeneration = 0
    @ObservationIgnored var closedTabTombstones: [String: Date] = [:]
    @ObservationIgnored var hasReceivedInitialSnapshot = false
    // Why: a pending terminal that can never resolve (host-side attach failure, dropped
    // reveal/mount RPC) must not spin forever — surface an error after a bounded wait instead
    // of leaving "Starting terminal…" up indefinitely. Tracked per tab id so a fresh,
    // fast-starting pending tab always gets its own full timeout window.
    @ObservationIgnored var pendingTerminalSince: [String: Date] = [:]
    static let pendingTerminalTimeout: TimeInterval = 20

    init(
        hostID: String,
        worktreeID: String,
        repoID: String,
        displayName: String,
        initialTabID: String? = nil,
        repository: any TerminalWorkspaceRepository,
        connectionRuntime: any HostConnectionRuntime,
        quickCommandRepository: any TerminalQuickCommandRepository
    ) {
        self.hostID = hostID
        self.worktreeID = worktreeID
        self.repoID = repoID
        self.initialTabID = initialTabID
        self.displayName = displayName
        self.repository = repository
        self.connectionRuntime = connectionRuntime
        self.quickCommandRepository = quickCommandRepository
    }

    var activeTab: TerminalWorkspaceTab? {
        tabs.first { $0.id == activeTabID }
    }

    var retainedTerminalTabs: [TerminalWorkspaceTab] {
        tabs.filter { tab in
            visitedTabIDs.contains(tab.id) && tab.terminalTarget != nil
        }
    }

    var retainedNonterminalTabs: [TerminalWorkspaceTab] {
        tabs.filter { tab in
            visitedTabIDs.contains(tab.id) && tab.terminalTarget == nil
        }
    }

    func isPendingTerminalTimedOut(_ tabID: String) -> Bool {
        guard let since = pendingTerminalSince[tabID] else { return false }
        return Date().timeIntervalSince(since) >= Self.pendingTerminalTimeout
    }
}

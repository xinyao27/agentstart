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
    // Why: this is the session's notice, not a terminal pane's. Terminal panes are hidden when the
    // user switches tabs, so a notice owned by one would disappear with it.
    var actionNotice: TerminalActionNotice?
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
    // Why: a workspace mutation is a round trip to the host, and `operation` alone could only dim
    // controls — it gave the user no way to see that work was happening or to stop it.
    @ObservationIgnored var operationTask: Task<Void, Never>?
    // Why: a mutation the session did not start (the quick-command sheet owns its own task) still
    // reports progress, but offering a Cancel that cannot stop it would be a lie.
    private(set) var isOperationCancellable = false
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

    func publish(_ notice: TerminalActionNotice) {
        actionNotice = notice
        // Why: only a success may expire. A failure is the user's only record that an action did
        // not happen, so it waits for an explicit dismiss instead of timing out unread.
        guard notice.kind == .success else { return }
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(1_500))
            guard self?.actionNotice?.id == notice.id else { return }
            self?.actionNotice = nil
        }
    }

    func dismissActionNotice() {
        actionNotice = nil
    }

    /// Runs a workspace mutation as the session's tracked operation, so the progress surface can
    /// both show it and cancel it. The mutation itself keeps its own `operation` bookkeeping.
    func runOperation(_ body: @escaping () async -> Void) {
        operationTask?.cancel()
        operationTask = Task { [weak self] in
            await body()
            guard let self else { return }
            self.operationTask = nil
            self.isOperationCancellable = false
        }
        isOperationCancellable = true
    }

    func cancelOperation() {
        guard isOperationCancellable else { return }
        operationTask?.cancel()
        operationTask = nil
        isOperationCancellable = false
        operation = nil
    }
}

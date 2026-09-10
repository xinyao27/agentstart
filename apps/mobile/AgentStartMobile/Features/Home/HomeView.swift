import SwiftUI

struct HomeView: View {
    @State private var model: HomeModel
    @State private var creationTarget: HomeWorkspaceCreationTarget?
    @State private var removalTarget: HostProfile?
    @State private var now = Date()
    @State private var hasAppeared = false
    private let refreshRevision: Int
    private let workspaceCreationRepository: any WorkspaceCreationRepository
    private let showHost: (HostProfile) -> Void
    private let showWorkspace: (HostProfile, WorkspaceSummary) -> Void
    private let showPairing: () -> Void
    private let showActivityInsights: () -> Void
    private let showSettings: () -> Void
    private let showAccounts: (HostProfile) -> Void
    private let editHost: (HostProfile) -> Void
    private let hostsChanged: () -> Void

    init(
        hostRepository: any HostRepository,
        connectionRuntime: any HostConnectionRuntime,
        workspaceRepository: any WorkspaceRepository,
        accountsRepository: any AccountsRepository,
        activityRepository: any ActivityStatsRepository,
        widgetSnapshotWriter: WidgetSnapshotWriter,
        recentWorkspaceStore: RecentWorkspaceStore,
        snapshotCache: HomeSnapshotCache,
        workspaceCreationRepository: any WorkspaceCreationRepository,
        refreshRevision: Int,
        showHost: @escaping (HostProfile) -> Void,
        showWorkspace: @escaping (HostProfile, WorkspaceSummary) -> Void,
        showPairing: @escaping () -> Void,
        showActivityInsights: @escaping () -> Void,
        showSettings: @escaping () -> Void,
        showAccounts: @escaping (HostProfile) -> Void,
        editHost: @escaping (HostProfile) -> Void,
        hostsChanged: @escaping () -> Void
    ) {
        _model = State(
            initialValue: HomeModel(
                hostRepository: hostRepository,
                connectionRuntime: connectionRuntime,
                workspaceRepository: workspaceRepository,
                accountsRepository: accountsRepository,
                activityRepository: activityRepository,
                widgetSnapshotWriter: widgetSnapshotWriter,
                recentWorkspaceStore: recentWorkspaceStore,
                snapshotCache: snapshotCache
            )
        )
        self.refreshRevision = refreshRevision
        self.workspaceCreationRepository = workspaceCreationRepository
        self.showHost = showHost
        self.showWorkspace = showWorkspace
        self.showPairing = showPairing
        self.showActivityInsights = showActivityInsights
        self.showSettings = showSettings
        self.showAccounts = showAccounts
        self.editHost = editHost
        self.hostsChanged = hostsChanged
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                ProgressView()
            case .loaded(let snapshot):
                if snapshot.hosts.isEmpty {
                    HomeOnboardingView(showPairing: showPairing)
                } else {
                    HomeDashboardView(
                        snapshot: snapshot,
                        now: now,
                        creationTarget: $creationTarget,
                        showHost: showHost,
                        showWorkspace: showWorkspace,
                        showPairing: showPairing,
                        showAccounts: showAccounts,
                        editHost: editHost,
                        reconnect: { host in Task { await model.reconnect(hostID: host.id) } },
                        disconnect: { host in Task { await model.disconnect(hostID: host.id) } },
                        requestRemove: { removalTarget = $0 },
                        refresh: { await model.refresh() }
                    )
                }
            case .failed(let message):
                AppUnavailableState(
                    "Home unavailable",
                    iconID: .warning,
                    description: Text(message)
                ) {
                    Button("Try again") { Task { await model.refresh() } }
                        .buttonStyle(.glass)
                        .appButtonContext(.regular)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background { AppBackground() }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Why: activity insights sits at the leading edge and settings at the trailing
            // edge — two placements, not two buttons grouped on one.
            // Why: GlassHeaderButton wraps its own `.glassEffect` circle for sheet/docked-panel
            // headers that sit outside a NavigationStack toolbar. Home's actions live in the
            // real navigation bar, so — like every other root toolbar in this app (Workspace
            // List, Terminal session, Activity insights) — they use a plain Button around
            // AgentStartToolbarIcon and let SwiftUI supply the Liquid Glass surface itself. Wrapping
            // a second glass circle inside the system's own toolbar glass made both items
            // collapse to the trailing edge instead of splitting leading/trailing.
            ToolbarItem(placement: .topBarLeading) {
                Button(action: showActivityInsights) {
                    AgentStartToolbarIcon(.insights)
                }
                .accessibilityLabel("Open activity insights")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: showSettings) {
                    AgentStartToolbarIcon(.settings)
                }
                .accessibilityLabel("Settings")
            }
        }
        .task(id: refreshRevision) {
            await model.observe()
        }
        // Why: re-fetch worktree, account, and stats data on every screen focus, not just on
        // cold start or a connection-state change, so counts stay current after creating a
        // workspace or returning from a session. `observe()`'s stream only reacts to
        // connection transitions, so the focus refetch has to happen here.
        .onAppear {
            guard hasAppeared else {
                hasAppeared = true
                return
            }
            Task { await model.refresh() }
        }
        .sheet(item: $creationTarget) { target in
            WorkspaceCreationSheet(
                host: target.host,
                existingPaths: target.existingPaths,
                repository: workspaceCreationRepository,
                onCreated: { workspace in
                    showWorkspace(target.host, workspace)
                }
            )
        }
        .confirmationDialog(
            "Remove \(removalTarget?.name ?? "host")?",
            isPresented: Binding(
                get: { removalTarget != nil },
                set: { if !$0 { removalTarget = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                guard let host = removalTarget else { return }
                removalTarget = nil
                Task {
                    let removed = await model.remove(host)
                    if removed {
                        hostsChanged()
                    } else {
                        removalTarget = host
                    }
                }
            }
            Button("Cancel", role: .cancel) { removalTarget = nil }
        } message: {
            Text(
                "This removes the paired host and its credentials from this iPhone. You can re-pair later."
            )
        }
        .alert(
            "Could not remove host",
            isPresented: Binding(
                get: { model.actionFailure != nil },
                set: { isPresented in
                    if !isPresented { model.clearActionFailure() }
                }
            )
        ) {
            Button("OK") { model.clearActionFailure() }
        } message: {
            if let message = model.actionFailure { Text(message) }
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                now = Date()
            }
        }
    }

}

nonisolated struct HomeWorkspaceCreationTarget: Identifiable, Sendable {
    let host: HostProfile
    let existingPaths: [String]
    var id: String { host.id }
}

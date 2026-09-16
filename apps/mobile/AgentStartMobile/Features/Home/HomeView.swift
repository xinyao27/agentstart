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
    private let showAccounts: (HostProfile) -> Void
    private let showBrowser: (HostProfile) -> Void
    private let editHost: (HostProfile) -> Void
    private let hostsChanged: () -> Void

    init(
        hostRepository: any HostRepository,
        connectionRuntime: any HostConnectionRuntime,
        workspaceRepository: any WorkspaceRepository,
        accountsRepository: any AccountsRepository,
        activityRepository: any ActivityStatsRepository,
        browserTabsRepository: any BrowserTabsRepository,
        widgetSnapshotWriter: WidgetSnapshotWriter,
        recentWorkspaceStore: RecentWorkspaceStore,
        snapshotCache: HomeSnapshotCache,
        workspaceCreationRepository: any WorkspaceCreationRepository,
        refreshRevision: Int,
        showHost: @escaping (HostProfile) -> Void,
        showWorkspace: @escaping (HostProfile, WorkspaceSummary) -> Void,
        showPairing: @escaping () -> Void,
        showActivityInsights: @escaping () -> Void,
        showAccounts: @escaping (HostProfile) -> Void,
        showBrowser: @escaping (HostProfile) -> Void,
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
                browserTabsRepository: browserTabsRepository,
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
        self.showAccounts = showAccounts
        self.showBrowser = showBrowser
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
                        showHost: showHost,
                        showWorkspace: showWorkspace,
                        showAccounts: showAccounts,
                        showBrowser: showBrowser,
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
            // Why: Home's primary action is a toolbar item rather than a floating pill. The pill
            // covered the usage card's last row and the toolbar's own Liquid Glass already gives
            // the action its prominence.
            if let dashboardSnapshot {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: { runPrimaryAction(dashboardSnapshot) }) {
                        AgentStartToolbarIcon(
                            dashboardSnapshot.primaryConnectedSnapshot == nil ? .monitor : .add
                        )
                    }
                    // Why: the primary action needs a keyboard equivalent on an iPad with a
                    // Magic Keyboard; pairing is a modal flow and takes none.
                    .keyboardShortcut(
                        dashboardSnapshot.primaryConnectedSnapshot == nil
                            ? nil : KeyboardShortcut("n", modifiers: .command)
                    )
                    .accessibilityLabel(
                        dashboardSnapshot.primaryConnectedSnapshot == nil
                            ? "Pair daemon" : "New workspace"
                    )
                }
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
                Task { await removeHost(host) }
            }
            Button("Cancel", role: .cancel) { removalTarget = nil }
        } message: {
            Text(
                "This removes the paired host and its credentials from this iPhone. You can re-pair later."
            )
        }
        // Why: a failed host removal is transient; it floats over Home instead of taking an
        // alert. The failed host is still on screen, so retrying is one tap away.
        .actionBanner(
            model.actionFailure,
            retry: removalTarget.map { host in { Task { await removeHost(host) } } },
            dismiss: { model.clearActionFailure() }
        )
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                now = Date()
            }
        }
    }

    // Why: the toolbar's primary action belongs to the paired-host dashboard only; the empty
    // onboarding state carries its own Pair Daemon call to action.
    private var dashboardSnapshot: HomeSnapshot? {
        guard case .loaded(let snapshot) = model.phase, !snapshot.hosts.isEmpty else {
            return nil
        }
        return snapshot
    }

    private func runPrimaryAction(_ snapshot: HomeSnapshot) {
        guard let target = snapshot.primaryConnectedSnapshot else {
            showPairing()
            return
        }
        creationTarget = HomeWorkspaceCreationTarget(
            host: target.host,
            existingPaths: target.workspaces.map(\.path)
        )
    }

    private func removeHost(_ host: HostProfile) async {
        let removed = await model.remove(host)
        if removed {
            hostsChanged()
        } else {
            removalTarget = host
        }
    }
}

nonisolated struct HomeWorkspaceCreationTarget: Identifiable, Sendable {
    let host: HostProfile
    let existingPaths: [String]
    var id: String { host.id }
}

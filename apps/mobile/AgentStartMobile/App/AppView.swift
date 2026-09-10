import SwiftUI

struct AppView: View {
    @Bindable var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var splitVisibility: NavigationSplitViewVisibility = .all
    @State private var hostIDs: [String] = []
    @State private var hostConnections: [String: RuntimeConnectionSnapshot] = [:]
    @State private var dismissedConnectionHostID: String?

    var body: some View {
        GeometryReader { proxy in
            let layout = AgentStartLayoutMetrics(size: proxy.size)
            Group {
                // Why: replacing NavigationStack with NavigationSplitView at the compact/wide
                // threshold destroys stateful Session destinations (including SwiftTerm). Keep
                // one navigation root for the whole Workspace route so rotation only changes
                // the column presentation and does not reopen the transport session.
                if layout.isWideLayout, let root = splitRoot {
                    splitNavigation(root)
                } else {
                    compactNavigation
                }
            }
            .environment(\.agentstartLayoutMetrics, layout)
        }
        // Why: transient connection notices must never resize navigation or working content.
        // Overlay them above the current screen so every connection state preserves its layout.
        .overlay(alignment: .top) {
            connectionNotice
        }
        .task(id: model.homeRevision) {
            await model.dependencies.notificationCoordinator.start(
                route: model.handleNotificationRoute
            )
            await model.prepareNotificationOptIn()
        }
        .fullScreenCover(isPresented: $model.isNotificationOptInPresented) {
            NotificationOptInView(onFinished: model.finishNotificationOptIn)
        }
        .fullScreenCover(isPresented: $model.isActivityInsightsPresented) {
            NavigationStack {
                ActivityInsightsView(
                    hosts: model.dependencies.hostRepository,
                    connectionRuntime: model.dependencies.hostConnectionRuntime,
                    repository: model.dependencies.activityRepository,
                    snapshotCache: model.dependencies.homeSnapshotCache
                )
            }
        }
        .task(id: model.hostRevision) {
            await observeHostConnections()
        }
        .onChange(of: connectionNoticeIdentity) { _, identity in
            // Why: once the host reaches idle/connected, the current connection incident has
            // ended. Keep a dismissed notice hidden across reconnecting/unreachable transitions
            // so a stalled host does not keep reclaiming the user's working area.
            if identity == nil {
                dismissedConnectionHostID = nil
            }
        }
        .onChange(of: scenePhase) { _, nextPhase in
            guard nextPhase == .active else { return }
            Task { await model.dependencies.runtimeClient.applicationDidBecomeActive() }
        }
    }

    @ViewBuilder
    private var connectionNotice: some View {
        if let snapshot = connectionNoticeSnapshot,
            snapshot.phase != .idle,
            snapshot.phase != .connected,
            dismissedConnectionHostID != snapshot.hostID
        {
            HostConnectionNotice(
                snapshot: snapshot,
                runtime: model.dependencies.hostConnectionRuntime,
                dismiss: { dismissedConnectionHostID = snapshot.hostID }
            )
            .padding(.horizontal, Theme.Spacing.medium)
            .padding(.top, Theme.Spacing.small)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private var activeHostID: String? {
        model.routes.last?.hostID
    }

    private func observeHostConnections() async {
        hostIDs = []
        hostConnections = [:]
        guard let hosts = try? await model.dependencies.hostRepository.hosts() else { return }
        let ids = hosts.map(\.id)
        hostIDs = ids
        guard !ids.isEmpty else { return }
        let updates = await model.dependencies.hostConnectionRuntime
            .connectionSnapshots(forHostIDs: ids)
        for await snapshots in updates {
            guard !Task.isCancelled else { return }
            hostConnections = snapshots
        }
    }

    private var connectionNoticeSnapshot: RuntimeConnectionSnapshot? {
        if let activeHostID,
            let active = hostConnections[activeHostID],
            active.phase != .idle,
            active.phase != .connected
        {
            return active
        }
        return hostIDs.lazy.compactMap { hostConnections[$0] }.first {
            $0.phase != .idle && $0.phase != .connected
        }
    }

    private var connectionNoticeIdentity: String? {
        connectionNoticeSnapshot?.hostID
    }

    private var compactNavigation: some View {
        NavigationStack(path: $model.routes) {
            home
                .navigationDestination(for: AppRoute.self) { route in
                    AppRouteDestinationView(route: route, model: model)
                }
        }
    }

    private func splitNavigation(_ root: HostSplitRoot) -> some View {
        NavigationSplitView(columnVisibility: $splitVisibility) {
            AppWorkspaceListDestinationView(
                host: root.host,
                presentation: root.presentation,
                model: model,
                leaveHost: { model.routes.removeAll() },
                hideSidebar: { splitVisibility = .detailOnly },
                replaceDetail: { route in model.routes = [root.route, route] }
            )
            .navigationSplitViewColumnWidth(min: 280, ideal: 340, max: 560)
        } detail: {
            NavigationStack(path: splitDetailBinding(root)) {
                AppUnavailableState(
                    "Select a workspace",
                    iconID: .arrowLeft,
                    description: Text(
                        "Choose a workspace from the sidebar to open its session."
                    )
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background { AppBackground() }
                .navigationDestination(for: AppRoute.self) { route in
                    AppRouteDestinationView(route: route, model: model)
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .onChange(of: model.routes) { _, routes in
            guard case .workspaces = routes.first else {
                splitVisibility = .all
                return
            }
            if routes.count == 1 {
                splitVisibility = .all
            }
        }
    }

    private var home: some View {
        HomeView(
            hostRepository: model.dependencies.hostRepository,
            connectionRuntime: model.dependencies.hostConnectionRuntime,
            workspaceRepository: model.dependencies.workspaceRepository,
            accountsRepository: model.dependencies.accountsRepository,
            activityRepository: model.dependencies.activityRepository,
            widgetSnapshotWriter: model.dependencies.widgetSnapshotWriter,
            recentWorkspaceStore: model.dependencies.recentWorkspaceStore,
            snapshotCache: model.dependencies.homeSnapshotCache,
            workspaceCreationRepository: model.dependencies.workspaceCreationRepository,
            refreshRevision: model.homeRevision,
            showHost: model.showWorkspaces,
            showWorkspace: { host, workspace in
                model.showWorkspaceSession(host: host, workspace: workspace)
            },
            showPairing: model.showPairing,
            showActivityInsights: model.showActivityInsights,
            showSettings: model.showSettings,
            showAccounts: model.showAccounts,
            editHost: model.showEditHost,
            hostsChanged: model.hostsDidChange
        )
    }

    private var splitRoot: HostSplitRoot? {
        guard let first = model.routes.first,
            case .workspaces(let host, let presentation) = first
        else { return nil }
        return HostSplitRoot(host: host, presentation: presentation)
    }

    private func splitDetailBinding(_ root: HostSplitRoot) -> Binding<[AppRoute]> {
        Binding(
            get: { Array(model.routes.dropFirst()) },
            set: { model.routes = [root.route] + $0 }
        )
    }
}

private struct HostSplitRoot {
    let host: HostProfile
    let presentation: WorkspaceListPresentation

    var route: AppRoute { .workspaces(host, presentation) }
}

#Preview {
    AppView(model: AppModel(dependencies: .live()))
}

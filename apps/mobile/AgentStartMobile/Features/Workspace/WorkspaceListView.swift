import SwiftUI

struct WorkspaceListView: View {
    let host: HostProfile
    @Environment(\.dismiss) private var dismiss
    @State private var model: WorkspaceListModel
    @State private var isSearchPresented = false
    @State private var isCreationPresented = false
    @State private var actionTarget: WorkspaceSummary?
    @State private var isAgentHistoryAvailable = false
    @State private var isRemoveHostPresented = false
    @State private var hostRemovalFailure: LocalizedStringResource?
    private let creationRepository: any WorkspaceCreationRepository
    private let agentHistoryRepository: any AgentHistoryRepository
    private let hostRepository: any HostRepository
    private let connectionRuntime: any HostConnectionRuntime
    private let showAccounts: () -> Void
    private let showSourceControl: (WorkspaceSummary) -> Void
    private let showAgentHistory: (WorkspaceSummary) -> Void
    private let showPairing: () -> Void
    private let hostsChanged: () -> Void
    private let leaveHost: (() -> Void)?
    private let hideSidebar: (() -> Void)?
    private let selectWorkspace: (WorkspaceSummary, WorkspaceOpenTab?) -> Void

    init(
        host: HostProfile,
        repository: any WorkspaceRepository,
        creationRepository: any WorkspaceCreationRepository,
        agentHistoryRepository: any AgentHistoryRepository,
        hostRepository: any HostRepository,
        connectionRuntime: any HostConnectionRuntime,
        presentation: WorkspaceListPresentation = .standard,
        showAccounts: @escaping () -> Void,
        showSourceControl: @escaping (WorkspaceSummary) -> Void,
        showAgentHistory: @escaping (WorkspaceSummary) -> Void,
        showPairing: @escaping () -> Void,
        hostsChanged: @escaping () -> Void = {},
        leaveHost: (() -> Void)? = nil,
        hideSidebar: (() -> Void)? = nil,
        selectWorkspace: @escaping (WorkspaceSummary, WorkspaceOpenTab?) -> Void
    ) {
        self.host = host
        self.creationRepository = creationRepository
        self.agentHistoryRepository = agentHistoryRepository
        self.hostRepository = hostRepository
        self.connectionRuntime = connectionRuntime
        self.showAccounts = showAccounts
        self.showSourceControl = showSourceControl
        self.showAgentHistory = showAgentHistory
        self.showPairing = showPairing
        self.hostsChanged = hostsChanged
        self.leaveHost = leaveHost
        self.hideSidebar = hideSidebar
        self.selectWorkspace = selectWorkspace
        _isCreationPresented = State(initialValue: presentation == .createWorkspace)
        _model = State(
            initialValue: WorkspaceListModel(
                hostID: host.id,
                repository: repository,
                connectionRuntime: connectionRuntime
            )
        )
    }

    var body: some View {
        Group {
            if let protocolBlock = model.protocolBlock {
                WorkspaceProtocolBlockView(
                    compatibility: protocolBlock,
                    backToHosts: { leaveHost?() ?? dismiss() }
                )
            } else {
                switch model.phase {
                case .loading:
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .loaded(let snapshot):
                    WorkspaceListContentView(
                        model: model,
                        snapshot: snapshot,
                        showPairing: showPairing,
                        showActions: { actionTarget = $0 },
                        requestRemoveHost: { isRemoveHostPresented = true },
                        selectWorkspace: selectWorkspace
                    )
                case .failed(let message):
                    AppUnavailableState(
                        "Workspaces unavailable",
                        iconID: .wifiSlash,
                        description: Text(message)
                    ) {
                        Button("Try again") {
                            Task { await model.reconnectAndLoad() }
                        }
                        .buttonStyle(.glass)
                        .appButtonContext(.regular)
                    }
                }
            }
        }
        .background { AppBackground() }
        .navigationTitle(Text(verbatim: host.name))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.Colors.background, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .toolbar {
            WorkspaceListToolbar(
                model: model,
                isSearchPresented: $isSearchPresented,
                isCreationPresented: $isCreationPresented,
                leaveHost: leaveHost,
                hideSidebar: hideSidebar,
                showAccounts: showAccounts
            )
        }
        .sheet(isPresented: $isSearchPresented) {
            WorkspaceSearchSheet(
                searchText: Binding(
                    get: { model.searchText },
                    set: { value in model.setSearchText(value) }
                )
            )
        }
        .sheet(isPresented: $isCreationPresented) {
            WorkspaceCreationSheet(
                host: host,
                existingPaths: existingWorkspacePaths,
                existingBranchesByRepo: existingWorkspaceBranchesByRepo,
                repository: creationRepository,
                onCreated: { workspace in
                    Task { await model.refresh() }
                    selectWorkspace(workspace, nil)
                }
            )
        }
        .sheet(item: $actionTarget) { workspace in
            WorkspaceActionsSheet(
                workspace: model.workspace(for: workspace.id) ?? workspace,
                isBusy: model.isMutating(workspace.id),
                showsAgentHistory: isAgentHistoryAvailable,
                showSourceControl: {
                    actionTarget = nil
                    showSourceControl(workspace)
                },
                showAgentHistory: {
                    actionTarget = nil
                    showAgentHistory(workspace)
                },
                sleep: {
                    actionTarget = nil
                    Task { await model.sleep(model.workspace(for: workspace.id) ?? workspace) }
                },
                togglePin: {
                    actionTarget = nil
                    Task {
                        await model.togglePin(model.workspace(for: workspace.id) ?? workspace)
                    }
                },
                remove: {
                    actionTarget = nil
                    Task { await model.remove(model.workspace(for: workspace.id) ?? workspace) }
                }
            )
        }
        .alert(
            "Workspace action failed",
            isPresented: Binding(
                get: { model.actionFailure != nil },
                set: { isPresented in
                    if !isPresented { model.clearActionFailure() }
                }
            )
        ) {
            Button("OK") { model.clearActionFailure() }
        } message: {
            if let failure = model.actionFailure {
                Text(failure.message)
            }
        }
        .confirmationDialog(
            "Remove Host",
            isPresented: $isRemoveHostPresented,
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                Task { await removeHost() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Remove \(host.name)? You can re-pair later.")
        }
        .alert(
            "Could not remove host",
            isPresented: Binding(
                get: { hostRemovalFailure != nil },
                set: { isPresented in
                    if !isPresented { hostRemovalFailure = nil }
                }
            )
        ) {
            Button("OK") { hostRemovalFailure = nil }
        } message: {
            if let hostRemovalFailure { Text(hostRemovalFailure) }
        }
        .task {
            await model.observe()
        }
        .onAppear {
            Task { await model.refreshViewSettings() }
        }
        .task(id: model.canUseHost) {
            guard model.canUseHost else {
                isAgentHistoryAvailable = false
                return
            }
            isAgentHistoryAvailable =
                (try? await agentHistoryRepository.supportsAgentHistory(for: host.id)) == true
        }
    }

    private var existingWorkspacePaths: [String] {
        guard case .loaded(let snapshot) = model.phase else { return [] }
        return snapshot.workspaces.map(\.path)
    }

    private var existingWorkspaceBranchesByRepo: [String: [String]] {
        guard case .loaded(let snapshot) = model.phase else { return [:] }
        return Dictionary(grouping: snapshot.workspaces, by: \.repoID)
            .mapValues { workspaces in workspaces.map(\.branch) }
    }

    private func removeHost() async {
        do {
            try await hostRepository.removeHost(hostID: host.id)
            await connectionRuntime.disconnect(hostID: host.id)
            hostsChanged()
            leaveHost?() ?? dismiss()
        } catch {
            hostRemovalFailure = "AgentStart could not remove this host. Please try again."
        }
    }
}

nonisolated enum WorkspaceListPresentation: Hashable, Sendable {
    case standard
    case createWorkspace
}

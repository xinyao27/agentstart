import SwiftUI

struct SourceControlView: View {
    let workspace: WorkspaceSummary
    let openReview: (SourceFileEntry) -> Void
    let openReviewInSession: ((SourceFileEntry) -> Void)?
    @State private var model: SourceControlModel
    @State private var discardTarget: SourceFileEntry?
    @State private var activeTab = SourceControlHubTab.changes
    @State private var historyRefreshRevision = 0
    @State private var isShowingBranchPicker = false
    @State private var isShowingActions = false
    @State private var branchDiffTarget: SourceBranchFile?
    @Environment(\.openURL) private var openURL
    private let hostID: String
    private let worktreeID: String
    private let repository: any SourceControlRepository
    private let hostedReviewRepository: (any HostedReviewRepository)?
    private let connectionRuntime: any HostConnectionRuntime
    private let requestedTab: SourceControlHubTab?
    private let closeDock: (() -> Void)?

    init(
        host: HostProfile,
        workspace: WorkspaceSummary,
        repository: any SourceControlRepository,
        hostedReviewRepository: (any HostedReviewRepository)? = nil,
        connectionRuntime: any HostConnectionRuntime,
        initialTab: SourceControlHubTab = .changes,
        requestedTab: SourceControlHubTab? = nil,
        closeDock: (() -> Void)? = nil,
        openReview: @escaping (SourceFileEntry) -> Void,
        openReviewInSession: ((SourceFileEntry) -> Void)? = nil
    ) {
        self.workspace = workspace
        self.openReview = openReview
        self.openReviewInSession = openReviewInSession
        hostID = host.id
        worktreeID = workspace.id
        self.repository = repository
        self.hostedReviewRepository = hostedReviewRepository
        self.connectionRuntime = connectionRuntime
        self.requestedTab = requestedTab
        self.closeDock = closeDock
        _activeTab = State(initialValue: initialTab)
        _model = State(
            initialValue: SourceControlModel(
                hostID: host.id,
                workspace: workspace,
                repository: repository,
                hostedReviewRepository: hostedReviewRepository,
                connectionRuntime: connectionRuntime
            )
        )
    }

    var body: some View {
        presentedContent
            .task { await model.observe() }
            .onChange(of: requestedTab) { _, tab in
                if let tab { activeTab = tab }
            }
            .alert(
                "Source control action failed",
                isPresented: Binding(
                    get: { model.errorMessage != nil },
                    set: { if !$0 { model.clearError() } }
                )
            ) {
                Button("OK", action: model.clearError)
            } message: {
                if let message = model.errorMessage { Text(verbatim: message) }
            }
            .alert(
                "Discard changes?",
                isPresented: Binding(
                    get: { discardTarget != nil },
                    set: { if !$0 { discardTarget = nil } }
                ),
                presenting: discardTarget
            ) { entry in
                Button("Cancel", role: .cancel) { discardTarget = nil }
                Button("Discard", role: .destructive) {
                    discardTarget = nil
                    Task { await model.discard(entry) }
                }
            } message: { entry in
                Text("This permanently discards changes in \(entry.path).")
            }
            .alert(
                "\(model.createdReviewProvider?.reviewTitle ?? "Pull Request") Created",
                isPresented: Binding(
                    get: { model.createdReviewURL != nil },
                    set: { if !$0 { model.clearCreatedReview() } }
                )
            ) {
                if let url = model.createdReviewURL { Button("Open") { openURL(url) } }
                Button("Cancel", role: .cancel, action: model.clearCreatedReview)
            } message: {
                if let warning = model.createdReviewWarning {
                    Text("Open it in your browser?\n\n\(warning)")
                } else {
                    Text("Open it in your browser?")
                }
            }
            .sheet(isPresented: $isShowingBranchPicker) {
                SourceBranchPicker(model: model)
                    // Why: matches the other NavigationStack list sheets (Source Control
                    // actions, Quick Commands) — no drag handle, sized to page.
                    .appSheetPresentation(.page)
            }
            .sheet(item: $branchDiffTarget) { entry in
                if let comparison = model.branchComparison {
                    SourceBranchDiffView(
                        hostID: hostID,
                        worktreeID: worktreeID,
                        entry: entry,
                        comparison: comparison,
                        repository: repository
                    )
                }
            }
            .sheet(isPresented: $isShowingActions) {
                SourceControlActionSheet(
                    model: model,
                    branchLabel: model.snapshot?.branchLabel ?? "No branch",
                    switchBranch: openBranchPicker,
                    openCommits: { activeTab = .history }
                )
            }
    }

    @ViewBuilder
    private var presentedContent: some View {
        if let closeDock {
            VStack(spacing: 0) {
                DockedPanelHeader(
                    title: "Source Control",
                    subtitle: workspaceLabel,
                    closeLabel: "Close source control",
                    close: closeDock,
                    isRefreshing: model.isRefreshing,
                    refresh: refresh,
                    moreLabel: "More source control actions",
                    more: { isShowingActions = true }
                )
                sourceBody
            }
        } else {
            sourceBody
                // Why: the branch card below already shows the full workspace/branch identity
                // with room to breathe; repeating it in the nav title only forced a truncated,
                // redundant "Source Control · xinyao27/we…" header.
                .navigationTitle(Text("Source Control"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { sourceToolbar }
        }
    }

    private var sourceBody: some View {
        Group {
            switch model.phase {
            case .loading:
                ProgressView()
                    .controlSize(.small)
            case .waiting:
                AppUnavailableState(
                    "Source control waiting",
                    iconID: .wifiSlash,
                    description: Text("Waiting for daemon…")
                ) {
                    Button("Try again", iconID: .refresh) {
                        Task { await model.retry() }
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                }
            case .failed(let message):
                AppUnavailableState(
                    "Source control unavailable",
                    iconID: .gitBranch,
                    description: Text(verbatim: message)
                ) {
                    Button("Try again", iconID: .refresh) { Task { await model.retry() } }
                        .buttonStyle(.glass)
                        .appButtonContext(.regular)
                }
            case .ready:
                VStack(spacing: 0) {
                    if !model.isConnected {
                        connectionBanner
                    }
                    SourceControlContentView(
                        model: model,
                        activeTab: $activeTab,
                        discardTarget: $discardTarget,
                        branchDiffTarget: $branchDiffTarget,
                        historyRefreshRevision: historyRefreshRevision,
                        hostID: hostID,
                        worktreeID: worktreeID,
                        repository: repository,
                        openReview: openReview,
                        openReviewInSession: openReviewInSession
                    )
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.background)
    }

    private func refresh() {
        historyRefreshRevision += 1
        Task { await model.refresh() }
    }

    private var connectionBanner: some View {
        ContentSurface {
            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(.wifiSlash, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                Text("Reconnecting to daemon…")
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                Spacer(minLength: Theme.Spacing.small)
                Button("Retry") { Task { await model.retry() } }
                    .buttonStyle(.glass)
                    .appButtonContext(.inline)
            }
        }
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.top, Theme.Spacing.small)
    }

    private func openBranchPicker() {
        isShowingBranchPicker = true
        Task {
            await model.loadLocalBranches()
        }
    }

    // Why: model.workspaceLabel prefers the live worktree name over the WorkspaceSummary
    // snapshot handed to this screen at navigation time — see
    // SourceControlModel.liveWorktreeDisplayName.
    private var workspaceLabel: String { model.workspaceLabel }

    @ToolbarContentBuilder
    private var sourceToolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                refresh()
            } label: {
                if model.isRefreshing {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    AgentStartToolbarIcon(.refresh)
                }
            }
            .disabled(model.isRefreshing || model.busyAction != nil)
            .accessibilityLabel("Refresh source control")
        }
        ToolbarSpacer(.fixed, placement: .topBarTrailing)
        // Why: this hub-level action sheet (switch branch, push/pull/sync, commits, and
        // every other SourceControlActionKind) used to live as an "···" button inside the
        // Changes tab's bulk-action row. In the toolbar, that row never has to exist just to
        // host an overflow trigger with no other enabled action.
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                isShowingActions = true
            } label: {
                AgentStartToolbarIcon(.more)
            }
            .disabled(model.busyAction != nil)
            .accessibilityLabel("More source control actions")
        }
    }
}

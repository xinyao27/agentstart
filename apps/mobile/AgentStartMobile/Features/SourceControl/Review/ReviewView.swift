import SwiftUI
import UIKit

struct SourceReviewView: View {
    @Environment(\.agentstartLayoutMetrics) private var layoutMetrics
    let host: HostProfile
    let workspace: WorkspaceSummary
    let showWorkspaceSession: () -> Void
    @State private var model: SourceReviewModel
    @State private var isShowingActions = false
    @State private var isShowingSend = false
    @State private var isShowingPullRequest = false
    @State private var isConfirmingDiscard = false
    @State private var contentWidth: CGFloat = 0
    @State private var isGitHubRepository = false
    @State private var activeHunk: Int?
    @State private var hostedReviewModel: HostedReviewModel?
    private let hostedReviewRepository: (any HostedReviewRepository)?
    private let isGitHubRepositoryProbe: (() async -> Bool)?
    private let sourceRepository: any SourceControlRepository
    private let connectionRuntime: any HostConnectionRuntime

    init(
        host: HostProfile,
        workspace: WorkspaceSummary,
        target: SourceReviewTarget = .all,
        sourceRepository: any SourceControlRepository,
        reviewRepository: any SourceReviewRepository,
        hostedReviewRepository: (any HostedReviewRepository)?,
        isGitHubRepositoryProbe: (() async -> Bool)? = nil,
        connectionRuntime: any HostConnectionRuntime,
        showWorkspaceSession: @escaping () -> Void
    ) {
        self.host = host
        self.workspace = workspace
        self.hostedReviewRepository = hostedReviewRepository
        self.isGitHubRepositoryProbe = isGitHubRepositoryProbe
        self.sourceRepository = sourceRepository
        self.connectionRuntime = connectionRuntime
        self.showWorkspaceSession = showWorkspaceSession
        _model = State(
            initialValue: SourceReviewModel(
                hostID: host.id,
                worktreeID: workspace.id,
                repoID: workspace.repoID,
                target: target,
                sourceRepository: sourceRepository,
                reviewRepository: reviewRepository,
                connectionRuntime: connectionRuntime
            )
        )
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                reviewLoading
            case .waiting:
                AppUnavailableState(
                    "Review waiting",
                    iconID: .wifiSlash,
                    description: Text("Waiting for daemon…")
                ) {
                    Button("Try again", iconID: .refresh) {
                        Task { await connectionRuntime.reconnect(hostID: host.id) }
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                }
            case .failed(let message):
                AppUnavailableState(
                    "Unable to Load Review",
                    iconID: .search,
                    description: Text(verbatim: message)
                ) {
                    Button("Try again", iconID: .refresh) {
                        Task { await connectionRuntime.reconnect(hostID: host.id) }
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                }
            case .ready:
                reviewContent
            }
        }
        .background(Theme.Colors.background)
        // Why: matches the Source Control fix — the file identity card below already shows
        // the full file path with room to wrap, so repeating the workspace/branch context in
        // the nav title only forced a truncated, redundant "Changes · xinyao27/we…" header.
        .navigationTitle("Changes")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { reviewToolbar }
        .task { await model.observe() }
        .task(id: reviewIdentity) { await probeHostedReviewProvider() }
        .refreshable { await model.refresh() }
        .sheet(isPresented: $isShowingActions) {
            SourceReviewActionsSheet(
                model: model,
                showSend: {
                    isShowingActions = false
                    isShowingSend = true
                },
                openSession: {
                    isShowingActions = false
                    Task {
                        if await model.openCurrentInSession() { showWorkspaceSession() }
                    }
                },
                confirmDiscard: {
                    isShowingActions = false
                    isConfirmingDiscard = true
                }
            )
        }
        .sheet(isPresented: $isShowingSend) {
            SourceReviewSendSheet(model: model)
        }
        .sheet(
            isPresented: Binding(
                get: { model.composer != nil },
                set: { if !$0 { model.closeComposer() } }
            )
        ) {
            SourceReviewComposerSheet(model: model)
        }
        .sheet(isPresented: $model.isShowingCompletion) {
            SourceReviewCompletionSheet(model: model) { isShowingSend = true }
        }
        .sheet(isPresented: $isShowingPullRequest) {
            if let status = model.snapshot?.status, hostedReviewRepository != nil {
                NavigationStack {
                    hostedReview(status: status)
                        .navigationTitle("Pull Request")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            SheetDismissToolbarItem(accessibilityLabel: "Close pull request") {
                                isShowingPullRequest = false
                            }
                        }
                }
                .appSheetPresentation(.page)
            }
        }
        .alert(
            "Review action",
            isPresented: Binding(
                get: { model.errorMessage != nil },
                set: { if !$0 { model.clearError() } }
            )
        ) {
            Button("OK", action: model.clearError)
        } message: {
            if let message = model.errorMessage { Text(verbatim: message) }
        }
        .alert("Discard File?", isPresented: $isConfirmingDiscard) {
            Button("Cancel", role: .cancel) {}
            Button("Discard", role: .destructive) { Task { await model.discardCurrent() } }
        } message: {
            if let item = model.currentItem {
                Text("Discard changes to “\(item.filePath)”? This cannot be undone.")
            }
        }
    }

    private var reviewLoading: some View {
        VStack(spacing: Theme.Spacing.medium) {
            ProgressView()
                .controlSize(.small)
            Text("Loading review…")
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.mutedForeground)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var reviewContent: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                // Why: the review-wide filter/progress controls and the current file's
                // identity are one chrome band, not five separately-aligned bands. It is a
                // full-width band rather than an inset ContentSurface card because the diff
                // below it must stay edge-to-edge (the +/- and line-number gutters sit at the
                // very margin), and a floating card butted against full-bleed content reads
                // as a mistake. Chrome and code share one background, so a single hairline at
                // the bottom carries the boundary instead of a four-sided card outline.
                VStack(alignment: .leading, spacing: 0) {
                    SourceReviewHeader(model: model)
                    if let item = model.currentItem {
                        SourceReviewFileSummary(
                            model: model,
                            item: item,
                            moveHunk: moveHunk
                        )
                    }
                }
                .padding(Theme.Spacing.standard)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Colors.content)
                // Why: chrome and code sit on backgrounds 4/255 apart, so tone alone cannot
                // separate them. One system Divider — the same separator every other list in
                // the app uses — carries the boundary, replacing the card outline this band
                // used to draw on all four sides.
                Divider()
                if let message = model.branchComparisonError {
                    Text(verbatim: message)
                        .font(.system(size: Theme.Typography.metadata))
                        .foregroundStyle(Theme.Colors.foreground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Theme.Spacing.medium)
                        .padding(.vertical, Theme.Spacing.small)
                        .background(
                            Theme.Colors.selection,
                            in: .rect(cornerRadius: Theme.Radius.control)
                        )
                        .padding(.horizontal, Theme.Spacing.medium)
                        .padding(.bottom, Theme.Spacing.small)
                }
                if let item = model.currentItem {
                    SourceReviewDiffView(
                        model: model,
                        item: item,
                        activeHunk: $activeHunk
                    )
                    // Why: the diff above asks for maxHeight .infinity, so at an accessibility
                    // text size — where the action bar stacks and grows several times taller —
                    // the bar loses the height contest and gets clipped off the bottom of the
                    // screen. It states its own intrinsic height and the diff yields instead.
                    SourceReviewFooter(model: model, item: item)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    AppUnavailableState(
                        "No Reviewable Changes",
                        iconID: .checkCircle,
                        description: Text("Try a different review filter.")
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(minWidth: 0, maxWidth: .infinity, maxHeight: .infinity)
            if canDockHostedReview, let status = model.snapshot?.status,
                hostedReviewRepository != nil
            {
                hostedReview(status: status)
                    .frame(width: SourceReviewLayout.hostedReviewWidth)
                    .frame(maxHeight: .infinity)
                    .overlay(alignment: .leading) {
                        Rectangle()
                            .fill(Theme.Colors.rail.opacity(0.65))
                            .frame(width: Theme.Size.hairline)
                    }
            }
        }
        .onGeometryChange(for: CGFloat.self) { proxy in
            proxy.size.width
        } action: {
            contentWidth = $0
        }
        .onChange(of: model.currentItem?.id) { _, _ in
            activeHunk = nil
        }
    }

    @ToolbarContentBuilder
    private var reviewToolbar: some ToolbarContent {
        if hostedReviewRepository != nil, isGitHubRepository, !canDockHostedReview {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    isShowingPullRequest = true
                } label: {
                    AgentStartToolbarIcon(.checklist)
                }
                .accessibilityLabel("Open pull request review")
            }
            ToolbarSpacer(.fixed, placement: .topBarTrailing)
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                isShowingActions = true
            } label: {
                AgentStartToolbarIcon(.more)
            }
            .accessibilityLabel("More review actions")
        }
    }

    private var reviewIdentity: String {
        guard let status = model.snapshot?.status else { return "" }
        return "\(status.branchLabel)\u{0000}\(status.head ?? "")"
    }

    private var canDockHostedReview: Bool {
        layoutMetrics.isWideLayout
            && isGitHubRepository
            && contentWidth >= AgentStartLayoutMetrics.wideLayoutMinimum
    }

    private func moveHunk(_ direction: Int) {
        let count = model.currentHunkCount
        guard count > 0 else { return }
        activeHunk =
            ((activeHunk ?? (direction > 0 ? -1 : 0)) + direction + count)
            % count
    }

    // One HostedReviewModel per review screen instance, lazily created the first
    // time probeHostedReviewProvider() confirms a hosted-review repository — the
    // sheet and the docked panel below share it rather than each minting their own.
    @ViewBuilder
    private func hostedReview(status: SourceStatusSnapshot) -> some View {
        if let hostedReviewModel {
            HostedReviewView(
                hostID: host.id,
                status: status,
                model: hostedReviewModel,
                connectionRuntime: connectionRuntime
            )
        }
    }

    private func probeHostedReviewProvider() async {
        guard model.isConnected else {
            isGitHubRepository = false
            return
        }
        guard let status = model.snapshot?.status, let hostedReviewRepository else {
            isGitHubRepository = false
            isShowingPullRequest = false
            return
        }
        if hostedReviewModel == nil {
            hostedReviewModel = HostedReviewModel(
                hostID: host.id,
                workspace: workspace,
                status: status,
                repository: hostedReviewRepository,
                sourceRepository: sourceRepository,
                connectionRuntime: connectionRuntime
            )
        }
        if let isGitHubRepositoryProbe {
            // Why: decide the PR affordance from the cheap github.repoSlug probe. Hosted-review
            // eligibility also checks branch/upstream state, so using it here hides the button
            // for valid GitHub worktrees that merely have a blocked create state.
            isGitHubRepository = await isGitHubRepositoryProbe()
            if !isGitHubRepository { isShowingPullRequest = false }
            return
        }
        let eligibility = try? await hostedReviewRepository.hostedReviewEligibility(
            for: host.id,
            workspace: workspace,
            status: status
        )
        guard !Task.isCancelled else { return }
        isGitHubRepository = eligibility?.provider == .github
        if !isGitHubRepository { isShowingPullRequest = false }
    }
}

private enum SourceReviewLayout {
    static let hostedReviewWidth: CGFloat = 320
}

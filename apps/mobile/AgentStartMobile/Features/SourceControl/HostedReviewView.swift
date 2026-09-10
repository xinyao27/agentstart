import SwiftUI

// Why: model is owned by SourceControlModel (ScreenModel.swift), not this view —
// one HostedReviewModel instance must persist across Changes/Pull Request/Commits
// tab switches so the branch-card chip and this tab always read the same state.
struct HostedReviewView: View {
    @Bindable var model: HostedReviewModel
    let status: SourceStatusSnapshot
    @State private var confirmation: HostedReviewConfirmation?
    @State private var isShowingReviewers = false
    @State private var isEditingTitle = false
    @Environment(\.openURL) private var openURL
    private let hostID: String
    private let connectionRuntime: any HostConnectionRuntime

    init(
        hostID: String,
        status: SourceStatusSnapshot,
        model: HostedReviewModel,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.hostID = hostID
        self.connectionRuntime = connectionRuntime
        self.status = status
        self.model = model
    }

    var body: some View {
        Group {
            switch model.phase {
            case .loading:
                hostedReviewLoading
            case .waiting:
                AppUnavailableState(
                    "Pull request waiting",
                    iconID: .wifiSlash,
                    description: Text("Waiting for daemon…")
                ) {
                    Button("Try again", iconID: .refresh) {
                        Task { await connectionRuntime.reconnect(hostID: hostID) }
                    }
                    .buttonStyle(.glass)
                    .appButtonContext(.regular)
                }
            case .failed(let message):
                hostedReviewFailure(message)
            case .empty(let eligibility):
                HostedReviewEmptyView(
                    eligibility: eligibility,
                    isBusy: model.busyAction != nil,
                    progress: model.createProgress,
                    commitFailure: model.commitFailure,
                    commitFailureFixBusy: model.busyAction == "commit-fix",
                    commitFailureLaunchError: model.commitFailureLaunchError,
                    create: {
                        Task {
                            await model.createFromBranch()
                            if let url = model.takeCreatedReviewURL() { openURL(url) }
                        }
                    },
                    fixCommitFailure: { Task { await model.launchCommitFailureFix() } },
                    link: { provider, number in
                        Task { await model.link(provider: provider, number: number) }
                    }
                )
            case .ready(let review, let details, let checks):
                HostedReviewReadyContent(
                    model: model,
                    confirmation: $confirmation,
                    isShowingReviewers: $isShowingReviewers,
                    isEditingTitle: $isEditingTitle,
                    review: review,
                    details: details,
                    checks: checks
                )
            }
        }
        .task { await model.observe() }
        .task(id: status) { await model.synchronize(status) }
        // Why: the branch-card chip only ever drives loadSummary() (phase 1). The
        // heavy comments/body payload is fetched here instead, once per tab open —
        // ensureDetails() no-ops when a real (non-placeholder) payload already
        // loaded, so reopening the tab never re-pulls it.
        .task { await model.ensureDetails() }
        .refreshable { await model.load() }
        .alert(
            "Hosted review action failed",
            isPresented: Binding(
                get: { model.errorMessage != nil },
                set: { if !$0 { model.clearError() } }
            )
        ) {
            Button("OK", action: model.clearError)
        } message: {
            if let errorMessage = model.errorMessage { Text(verbatim: errorMessage) }
        }
        .confirmationDialog(
            confirmation?.title ?? "Confirm action",
            isPresented: Binding(
                get: { confirmation != nil },
                set: { if !$0 { confirmation = nil } }
            ),
            titleVisibility: .visible,
            presenting: confirmation
        ) { pending in
            Button(pending.buttonTitle, role: pending.role) {
                confirmation = nil
                Task { await perform(pending) }
            }
            Button("Cancel", role: .cancel) { confirmation = nil }
        } message: { pending in
            Text(pending.message)
        }
        .sheet(isPresented: $isShowingReviewers) {
            HostedReviewReviewerSheet(model: model)
        }
        .sheet(isPresented: $isEditingTitle) {
            if let review = model.review {
                HostedReviewTitleSheet(
                    title: model.details?.title ?? review.title,
                    isBusy: model.busyAction == "title"
                ) { title in
                    Task {
                        await model.mutate(.update(title: title, body: nil), action: "title")
                        if model.errorMessage == nil { isEditingTitle = false }
                    }
                }
            }
        }
    }

    private var hostedReviewLoading: some View {
        VStack(spacing: Theme.Spacing.medium) {
            ProgressView()
                .controlSize(.small)
            Text("Loading pull request…")
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.mutedForeground)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func hostedReviewFailure(_ message: String) -> some View {
        AppUnavailableState(
            "Pull request unavailable",
            iconID: .gitPullRequest,
            description: Text(verbatim: message)
        ) {
            Button("Try again", iconID: .refresh) {
                Task { await connectionRuntime.reconnect(hostID: hostID) }
            }
            .buttonStyle(.glass)
            .appButtonContext(.regular)
        }
    }

    private func perform(_ pending: HostedReviewConfirmation) async {
        switch pending {
        case .merge:
            await model.mutate(
                .merge(method: model.review?.preferredMergeMethod ?? "squash"),
                action: "merge"
            )
        case .close:
            await model.mutate(.updateState(.closed), action: "state")
        case .reopen:
            await model.mutate(.updateState(.open), action: "state")
        case .unlink:
            await model.unlink()
        }
    }
}

nonisolated enum HostedReviewConfirmation: Hashable, Sendable {
    case merge(Int)
    case close(Int)
    case reopen(Int)
    case unlink(Int)

    var title: LocalizedStringResource {
        switch self {
        case .merge: "Merge pull request?"
        case .close: "Close pull request?"
        case .reopen: "Reopen pull request?"
        case .unlink: "Unlink pull request?"
        }
    }

    var message: LocalizedStringResource {
        switch self {
        case .merge(let number): "This will merge #\(number) into its base branch."
        case .close(let number): "#\(number) will be closed without merging."
        case .reopen(let number): "#\(number) will be reopened."
        case .unlink: "The pull request will remain on its provider."
        }
    }

    var buttonTitle: LocalizedStringResource {
        switch self {
        case .merge: "Merge"
        case .close: "Close"
        case .reopen: "Reopen"
        case .unlink: "Unlink"
        }
    }

    var role: ButtonRole? {
        switch self {
        case .close, .unlink: .destructive
        case .merge, .reopen: nil
        }
    }
}

struct HostedReviewSection<Content: View, Trailing: View>: View {
    let title: LocalizedStringResource?
    let iconID: AgentStartIconID?
    let hasHeader: Bool
    @ViewBuilder let trailing: Trailing
    @ViewBuilder let content: Content

    init(
        title: LocalizedStringResource? = nil,
        iconID: AgentStartIconID? = nil,
        @ViewBuilder content: () -> Content
    ) where Trailing == EmptyView {
        self.title = title
        self.iconID = iconID
        hasHeader = title != nil || iconID != nil
        trailing = EmptyView()
        self.content = content()
    }

    init(
        title: LocalizedStringResource? = nil,
        iconID: AgentStartIconID? = nil,
        @ViewBuilder trailing: () -> Trailing,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.iconID = iconID
        hasHeader = true
        self.trailing = trailing()
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: hasHeader ? Theme.Spacing.extraSmall : 0) {
            if hasHeader {
                sectionHeader
            }
            ContentSurface {
                VStack(alignment: .leading, spacing: Theme.Spacing.medium) { content }
            }
        }
    }

    private var sectionHeader: some View {
        HStack(spacing: Theme.Spacing.small) {
            if let iconID {
                AgentStartIcon(iconID, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: Theme.Control.inlineIcon)
            }
            if let title {
                Text(title)
                    .font(.system(size: Theme.Typography.supporting, weight: .semibold))
            }
            Spacer(minLength: 0)
            trailing
        }
        .frame(minHeight: Theme.Size.minimumHitTarget)
        .foregroundStyle(Theme.Colors.mutedForeground)
    }
}

struct HostedReviewPage<Content: View>: View {
    @ViewBuilder let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: Theme.Spacing.medium) {
                content
            }
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.top, Theme.Spacing.extraSmall)
            .padding(.bottom, Theme.Spacing.standard)
        }
        .background(Theme.Colors.background)
    }
}

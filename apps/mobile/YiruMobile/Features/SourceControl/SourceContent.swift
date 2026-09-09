import SwiftUI

nonisolated enum SourceControlHubTab: String, Hashable, Sendable {
    case changes
    case pullRequest
    case history
}

struct SourceControlContentView: View {
    @Bindable var model: SourceControlModel
    @Binding var activeTab: SourceControlHubTab
    @Binding var discardTarget: SourceFileEntry?
    @Binding var branchDiffTarget: SourceBranchFile?
    let historyRefreshRevision: Int
    let hostID: String
    let worktreeID: String
    let repository: any SourceControlRepository
    let openReview: (SourceFileEntry) -> Void
    let openReviewInSession: ((SourceFileEntry) -> Void)?

    var body: some View {
        VStack(spacing: 0) {
            SourceSelectionStrip(
                selection: $activeTab,
                options: [.changes, .pullRequest, .history]
            ) { tab in
                switch tab {
                case .changes:
                    Text("Changes")
                case .pullRequest:
                    Text("Pull Request")
                case .history:
                    Text("Commits")
                }
            }
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.top, Theme.Spacing.small)

            if let snapshot = model.snapshot {
                switch activeTab {
                case .changes:
                    changesList(snapshot)
                case .pullRequest:
                    if let hostedReviewModel = model.hostedReviewModel {
                        HostedReviewView(
                            hostID: hostID,
                            status: snapshot,
                            model: hostedReviewModel,
                            connectionRuntime: model.connectionRuntime
                        )
                    } else {
                        AppUnavailableState(
                            title: Text(
                                verbatim: model.hostedReviewEligibility?.provider.reviewTitle
                                    ?? String(localized: "Pull Request")
                            ),
                            iconID: .gitPullRequest,
                            description: Text("Hosted review is unavailable for this repository.")
                        )
                    }
                case .history:
                    SourceBranchCard(model: model, openPullRequest: { activeTab = .pullRequest })
                    SourceHistoryView(
                        hostID: hostID,
                        worktreeID: worktreeID,
                        repository: repository,
                        connectionRuntime: model.connectionRuntime,
                        refreshRevision: historyRefreshRevision
                    )
                }
            }
        }
    }

    // Why: a real `List` (not a manual ScrollView + LazyVStack) is what makes native
    // trailing `.swipeActions` on each file row possible — SwiftUI only recognizes that
    // modifier on List rows — and List's cell reuse is the more performant choice for the
    // thousand-plus rows a large repo's status can produce. Every block here (header card,
    // file sections, "Committed on Branch") is a flat row/run of rows in the same List —
    // deliberately NOT wrapped in `Section`, whose automatic inter-section spacing left a
    // large dead gap between the last free-floating row and the first Section header. The
    // commit composer docks to the list's bottom edge via `safeAreaInset`, sized off the
    // bar's own deterministic height (see `SourceControlActionBar.contentHeight`) rather
    // than trusting the container's self-reported size.
    private func changesList(_ snapshot: SourceStatusSnapshot) -> some View {
        List {
            SourceBranchCard(model: model, openPullRequest: { activeTab = .pullRequest })
            if model.commitFailure != nil {
                SourceCommitFailurePanel(model: model)
            }
            if snapshot.didHitLimit {
                Text("Only part of this repository status could be loaded.")
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.unread)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, Theme.Spacing.page)
                    .padding(.vertical, Theme.Spacing.small)
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Theme.Colors.background)
            }
            if isWorkingTreeClean {
                Text("Working tree clean")
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(maxWidth: .infinity)
                    .padding(.top, Theme.Spacing.huge)
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Theme.Colors.background)
            } else {
                ForEach(model.sections) { section in
                    sectionHeader(section)
                    ForEach(section.entries) { entry in
                        SourceFileRow(
                            entry: entry,
                            isBusy: model.busyAction == "stage:\(entry.path)"
                                || model.busyAction == "unstage:\(entry.path)"
                                || model.busyAction == "discard:\(entry.path)",
                            isDisabled: model.busyAction != nil,
                            open: { (openReviewInSession ?? openReview)(entry) },
                            stage: { Task { await model.stage(entry) } },
                            unstage: { Task { await model.unstage(entry) } },
                            discard: { discardTarget = entry }
                        )
                    }
                }
                SourceBranchChanges(model: model) { branchDiffTarget = $0 }
            }
        }
        .listStyle(.plain)
        // Why: List's default grouped-adjacent style paints its own systemBackground per
        // row; the page and every row here share one neutral Theme.Colors.background.
        .scrollContentBackground(.hidden)
        .background(Theme.Colors.background)
        .environment(\.defaultMinListRowHeight, 0)
        .safeAreaInset(edge: .bottom) { SourceControlActionBar(model: model) }
        .refreshable { await model.refresh() }
    }

    private var isWorkingTreeClean: Bool {
        model.sections.isEmpty
            && model.branchComparison?.entries.isEmpty != false
            && model.branchComparisonError == nil
            && !model.isLoadingBranchComparison
    }

    // Why: the first section that can still be bulk-staged (unstaged, then untracked) is
    // where "Stage All" attaches — never both at once, and never the same action twice on
    // screen. When nothing is staged yet the footer's own primary CTA already reads "Stage
    // All" (SourceControlModel.primaryAction), so this header button is suppressed then;
    // once anything is staged the footer moves on to Commit and this becomes the only way
    // to bulk-stage what's left. "Unstage All" attaches to Staged Changes, the only section
    // it ever applies to. Neither renders as its own row, so there is never an empty row.
    private var firstStageableSectionArea: SourceStagingArea? {
        model.sections.first { $0.area == .unstaged || $0.area == .untracked }?.area
    }

    private func sectionHeader(_ section: SourceStatusSection) -> some View {
        HStack(spacing: Theme.Spacing.small) {
            Text(section.title)
                .textCase(.uppercase)
            Spacer(minLength: Theme.Spacing.small)
            if section.area == .staged {
                bulkActionButton(
                    label: String(localized: "Unstage All"),
                    iconName: .remove,
                    busyKey: "unstage-all"
                ) { await model.unstageAll() }
            } else if section.area == firstStageableSectionArea, model.primaryAction != .stageAll {
                bulkActionButton(
                    label: String(localized: "Stage All"),
                    iconName: .add,
                    busyKey: "stage-all"
                ) { await model.stageAll() }
            }
            // Why: `.formatted()` would group this section count as "1,234"; it sits beside
            // file paths where a separator reads as part of the text.
            Text(verbatim: String(section.entries.count))
                .foregroundStyle(Theme.Colors.mutedForeground)
        }
        .font(.system(size: Theme.Typography.metadata))
        .foregroundStyle(Theme.Colors.mutedForeground)
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.top, Theme.Spacing.medium)
        .padding(.bottom, Theme.Spacing.extraSmall)
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
        .listRowBackground(Theme.Colors.background)
    }

    private func bulkActionButton(
        label: String,
        iconName: YiruIconID,
        busyKey: String,
        operation: @escaping () async -> Void
    ) -> some View {
        Button {
            Task { await operation() }
        } label: {
            HStack(spacing: Theme.Spacing.extraSmall) {
                if model.busyAction == busyKey {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    YiruIcon(iconName, size: 13)
                }
                Text(verbatim: label)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.capsule)
        .appButtonContext(.inline)
        .disabled(model.busyAction != nil)
    }
}

import SwiftUI

struct WorkspaceListContentView: View {
    let model: WorkspaceListModel
    let snapshot: WorkspaceSnapshot
    let showPairing: () -> Void
    let showActions: (WorkspaceSummary) -> Void
    let requestRemoveHost: () -> Void
    let selectWorkspace: (WorkspaceSummary, WorkspaceOpenTab?) -> Void
    @State private var didObserveInitialActiveRow = false

    var body: some View {
        let repoIconsByID = Dictionary(
            snapshot.repos.map { ($0.id, $0.icon) },
            uniquingKeysWith: { first, _ in first }
        )
        let repoIconsByName = Dictionary(
            snapshot.repos.map { ($0.name, $0.icon) },
            uniquingKeysWith: { first, _ in first }
        )
        let reposByID = Dictionary(
            snapshot.repos.map { ($0.id, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        let reposByName = Dictionary(
            snapshot.repos.map { ($0.name, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        VStack(spacing: 0) {
            if model.isReadOnly {
                WorkspaceAuthenticationBanner(
                    canRetry: true,
                    retry: { Task { await model.reconnectAndLoad() } },
                    repair: showPairing,
                    remove: requestRemoveHost
                )
            }

            if model.shouldShowEmptyState {
                Text(model.emptyStateTitle)
                    .font(.system(size: WorkspaceListMetrics.supportingText))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                workspaceScroll(
                    repoIconsByID: repoIconsByID,
                    repoIconsByName: repoIconsByName,
                    reposByID: reposByID,
                    reposByName: reposByName
                )
            }
        }
    }

    private func workspaceScroll(
        repoIconsByID: [String: WorkspaceRepoIcon?],
        repoIconsByName: [String: WorkspaceRepoIcon?],
        reposByID: [String: WorkspaceRepo],
        reposByName: [String: WorkspaceRepo]
    ) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(model.sections) { section in
                        WorkspaceSectionHeader(
                            section: section,
                            isCollapsed: model.isSectionCollapsed(section.id),
                            repo: sectionRepo(section, byID: reposByID, byName: reposByName),
                            toggle: { model.toggleSection(section.id) }
                        )
                        ForEach(section.rows) { row in
                            WorkspaceListRow(
                                state: row,
                                repoIcon: repoIcon(
                                    for: row.workspace,
                                    byID: repoIconsByID,
                                    byName: repoIconsByName
                                ),
                                repo: reposByID[row.workspace.repoID]
                                    ?? reposByName[row.workspace.repoName],
                                isPinnedSection: section.kind == .pinned,
                                isReadOnly: model.isReadOnly,
                                openTabs: model.openTabs(for: row.workspace.id),
                                now: model.now,
                                selectWorkspace: {
                                    guard !model.isReadOnly else { return }
                                    selectWorkspace(row.workspace, nil)
                                },
                                selectTab: { tab in
                                    guard !model.isReadOnly else { return }
                                    selectWorkspace(row.workspace, tab)
                                },
                                showActions: {
                                    guard !model.isReadOnly else { return }
                                    showActions(row.workspace)
                                }
                            )
                            .id(row.id)
                        }
                    }
                }
                .padding(.bottom, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable {
                await model.refresh()
            }
            .onChange(of: model.activeRowID) { _, rowID in
                guard let rowID else { return }
                // Why: leave the initial snapshot at the top even when Desktop reports an active
                // worktree, and only follow later selection changes — an eager initial scroll
                // pulls the list under the navigation header.
                guard didObserveInitialActiveRow else {
                    didObserveInitialActiveRow = true
                    return
                }
                Task { @MainActor in
                    await Task.yield()
                    withAnimation(.easeInOut(duration: 0.22)) {
                        proxy.scrollTo(rowID, anchor: .center)
                    }
                }
            }
            .overlay {
                if model.shouldShowConnectionLoading {
                    // Why: the host-level notice already owns the reconnect action. Keep this
                    // first-load indicator out of the list layout so the toolbar, back action,
                    // and any cached/empty surface remain usable while Desktop is connecting.
                    AgentStartLoader(size: Theme.Control.regularIcon)
                        .accessibilityLabel("Connecting to daemon")
                        .allowsHitTesting(false)
                }
            }
        }
    }

    private func repoIcon(
        for workspace: WorkspaceSummary,
        byID: [String: WorkspaceRepoIcon?],
        byName: [String: WorkspaceRepoIcon?]
    ) -> WorkspaceRepoIcon? {
        byID[workspace.repoID] ?? byName[workspace.repoName] ?? nil
    }

    private func sectionRepo(
        _ section: WorkspaceListSection,
        byID: [String: WorkspaceRepo],
        byName: [String: WorkspaceRepo]
    ) -> WorkspaceRepo? {
        guard case .repo(let repo) = section.kind else { return nil }
        return repo ?? byID.values.first { $0.name == section.title } ?? byName[section.title]
    }

}

import SwiftUI

struct HomeDashboardView: View {
    let snapshot: HomeSnapshot
    let now: Date
    @Binding var creationTarget: HomeWorkspaceCreationTarget?
    let showHost: (HostProfile) -> Void
    let showWorkspace: (HostProfile, WorkspaceSummary) -> Void
    let showPairing: () -> Void
    let showAccounts: (HostProfile) -> Void
    let editHost: (HostProfile) -> Void
    let reconnect: (HostProfile) -> Void
    let disconnect: (HostProfile) -> Void
    let requestRemove: (HostProfile) -> Void
    let refresh: () async -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Theme.Spacing.large) {
                Text("Home")
                    .font(.system(size: Theme.Typography.pageTitle, weight: .semibold))

                LazyVGrid(
                    columns: [
                        GridItem(.flexible(), spacing: Theme.Spacing.medium),
                        GridItem(.flexible()),
                    ],
                    spacing: Theme.Spacing.medium
                ) {
                    HomeMetricTileView(
                        glyph: .stack,
                        // Why: the Workspace tile uses the shared adaptive primary token
                        // (#FF5B03). Keeping the token here preserves the same brand color in
                        // light and dark mode without a feature-local duplicate.
                        color: Theme.Colors.primary,
                        title: "Workspace",
                        value: snapshot.workspaceCount,
                        action: snapshot.primaryConnectedHost.map { host in { showHost(host) } }
                    )
                    HomeMetricTileView(
                        glyph: .pulse,
                        color: Theme.Colors.homeWorking,
                        title: "Working",
                        value: snapshot.workingCount,
                        action: snapshot.primaryConnectedHost.map { host in { showHost(host) } }
                    )
                    HomeMetricTileView(
                        glyph: .warning,
                        // Why: the product's amber-500 token, not the platform's orange, which
                        // is a different hue family beside the rest of the tiles.
                        color: Theme.Colors.homeAttention,
                        title: "Needs attention",
                        value: snapshot.attentionCount,
                        action: snapshot.primaryConnectedHost.map { host in { showHost(host) } }
                    )
                    HomeMetricTileView(
                        // Why: a clock face with a counterclockwise arrow around it, not a plain
                        // clock — the tile means "recent", not "time".
                        glyph: .history,
                        color: Theme.Colors.homeRecent,
                        title: "Recent",
                        value: snapshot.resumeTarget == nil ? 0 : 1,
                        action: snapshot.resumeTarget.map { target in
                            { showWorkspace(target.host, target.workspace) }
                        }
                    )
                }

                HomeAccountUsageSection(
                    snapshots: snapshot.hosts,
                    now: now,
                    openAccounts: showAccounts,
                    editHost: editHost,
                    reconnect: reconnect,
                    disconnect: disconnect,
                    requestRemove: requestRemove
                )
                // Why: React Native's safe-area content starts three points below SwiftUI's
                // scroll content on this route. Keep the usage block on the same baseline
                // without changing the shared settings/list spacing.
                .padding(.top, HomeDashboardMetrics.usageSectionTop)
            }
            .frame(maxWidth: Theme.Size.readingWidth)
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.top, HomeDashboardMetrics.contentTop)
            .padding(.bottom, Theme.Spacing.huge * 2.5)
            .frame(maxWidth: .infinity)
        }
        .refreshable {
            await refresh()
        }
        .safeAreaInset(edge: .bottom) {
            HomePrimaryAction(
                snapshot: snapshot,
                createWorkspace: {
                    if let target = snapshot.primaryConnectedSnapshot {
                        creationTarget = HomeWorkspaceCreationTarget(
                            host: target.host,
                            existingPaths: target.workspaces.map(\.path)
                        )
                    } else {
                        showPairing()
                    }
                }
            )
        }
    }
}

enum HomeDashboardMetrics {
    // Why: state these gaps explicitly; leaning on SwiftUI's default stack baselines made
    // every Home section drift down the screen.
    static let contentTop = Theme.Spacing.large
    static let usageSectionTop: CGFloat = 0
    static let hostVerticalPadding = Theme.Spacing.medium
}

private struct HomeMetricTileView: View {
    let glyph: AgentStartIconID
    let color: Color
    let title: LocalizedStringResource
    let value: Int
    let action: (() -> Void)?

    var body: some View {
        Button(action: action ?? {}) {
            ContentSurface {
                VStack(alignment: .leading, spacing: Theme.Spacing.medium) {
                    Spacer()
                    AgentStartIcon(glyph, size: Theme.Spacing.extraLarge)
                        .foregroundStyle(color)
                    HStack(spacing: Theme.Spacing.extraSmall) {
                        Text(title)
                            .font(.system(size: Theme.Typography.primary))
                            .foregroundStyle(Theme.Colors.foreground)
                        Text("\(value)")
                            .font(.system(size: Theme.Typography.supporting))
                            .foregroundStyle(Theme.Colors.mutedForeground.opacity(0.7))
                            .monospacedDigit()
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
            }
            .contentShape(.rect(cornerRadius: Theme.Radius.content))
        }
        .buttonStyle(.appPlain)
        // Why: disable the tile when there is nothing to open, so an idle tile never looks
        // tappable. A plain Button with a no-op action still shows press feedback for a tap
        // that does nothing — visually present but functionally empty.
        .disabled(action == nil)
        .accessibilityLabel("\(String(localized: title)): \(value)")
    }
}

private struct HomePrimaryAction: View {
    let snapshot: HomeSnapshot
    let createWorkspace: () -> Void

    var body: some View {
        HStack {
            Spacer(minLength: 0)
            Button(action: createWorkspace) {
                Label(
                    snapshot.primaryConnectedSnapshot == nil ? "Pair daemon" : "New workspace",
                    iconID: snapshot.primaryConnectedSnapshot == nil ? .monitor : .add
                )
                .padding(.horizontal, Theme.Spacing.large)
            }
            .buttonStyle(.glass)
            .appButtonContext(.large)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: Theme.Size.readingWidth)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.bottom, Theme.Spacing.small)
    }
}

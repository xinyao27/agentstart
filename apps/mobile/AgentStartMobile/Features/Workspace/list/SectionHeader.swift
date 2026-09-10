import SwiftUI

struct WorkspaceSectionHeader: View {
    let section: WorkspaceListSection
    let isCollapsed: Bool
    let repo: WorkspaceRepo?
    let toggle: () -> Void

    @Environment(\.displayScale) private var displayScale

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: WorkspaceListMetrics.horizontalGap) {
                leadingIcon
                Text(verbatim: section.title)
                    .font(.system(size: WorkspaceListMetrics.titleText, weight: .semibold))
                    .foregroundStyle(Theme.Colors.foreground)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                AgentStartIcon(
                    isCollapsed ? .chevronRight : .chevronDown,
                    size: WorkspaceListMetrics.standardIcon
                )
                .foregroundStyle(Theme.Colors.mutedForeground)
                .frame(width: WorkspaceListMetrics.leadingColumn, height: 36)
            }
            .padding(.leading, 10)
            .padding(.trailing, 8)
            .frame(height: WorkspaceListMetrics.sectionHeight)
        }
        .buttonStyle(WorkspacePressedRowStyle())
        .padding(.top, 4)
    }

    private var leadingIcon: some View {
        ZStack {
            switch section.kind {
            case .pinned:
                AgentStartIcon(.pushPin, size: WorkspaceListMetrics.standardIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
            case .repo(let sectionRepo):
                WorkspaceRepoIconView(
                    icon: repo?.icon ?? sectionRepo?.icon,
                    remoteSlug: repo?.slug ?? sectionRepo?.slug,
                    size: WorkspaceListMetrics.projectIcon
                )
            }
        }
        .frame(
            width: WorkspaceListMetrics.leadingColumn,
            height: WorkspaceListMetrics.sectionHeight
        )
        .overlay(alignment: .bottom) {
            if showsProjectRail {
                Rectangle()
                    .fill(Theme.Colors.rail)
                    .frame(
                        width: 1 / displayScale,
                        height: WorkspaceListMetrics.sectionHeight
                            - WorkspaceListMetrics.sectionRailStart
                    )
            }
        }
    }

    private var showsProjectRail: Bool {
        switch section.kind {
        case .pinned: false
        case .repo: !section.rows.isEmpty
        }
    }
}

import SwiftUI
import UIKit

struct WorkspaceListRow: View {
    let state: WorkspaceListRowState
    let repoIcon: WorkspaceRepoIcon?
    let repo: WorkspaceRepo?
    let isPinnedSection: Bool
    let isReadOnly: Bool
    let openTabs: [WorkspaceOpenTab]
    let now: Date
    let selectWorkspace: () -> Void
    let selectTab: (WorkspaceOpenTab) -> Void
    let showActions: () -> Void

    @Environment(\.displayScale) private var displayScale
    @Environment(\.yiruLayoutMetrics) private var layoutMetrics

    private var workspace: WorkspaceSummary { state.workspace }
    private var isNestedUnderProject: Bool { !isPinnedSection }

    var body: some View {
        rowButton
    }

    private var rowButton: some View {
        VStack(alignment: .leading, spacing: 0) {
            primaryButton
            if !openTabs.isEmpty {
                childRow {
                    WorkspaceOpenTabs(
                        workspace: workspace,
                        tabs: openTabs,
                        now: now,
                        railStartOffset: folderMeta == nil ? 0 : 16,
                        selectTab: selectTab
                    )
                }
            }
        }
        .padding(.leading, leadingPadding)
        .padding(.trailing, 8)
        .padding(.vertical, 6)
        .frame(minHeight: WorkspaceListMetrics.rowMinimumHeight, alignment: .top)
        .overlay { projectRail }
    }

    private var primaryButton: some View {
        Group {
            if workspace.kind == .folderWorkspace {
                primaryButtonBase
            } else {
                primaryButtonBase.highPriorityGesture(
                    LongPressGesture(minimumDuration: 0.4, maximumDistance: 16)
                        .onEnded { _ in
                            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            showActions()
                        }
                )
            }
        }
    }

    private var primaryButtonBase: some View {
        Button(action: selectWorkspace) {
            HStack(alignment: .top, spacing: WorkspaceListMetrics.horizontalGap) {
                if isNestedUnderProject {
                    Color.clear.frame(width: WorkspaceListMetrics.leadingColumn)
                }
                WorkspaceLeadingStatus(workspace: workspace)
                    .padding(.leading, statusIndent)
                VStack(alignment: .leading, spacing: 0) {
                    title
                    if let folderMeta {
                        Text(verbatim: folderMeta)
                            .font(.system(size: WorkspaceListMetrics.supportingText))
                            .foregroundStyle(Theme.Colors.mutedForeground)
                            .lineLimit(1)
                            .frame(minHeight: 16)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                unreadIndicator
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(WorkspacePressedRowStyle())
    }

    @ViewBuilder
    private func childRow<Content: View>(
        @ViewBuilder content: () -> Content
    ) -> some View {
        HStack(alignment: .top, spacing: WorkspaceListMetrics.horizontalGap) {
            if isNestedUnderProject {
                Color.clear.frame(width: WorkspaceListMetrics.leadingColumn)
            }
            Color.clear.frame(width: WorkspaceListMetrics.leadingColumn)
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var title: some View {
        HStack(spacing: WorkspaceListMetrics.horizontalGap) {
            if isPinnedSection {
                WorkspaceRepoIconView(
                    icon: repoIcon,
                    remoteSlug: repo?.slug,
                    size: WorkspaceListMetrics.standardIcon
                )
            }
            Text(verbatim: workspace.name.isEmpty ? workspace.repoName : workspace.name)
                .font(.system(size: WorkspaceListMetrics.titleText))
                .foregroundStyle(
                    workspace.isUnread
                        ? Theme.Colors.foreground : Theme.Colors.foreground.opacity(0.8)
                )
                .opacity(isReadOnly ? 0.5 : 1)
                .lineLimit(1)
                .truncationMode(.tail)
                // Why: the title yields to the trailing activity/meta column instead of taking
                // its ideal width, so the meta never gets pushed off the row.
                .layoutPriority(-1)
                .frame(
                    maxWidth: layoutMetrics.isWideLayout
                        ? .infinity : WorkspaceListMetrics.compactTitleMaximumWidth,
                    alignment: .leading
                )
            // Why: reserve a small trailing gutter before the activity column. Without it
            // SwiftUI holds a long branch name at its intrinsic width and never ellipsizes.
            Spacer(minLength: 6)
            metaGlyphs
        }
        .frame(
            maxWidth: .infinity, minHeight: WorkspaceListMetrics.titleLineHeight,
            alignment: .leading
        )
        .padding(.trailing, 6)
    }

    @ViewBuilder
    private var metaGlyphs: some View {
        let hasComment = !workspace.comment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if hasComment {
            YiruIcon(.chat, size: WorkspaceListMetrics.standardIcon)
                .foregroundStyle(Theme.Colors.mutedForeground)
        }
    }

    private var unreadIndicator: some View {
        Group {
            if workspace.isUnread {
                YiruIcon(
                    .bellDot,
                    size: WorkspaceListMetrics.standardIcon
                )
                .foregroundStyle(Theme.Colors.unread)
                .frame(height: WorkspaceListMetrics.titleLineHeight)
                .accessibilityLabel("Unread activity")
            }
        }
        .frame(width: WorkspaceListMetrics.leadingColumn)
    }

    @ViewBuilder
    private var projectRail: some View {
        if isNestedUnderProject {
            GeometryReader { proxy in
                let hairline = 1 / displayScale
                ZStack(alignment: .topLeading) {
                    Rectangle()
                        .fill(Theme.Colors.rail)
                        .frame(
                            width: hairline,
                            height: state.endsProjectRail ? 16 : proxy.size.height
                        )
                        .offset(x: 20, y: 0)
                    Rectangle()
                        .fill(Theme.Colors.rail)
                        .frame(
                            width: 12 + CGFloat(state.lineageDepth) * 16,
                            height: hairline
                        )
                        .offset(x: 20, y: 16)
                }
            }
            .allowsHitTesting(false)
        }
    }

    private var folderMeta: String? {
        guard workspace.kind == .folderWorkspace else { return nil }
        let comment = workspace.comment.trimmingCharacters(in: .whitespacesAndNewlines)
        if !comment.isEmpty { return comment }
        if !workspace.path.isEmpty { return workspace.path }
        return String(localized: "Folder")
    }

    private var leadingPadding: CGFloat {
        if !isNestedUnderProject, state.lineageDepth > 0 {
            return CGFloat(state.lineageDepth + 1) * 16
        }
        return 10
    }

    private var statusIndent: CGFloat {
        isNestedUnderProject ? CGFloat(state.lineageDepth) * 16 : 0
    }
}

import SwiftUI

struct WorkspaceActionsSheet: View {
    let workspace: WorkspaceSummary
    let isBusy: Bool
    let showsAgentHistory: Bool
    let showSourceControl: () -> Void
    let showAgentHistory: () -> Void
    let sleep: () -> Void
    let togglePin: () -> Void
    let remove: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isConfirmingDelete = false

    var body: some View {
        VStack(spacing: 0) {
            header
            Group {
                if isConfirmingDelete {
                    deleteConfirmation
                } else {
                    actionList
                }
            }
            .padding(.horizontal, Theme.Spacing.page)
            .padding(.bottom, Theme.Spacing.standard)
        }
        .appSheetPresentation(
            .fixed(.height(isConfirmingDelete ? 250 : showsAgentHistory ? 356 : 308))
        )
        .presentationBackground(Theme.Colors.background)
        .interactiveDismissDisabled(isBusy)
    }

    private var header: some View {
        HStack(spacing: Theme.Spacing.standard) {
            GlassHeaderButton(
                iconName: .x,
                accessibilityLabel: "Close sheet",
                action: { dismiss() }
            )
            Text(
                verbatim: isConfirmingDelete
                    ? String(localized: "Delete Worktree")
                    : workspace.name.isEmpty ? workspace.repoName : workspace.name
            )
            .font(.system(size: Theme.Typography.primary, weight: .semibold))
            .foregroundStyle(Theme.Colors.foreground)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, Theme.Spacing.page)
        .padding(.top, Theme.Spacing.standard)
        .padding(.bottom, Theme.Spacing.huge)
    }

    private var actionList: some View {
        VStack(spacing: 0) {
            if !workspace.branch.isEmpty {
                Text(verbatim: workspace.branch)
                    .font(.system(size: Theme.Typography.metadata))
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, Theme.Spacing.small)
            }
            ContentSurface {
                VStack(spacing: 0) {
                    actionButton(
                        title: String(localized: "Source Control"),
                        glyph: .gitMerge,
                        action: showSourceControl
                    )
                    Divider()
                    if showsAgentHistory {
                        actionButton(
                            title: String(localized: "Agent Session History"),
                            glyph: .history,
                            action: showAgentHistory
                        )
                        Divider()
                    }
                    actionButton(
                        title: String(localized: "Sleep"),
                        glyph: .moon,
                        action: sleep
                    )
                    Divider()
                    actionButton(
                        title: String(localized: workspace.isPinned ? "Unpin" : "Pin"),
                        glyph: .pushPin,
                        action: togglePin
                    )
                    Divider()
                    actionButton(
                        title: String(localized: "Delete"),
                        glyph: .trash,
                        color: Theme.Colors.attention,
                        iconColor: Theme.Colors.attention,
                        action: { isConfirmingDelete = true }
                    )
                }
            }
        }
        .overlay {
            if isBusy {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme.Colors.content.opacity(0.8))
            }
        }
    }

    private var deleteConfirmation: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(
                "Delete \(workspace.name.isEmpty ? workspace.repoName : workspace.name) (\(workspace.branch))?"
            )
            .font(.system(size: Theme.Typography.supporting))
            .foregroundStyle(Theme.Colors.mutedForeground)
            .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: Theme.Spacing.small) {
                Button("Cancel") { isConfirmingDelete = false }
                    .buttonStyle(.glass)
                    .frame(maxWidth: .infinity)
                    .appButtonContext(.regular)
                Button("Delete", role: .destructive, action: remove)
                    .buttonStyle(.glassProminent)
                    .tint(Theme.Colors.attention)
                    .frame(maxWidth: .infinity)
                    .appButtonContext(.regular)
            }
        }
        .padding(.top, Theme.Spacing.small)
        .frame(maxHeight: .infinity, alignment: .top)
    }

    private func actionButton(
        title: String,
        glyph: AgentStartIconID,
        color: Color = Theme.Colors.foreground,
        iconColor: Color = Theme.Colors.mutedForeground,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(
                    glyph,
                    size: Theme.Control.inlineIcon
                )
                .foregroundStyle(iconColor)
                Text(verbatim: title)
                    .font(.system(size: Theme.Typography.supporting))
                    .foregroundStyle(color)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, Theme.Spacing.medium)
            .frame(minHeight: WorkspaceListMetrics.rowMinimumHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.appPlain)
        .disabled(isBusy)
    }
}

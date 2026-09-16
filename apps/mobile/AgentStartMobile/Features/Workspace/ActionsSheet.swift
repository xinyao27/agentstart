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
            actionList
                .padding(.horizontal, Theme.Spacing.page)
                .padding(.bottom, Theme.Spacing.standard)
        }
        // Why: one fixed height. The delete confirmation used to swap the sheet's contents for a
        // Cancel/Delete pair and grow the detent to 250pt, which is a heavier interaction than
        // the platform dialog and inconsistent with every other destructive action in the app.
        .appSheetPresentation(.fixed(.height(showsAgentHistory ? 356 : 308)))
        .presentationBackground(Theme.Colors.background)
        .interactiveDismissDisabled(isBusy)
        .confirmationDialog(
            "Delete \(displayName) (\(workspace.branch))?",
            isPresented: $isConfirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive, action: remove)
            Button("Cancel", role: .cancel) {}
        }
    }

    private var displayName: String {
        workspace.name.isEmpty ? workspace.repoName : workspace.name
    }

    private var header: some View {
        HStack(spacing: Theme.Spacing.standard) {
            GlassHeaderButton(
                iconName: .x,
                accessibilityLabel: "Close sheet",
                action: { dismiss() }
            )
            Text(verbatim: displayName)
                .font(Theme.Typography.primary.weight(.semibold))
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
                    .font(Theme.Typography.metadata)
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
                    .font(Theme.Typography.supporting)
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

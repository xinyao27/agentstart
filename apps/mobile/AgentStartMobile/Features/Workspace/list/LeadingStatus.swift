import SwiftUI

struct WorkspaceLeadingStatus: View {
    let workspace: WorkspaceSummary

    var body: some View {
        Group {
            switch workspaceListActivity(workspace) {
            case .working:
                AgentStartLoader(
                    size: WorkspaceListMetrics.workspaceLoader
                )
                .frame(
                    width: WorkspaceListMetrics.workspaceLoader,
                    height: WorkspaceListMetrics.workspaceLoader
                )
            case .permission:
                statusDot(Theme.Colors.attention)
            case .active, .done, .inactive:
                if workspace.linkedPullRequest != nil {
                    AgentStartIcon(
                        .gitPullRequest,
                        size: WorkspaceListMetrics.standardIcon
                    )
                    .foregroundStyle(pullRequestTint)
                } else if !workspace.branch.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                {
                    AgentStartIcon(
                        .gitMerge,
                        size: WorkspaceListMetrics.standardIcon
                    )
                    .foregroundStyle(Theme.Colors.mutedForeground)
                } else {
                    statusDot(
                        workspaceListActivity(workspace) == .inactive
                            ? Theme.Colors.statusNeutral : Theme.Colors.success
                    )
                }
            }
        }
        .frame(
            width: WorkspaceListMetrics.leadingColumn,
            height: WorkspaceListMetrics.leadingColumn
        )
        // Why: this column is a loader or a colored dot, so without a label VoiceOver announced the
        // workspace name and dropped "needs permission" entirely.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(statusAccessibilityLabel))
    }

    private var statusAccessibilityLabel: LocalizedStringResource {
        switch workspaceListActivity(workspace) {
        case .working: "Working"
        case .permission: "Waiting for permission"
        case .active: "Active"
        case .done: "Done"
        case .inactive: "Inactive"
        }
    }

    private func statusDot(_ color: Color) -> some View {
        Circle()
            .fill(color)
            .frame(width: WorkspaceListMetrics.statusDot, height: WorkspaceListMetrics.statusDot)
    }

    private var pullRequestTint: Color {
        switch workspace.linkedPullRequest?.state.lowercased() {
        case "merged": Theme.Colors.reviewMerged
        case "closed": Theme.Colors.attention
        case "open": Theme.Colors.reviewOpen
        default: Theme.Colors.mutedForeground
        }
    }
}

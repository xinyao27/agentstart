import SwiftUI

struct TerminalWorkspaceMenu: View {
    let workspace: WorkspaceSummary
    let quickCommandsAvailable: Bool
    let agentHistoryAvailable: Bool
    let showQuickCommands: () -> Void
    let showFiles: () -> Void
    let showSourceControl: () -> Void
    let showAgentHistory: () -> Void

    var body: some View {
        Menu {
            if quickCommandsAvailable {
                Button(action: showQuickCommands) {
                    Label("Quick commands", iconID: .arrowRight)
                }
            }
            Button(action: showFiles) {
                Label("Open file explorer", iconID: .folder)
            }
            if workspace.kind == .git {
                Button(action: showSourceControl) {
                    Label("Open source control", iconID: .gitBranch)
                }
                if agentHistoryAvailable {
                    Button(action: showAgentHistory) {
                        Label("Agent History", iconID: .history)
                    }
                }
            }
        } label: {
            AgentStartToolbarIcon(.more)
        }
        .accessibilityLabel("More session actions")
    }
}

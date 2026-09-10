import SwiftUI

struct WorkspaceListToolbar: ToolbarContent {
    let model: WorkspaceListModel
    @Binding var isSearchPresented: Bool
    @Binding var isCreationPresented: Bool
    let leaveHost: (() -> Void)?
    let hideSidebar: (() -> Void)?
    let showAccounts: () -> Void

    var body: some ToolbarContent {
        if let leaveHost {
            ToolbarItem(placement: .topBarLeading) {
                Button(action: leaveHost) {
                    AgentStartToolbarIcon(.arrowLeft)
                }
                .accessibilityLabel("Back to hosts")
            }
        }
        // Why: each action gets its own circular glass target. Separate toolbar items avoid
        // SwiftUI's automatic grouped capsule, which changes both the width and the corner
        // geometry of this header.
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                isSearchPresented = true
            } label: {
                AgentStartToolbarIcon(.search)
            }
            .accessibilityLabel("Search workspaces")
        }
        ToolbarSpacer(.fixed, placement: .topBarTrailing)
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button {
                    isCreationPresented = true
                } label: {
                    Label("New workspace", iconID: .add)
                }
                .disabled(!model.canUseHost)
                Button(action: showAccounts) {
                    Label("Accounts", iconID: .account)
                }
                .disabled(!model.canUseHost)
                if model.showsReconnect {
                    Button {
                        Task { await model.reconnectAndLoad() }
                    } label: {
                        Label("Reconnect", iconID: .refresh)
                    }
                }
                if let hideSidebar {
                    Button(action: hideSidebar) {
                        Label("Hide sidebar", iconID: .sidebar)
                    }
                }
            } label: {
                AgentStartToolbarIcon(.more)
            }
            .accessibilityLabel("More actions")
        }
    }
}

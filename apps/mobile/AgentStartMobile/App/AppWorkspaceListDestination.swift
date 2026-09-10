import SwiftUI

struct AppWorkspaceListDestinationView: View {
    let host: HostProfile
    let presentation: WorkspaceListPresentation
    let model: AppModel
    let leaveHost: (() -> Void)?
    let hideSidebar: (() -> Void)?
    let replaceDetail: ((AppRoute) -> Void)?

    var body: some View {
        // Why: a host root can be reused while a deep link changes its presentation
        // (for example, an open Create Workspace sheet followed by Accounts). Giving
        // the presentation its own identity clears sheet-local state before the new
        // child route is rendered instead of leaving the old sheet above it.
        WorkspaceListView(
            host: host,
            repository: model.dependencies.workspaceRepository,
            creationRepository: model.dependencies.workspaceCreationRepository,
            agentHistoryRepository: model.dependencies.agentHistoryRepository,
            hostRepository: model.dependencies.hostRepository,
            connectionRuntime: model.dependencies.hostConnectionRuntime,
            presentation: presentation,
            showAccounts: {
                replaceDetail?(.accounts(host)) ?? model.showAccounts(host)
            },
            showSourceControl: { workspace in
                replaceDetail?(.sourceControl(host, workspace, .changes))
                    ?? model.showSourceControl(host: host, workspace: workspace)
            },
            showAgentHistory: { workspace in
                replaceDetail?(.agentHistory(host, workspace))
                    ?? model.showAgentHistory(host: host, workspace: workspace)
            },
            showPairing: model.showPairing,
            hostsChanged: model.hostsDidChange,
            leaveHost: leaveHost,
            hideSidebar: hideSidebar,
            selectWorkspace: { workspace, initialTab in
                if let replaceDetail {
                    model.dependencies.recentWorkspaceStore.save(host: host, workspace: workspace)
                    replaceDetail(.workspaceSession(host, workspace, initialTab))
                } else {
                    model.showWorkspaceSession(
                        host: host,
                        workspace: workspace,
                        initialTab: initialTab
                    )
                }
            }
        )
        .id(presentation)
    }
}

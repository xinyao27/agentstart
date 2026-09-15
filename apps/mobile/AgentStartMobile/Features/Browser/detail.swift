import SwiftUI

struct BrowserTabDetailView: View {
    let host: HostProfile
    let tab: BrowserTabSummary

    @State private var isConnected = false

    private let repository: any WorkspaceBrowserRepository
    private let connectionRuntime: any HostConnectionRuntime

    init(
        host: HostProfile,
        tab: BrowserTabSummary,
        repository: any WorkspaceBrowserRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.host = host
        self.tab = tab
        self.repository = repository
        self.connectionRuntime = connectionRuntime
    }

    var body: some View {
        WorkspaceBrowserPane(
            hostID: host.id,
            worktreeID: tab.worktreeID ?? "",
            descriptor: descriptor,
            isVisible: true,
            repository: repository,
            connectionReady: isConnected
        )
        .background { AppBackground() }
        .navigationTitle(tab.displayTitle)
        .navigationBarTitleDisplayMode(.inline)
        .task { await observeConnection() }
    }

    // Why: a tab opened from the browser list has no session snapshot behind it, and the tab
    // record carries no history state, so Back/Forward start enabled and the browser treats a
    // navigation with nowhere to go as a no-op.
    private var descriptor: WorkspaceBrowserTab {
        WorkspaceBrowserTab(
            workspaceID: tab.worktreeID ?? "",
            pageID: tab.pageID,
            url: tab.url,
            isLoading: false,
            canGoBack: true,
            canGoForward: true
        )
    }

    private func observeConnection() async {
        let updates = await connectionRuntime.connectionSnapshots(forHostIDs: [host.id])
        for await update in updates {
            guard !Task.isCancelled else { return }
            isConnected = update[host.id]?.phase == .connected
        }
    }
}

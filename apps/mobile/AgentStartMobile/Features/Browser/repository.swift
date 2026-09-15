nonisolated protocol BrowserTabsRepository: Sendable {
    func browserTabs(for hostID: String) async throws -> [BrowserTabSummary]
    func switchBrowserTab(hostID: String, pageID: String) async throws
    func closeBrowserTab(hostID: String, pageID: String) async throws
    /// Opens a desktop tab. An absent URL asks the browser for its own new-tab page.
    func createBrowserTab(hostID: String, url: String?) async throws -> String
}

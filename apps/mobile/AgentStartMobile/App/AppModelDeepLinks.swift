import Foundation

@MainActor
extension AppModel {
    func handleOpenURL(_ url: URL) {
        // Why: a deep link is an explicit navigation request and must not be
        // hidden behind a notification or activity presentation that belongs
        // to the previous route.
        isActivityInsightsPresented = false
        isNotificationOptInPresented = false
        if isPairingLink(url) {
            do {
                routes = [.pairConfirm(try PairingCodeDecoder().decode(url.absoluteString))]
            } catch {
                routes = [.pairLinkError(hasPairingCode(url) ? .invalidCode : .missingCode)]
            }
            return
        }
        guard let deepLink = AppDeepLink(url: url) else { return }
        deepLinkTask?.cancel()
        deepLinkTask = Task { await open(deepLink) }
    }

    func isPairingLink(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "agentstart" && url.host?.lowercased() == "pair"
    }

    func hasPairingCode(_ url: URL) -> Bool {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return false
        }
        let queryCode = components.queryItems?.first(where: { $0.name == "code" })?.value
        return queryCode?.isEmpty == false || components.fragment?.isEmpty == false
    }

    func open(_ deepLink: AppDeepLink) async {
        isNotificationOptInPresented = false
        switch deepLink {
        case .home:
            routes = []
        case .staticRoute(let route):
            if route == .activityInsights {
                routes = []
                isActivityInsightsPresented = true
            } else {
                isActivityInsightsPresented = false
                routes = [route]
            }
        case .host(let hostID, let presentation):
            isActivityInsightsPresented = false
            guard let host = await host(hostID) else { return }
            routes = [.workspaces(host, presentation)]
        case .hostDetail(let hostID, let detail):
            isActivityInsightsPresented = false
            guard let host = await host(hostID) else { return }
            let root = AppRoute.workspaces(host, .standard)
            switch detail {
            case .accounts: routes = [root, .accounts(host)]
            case .browser: routes = [root, .browser(host)]
            case .edit: routes = [root, .editHost(host)]
            }
        case .hostBrowserNewTab(let hostID, let url):
            isActivityInsightsPresented = false
            guard let host = await host(hostID) else { return }
            routes = [.workspaces(host, .standard), .browserNewTab(host, url)]
        case .hostBrowserTab(let hostID, let pageID):
            isActivityInsightsPresented = false
            guard let host = await host(hostID) else { return }
            // Why: a tab link names only the page. The browser list resolves the title and URL,
            // and the stream's ready event fills the address bar once it attaches.
            routes = [
                .workspaces(host, .standard),
                .browser(host),
                .browserTab(
                    host,
                    BrowserTabSummary(
                        pageID: pageID,
                        title: "",
                        url: "",
                        isActive: false,
                        worktreeID: nil
                    )
                ),
            ]
        case .workspace(let hostID, let worktreeID, let destination):
            isActivityInsightsPresented = false
            guard let resolved = await resolveWorkspace(hostID: hostID, worktreeID: worktreeID)
            else {
                return
            }
            let (host, workspace) = resolved
            let root = AppRoute.workspaces(host, .standard)
            switch destination {
            case .session:
                dependencies.recentWorkspaceStore.save(host: host, workspace: workspace)
                routes = [root, .workspaceSession(host, workspace, nil)]
            case .files:
                routes = [root, .files(host, workspace)]
            case .agentHistory:
                routes = [root, .agentHistory(host, workspace)]
            case .sourceControl(let tab):
                routes = [root, .sourceControl(host, workspace, tab)]
            case .review(let target):
                routes = [root, .sourceReview(host, workspace, target)]
            case .filePreview(let target):
                routes = [root, .files(host, workspace), .filePreview(host, workspace, target)]
            }
        }
    }

    func host(_ id: String) async -> HostProfile? {
        try? await dependencies.hostRepository.hosts().first { $0.id == id }
    }

    // Why: a launch-time deep link is delivered before the first host connection exists, so
    // the workspace snapshot it needs cannot be read yet. Retrying across the cold-start
    // window keeps an explicit navigation request from being dropped silently.
    private func resolveWorkspace(
        hostID: String,
        worktreeID: String
    ) async -> (host: HostProfile, workspace: WorkspaceSummary)? {
        for delay in [0, 400, 1_200, 2_500, 4_000] {
            if delay > 0 {
                do {
                    try await Task.sleep(for: .milliseconds(delay))
                } catch {
                    return nil
                }
            }
            guard
                let host = await host(hostID),
                let snapshot = try? await dependencies.workspaceRepository.workspaces(
                    for: host.id
                ),
                let workspace = snapshot.workspaces.first(where: {
                    Self.matchesDeepLinkWorkspace($0, worktreeID: worktreeID)
                })
            else {
                continue
            }
            return (host, workspace)
        }
        return nil
    }

    private static func matchesDeepLinkWorkspace(
        _ workspace: WorkspaceSummary,
        worktreeID: String
    ) -> Bool {
        guard workspace.id != worktreeID else { return true }
        // Why: IDs persisted by the previous client and by this app can carry different
        // repository prefixes, while the absolute worktree path stays the stable identity a
        // deep link can be resolved against.
        guard let separator = worktreeID.range(of: "::", options: .backwards) else { return false }
        return workspace.path == String(worktreeID[separator.upperBound...])
    }
}

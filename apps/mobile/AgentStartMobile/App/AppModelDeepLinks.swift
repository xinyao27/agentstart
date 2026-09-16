import Foundation

@MainActor
extension AppModel {
    func handleOpenURL(_ url: URL) {
        // Why: a deep link is an explicit navigation request and must not be hidden behind a
        // notification presentation that belongs to the previous route.
        isNotificationOptInPresented = false
        if isPairingLink(url) {
            do {
                setRoutes(
                    [.pairConfirm(try PairingCodeDecoder().decode(url.absoluteString))],
                    for: .home
                )
            } catch {
                setRoutes(
                    [.pairLinkError(hasPairingCode(url) ? .invalidCode : .missingCode)],
                    for: .home
                )
            }
            selectedTab = .home
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
            navigate(to: [], in: .home)
        case .settings:
            navigate(to: [], in: .settings)
        case .activityInsights:
            navigate(to: [.activityInsights], in: .home)
        case .staticRoute(let route):
            navigate(to: [route], in: route.tab)
        case .host(let hostID, let presentation):
            guard let host = await host(hostID) else { return }
            navigate(to: [.workspaces(host, presentation)], in: .home)
        case .hostDetail(let hostID, let detail):
            guard let host = await host(hostID) else { return }
            let root = AppRoute.workspaces(host, .standard)
            switch detail {
            case .accounts: navigate(to: [root, .accounts(host)], in: .home)
            case .browser: navigate(to: [root, .browser(host)], in: .home)
            case .edit: navigate(to: [root, .editHost(host)], in: .home)
            }
        case .hostBrowserNewTab(let hostID, let url):
            guard let host = await host(hostID) else { return }
            navigate(to: [.workspaces(host, .standard), .browserNewTab(host, url)], in: .home)
        case .hostBrowserTab(let hostID, let pageID):
            guard let host = await host(hostID) else { return }
            // Why: a tab link names only the page. The browser list resolves the title and URL,
            // and the stream's ready event fills the address bar once it attaches.
            navigate(
                to: [
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
                ],
                in: .home
            )
        case .workspace(let hostID, let worktreeID, let destination):
            guard let resolved = await resolveWorkspace(hostID: hostID, worktreeID: worktreeID)
            else {
                return
            }
            let (host, workspace) = resolved
            let root = AppRoute.workspaces(host, .standard)
            switch destination {
            case .session:
                dependencies.recentWorkspaceStore.save(host: host, workspace: workspace)
                navigate(to: [root, .workspaceSession(host, workspace, nil)], in: .home)
            case .files:
                navigate(to: [root, .files(host, workspace)], in: .home)
            case .agentHistory:
                navigate(to: [root, .agentHistory(host, workspace)], in: .home)
            case .sourceControl(let tab):
                navigate(to: [root, .sourceControl(host, workspace, tab)], in: .home)
            case .review(let target):
                navigate(to: [root, .sourceReview(host, workspace, target)], in: .home)
            case .filePreview(let target):
                navigate(
                    to: [root, .files(host, workspace), .filePreview(host, workspace, target)],
                    in: .home
                )
            }
        }
    }

    // Why: a deep link replaces its target tab's history and brings that tab forward. Assigning
    // both together is what keeps a link from landing in a stack the user cannot see.
    private func navigate(to routes: [AppRoute], in tab: AppTab) {
        setRoutes(routes, for: tab)
        selectedTab = tab
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

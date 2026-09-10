import Foundation

nonisolated enum AppDeepLink {
    case home
    case staticRoute(AppRoute)
    case host(String, WorkspaceListPresentation)
    case hostDetail(String, HostDetail)
    case workspace(String, String, WorkspaceDestination)

    enum HostDetail: Sendable {
        case accounts
        case edit
    }

    enum WorkspaceDestination: Sendable {
        case session
        case files
        case agentHistory
        case sourceControl(SourceControlHubTab)
        case review(SourceReviewTarget)
        case filePreview(WorkspaceFilePreviewTarget)
    }

    init?(url: URL) {
        guard url.scheme?.lowercased() == "agentstart" else { return nil }
        let query = Self.query(url)
        let segments = Self.segments(url)
        guard let first = segments.first else {
            self = .home
            return
        }
        if let route = Self.staticRoute(first) {
            self = .staticRoute(route)
            return
        }
        guard first == "h", segments.count >= 2 else { return nil }
        let hostID = segments[1]
        guard segments.count >= 3 else {
            self = .host(
                hostID,
                query["action"] == "newWorktree" ? .createWorkspace : .standard
            )
            return
        }
        switch segments[2] {
        case "accounts": self = .hostDetail(hostID, .accounts)
        case "edit": self = .hostDetail(hostID, .edit)
        case "session":
            guard segments.count >= 4 else { return nil }
            self = .workspace(hostID, segments[3...].joined(separator: "/"), .session)
        case "agent-history":
            guard segments.count >= 4 else { return nil }
            self = .workspace(hostID, segments[3...].joined(separator: "/"), .agentHistory)
        case "source-control":
            guard segments.count >= 4 else { return nil }
            self = .workspace(
                hostID,
                segments[3...].joined(separator: "/"),
                .sourceControl(Self.sourceTab(query["tab"]))
            )
        case "pr":
            guard segments.count >= 4 else { return nil }
            self = .workspace(
                hostID,
                segments[3...].joined(separator: "/"),
                .sourceControl(.pullRequest)
            )
        case "history":
            guard segments.count >= 4 else { return nil }
            self = .workspace(
                hostID,
                segments[3...].joined(separator: "/"),
                .sourceControl(.history)
            )
        case "review":
            guard segments.count >= 4 else { return nil }
            self = .workspace(
                hostID,
                segments[3...].joined(separator: "/"),
                .review(Self.reviewTarget(query))
            )
        case "files":
            guard segments.count >= 4 else { return nil }
            if segments[3] == "preview", segments.count >= 5,
                let target = Self.previewTarget(
                    hostID: hostID,
                    worktreeID: segments[4...].joined(separator: "/"),
                    query: query
                )
            {
                self = .workspace(
                    hostID,
                    segments[4...].joined(separator: "/"),
                    .filePreview(target)
                )
            } else {
                self = .workspace(hostID, segments[3...].joined(separator: "/"), .files)
            }
        default: return nil
        }
    }

    private static func segments(_ url: URL) -> [String] {
        // Why: worktree IDs contain an absolute path. Splitting the decoded URL path turns an
        // encoded slash inside that ID into a route segment before the parser can reconstruct it.
        let encodedPath =
            URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath
            ?? url.path
        var values = encodedPath.split(separator: "/").map {
            String($0).removingPercentEncoding ?? String($0)
        }
        if let host = url.host, !host.isEmpty, host != "pair" {
            values.insert(host.removingPercentEncoding ?? host, at: 0)
        }
        return values
    }

    private static func query(_ url: URL) -> [String: String] {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return Dictionary(items.compactMap { item in item.value.map { (item.name, $0) } }) {
            first, _ in first
        }
    }

    private static func staticRoute(_ path: String) -> AppRoute? {
        switch path {
        case "about": .about
        case "activity-insights": .activityInsights
        case "appearance-settings": .appearanceSettings
        case "browser-settings": .browserSettings
        case "connection-log": .connectionLog
        case "notifications": .notificationSettings
        case "pair", "pair-scan": .pair
        case "settings": .settings
        case "terminal-settings": .terminalSettings
        case "troubleshoot": .troubleshooting
        default: nil
        }
    }

    private static func sourceTab(_ rawValue: String?) -> SourceControlHubTab {
        switch rawValue {
        case "pr": .pullRequest
        case "history": .history
        default: .changes
        }
    }

    private static func reviewTarget(_ query: [String: String]) -> SourceReviewTarget {
        SourceReviewTarget(
            filePath: query["file"],
            scope: SourceReviewScope(rawValue: query["area"] ?? ""),
            filter: SourceReviewFilter(rawValue: query["scope"] ?? "")
        )
    }

    private static func previewTarget(
        hostID: String,
        worktreeID: String,
        query: [String: String]
    ) -> WorkspaceFilePreviewTarget? {
        let title = query["name"]
        let line = positiveInteger(query["line"])
        let column = positiveInteger(query["column"])
        if query["source"] == "terminalArtifact" {
            guard let absolutePath = query["absolutePath"], let grantID = query["grantId"]
            else { return nil }
            return WorkspaceFilePreviewTarget(
                source: .terminalArtifact(
                    TerminalArtifactSource(
                        hostID: hostID,
                        worktreeID: worktreeID,
                        absolutePath: absolutePath,
                        grantID: grantID,
                        terminalID: query["terminal"],
                        pathText: query["pathText"] ?? absolutePath,
                        cwd: query["cwd"]
                    )
                ),
                title: title ?? URL(fileURLWithPath: absolutePath).lastPathComponent,
                line: line,
                column: column
            )
        }
        guard let relativePath = query["relativePath"] else { return nil }
        return WorkspaceFilePreviewTarget(
            source: .worktree(relativePath: relativePath),
            title: title ?? URL(fileURLWithPath: relativePath).lastPathComponent,
            line: line,
            column: column
        )
    }

    private static func positiveInteger(_ value: String?) -> Int? {
        guard let value, let parsed = Int(value), parsed > 0 else { return nil }
        return parsed
    }
}

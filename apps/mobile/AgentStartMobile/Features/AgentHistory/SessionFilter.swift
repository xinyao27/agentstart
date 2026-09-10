import Foundation

nonisolated struct AgentHistoryGroup: Identifiable, Sendable {
    let id: String
    let label: String
    let sessions: [AgentHistorySession]
}

nonisolated enum AgentHistorySessionFilter {
    // Why: filter to the supported mobile agent catalog so provider transcripts this app
    // cannot resume never appear in the history list or its resume affordance.
    private static let supportedAgents: Set<String> = [
        "claude", "codex", "hermes", "pi", "omp", "cursor", "gemini", "antigravity",
        "rovo", "copilot", "opencode", "grok", "openclaw", "devin", "droid", "kimi",
    ]

    static func groups(
        sessions: [AgentHistorySession],
        scope: AgentHistoryScope,
        scopePaths: [String],
        query: String
    ) -> [AgentHistoryGroup] {
        guard query.lengthOfBytes(using: .utf8) <= 2 * 1_024 else { return [] }
        let tokens = queryTokens(query)
        let filtered = sessions.filter { session in
            guard supportedAgents.contains(session.agent) else { return false }
            // Why: mirrors isAiVaultSessionResumableContent/isAiVaultSessionRecoverableEmpty —
            // a preview made only of tool/system messages (no user/assistant turn) with
            // zero messageCount and no queued/subagent signal is still "empty" and hidden.
            let hasContent =
                session.messageCount > 0
                || session.previewMessages.contains { $0.role == "user" || $0.role == "assistant" }
                || session.queuedMessageCount > 0 || session.subagentTranscriptCount > 0
            guard hasContent else { return false }
            if scope != .all, !scopePaths.isEmpty {
                guard let cwd = session.cwd,
                    scopePaths.contains(where: { isInside(base: $0, candidate: cwd) })
                else { return false }
            }
            return matches(session, tokens: tokens)
        }
        .sorted { left, right in
            (left.updatedDate ?? .distantPast) > (right.updatedDate ?? .distantPast)
        }

        var order: [String] = []
        var grouped: [String: [AgentHistorySession]] = [:]
        var labels: [String: String] = [:]
        for session in filtered {
            let key = normalized(session.cwd ?? "unknown")
            if grouped[key] == nil { order.append(key) }
            grouped[key, default: []].append(session)
            labels[key] = session.folderLabel
        }
        return order.map {
            AgentHistoryGroup(id: $0, label: labels[$0] ?? "", sessions: grouped[$0] ?? [])
        }
    }

    static func scopePaths(
        scope: AgentHistoryScope,
        workspace: WorkspaceSummary,
        workspaces: [WorkspaceSummary]
    ) -> [String] {
        guard scope != .all else { return [] }
        let candidates =
            scope == .workspace
            ? [workspace]
            : workspaces.filter { $0.repoID == workspace.repoID }
        var values: [String] = []
        for candidate in candidates.prefix(64) {
            let path = candidate.path.trimmingCharacters(in: .whitespacesAndNewlines)
            guard isAbsolute(path) else { continue }
            guard !values.contains(where: { comparisonPath($0) == comparisonPath(path) }) else {
                continue
            }
            values.append(path)
        }
        return values
    }

    private static func matches(_ session: AgentHistorySession, tokens: [String]) -> Bool {
        guard !tokens.isEmpty else { return true }
        let general = [
            session.title,
            session.sessionID,
            session.agent,
            session.cwd ?? "",
            session.filePath,
            session.previewMessages.map(\.text).joined(separator: " "),
        ].joined(separator: " ").lowercased()
        let path = "\(session.cwd ?? "") \(session.filePath)".lowercased()
        let repo = session.folderLabel.lowercased()
        return tokens.allSatisfy { token in
            if token.hasPrefix("repo:") {
                return repo.contains(String(token.dropFirst(5)))
            }
            if token.hasPrefix("path:") {
                return path.contains(String(token.dropFirst(5)))
            }
            return general.contains(token)
        }
    }

    private static func queryTokens(_ query: String) -> [String] {
        var tokens: [String] = []
        var current = ""
        var quote: Character?
        for character in query.lowercased() {
            if character == "\"" || character == "'" {
                if quote == nil {
                    quote = character
                } else if quote == character {
                    quote = nil
                } else {
                    current.append(character)
                }
            } else if character.isWhitespace, quote == nil {
                if !current.isEmpty {
                    tokens.append(current)
                    current = ""
                }
            } else {
                current.append(character)
            }
        }
        if !current.isEmpty { tokens.append(current) }
        return tokens
    }

    private static func isInside(base: String, candidate: String) -> Bool {
        if isInsideNormalized(base: base, candidate: candidate) { return true }
        guard let linuxPath = wslLinuxPath(base) else { return false }
        return isInsideNormalized(base: linuxPath, candidate: candidate)
    }

    private static func normalized(_ path: String) -> String {
        path.replacingOccurrences(of: "\\", with: "/").lowercased()
    }

    private static func isInsideNormalized(base: String, candidate: String) -> Bool {
        let root = comparisonPath(base)
        let value = comparisonPath(candidate)
        guard !root.isEmpty else { return false }
        if value == root { return true }
        let boundary = root == "/" || isWindowsDriveRoot(root) ? root : "\(root)/"
        return value.hasPrefix(boundary)
    }

    private static func comparisonPath(_ path: String) -> String {
        let usesWindowsSemantics = isWindowsAbsolute(path)
        let source =
            usesWindowsSemantics
            ? path.replacingOccurrences(of: "\\", with: "/")
            : path
        let prefix =
            usesWindowsSemantics && (path.hasPrefix("\\\\") || path.hasPrefix("//"))
            ? "//" : ""
        let collapsed =
            source
            .split(separator: "/", omittingEmptySubsequences: true)
            .joined(separator: "/")
        var value =
            prefix.isEmpty
            ? (source.hasPrefix("/") ? "/\(collapsed)" : collapsed)
            : "//\(collapsed)"
        if value.count > 1, !isWindowsDriveRoot(value) {
            while value.hasSuffix("/") { value.removeLast() }
        }
        if let wsl = canonicalWSLPath(value) { return wsl }
        return usesWindowsSemantics ? value.lowercased() : value
    }

    private static func canonicalWSLPath(_ path: String) -> String? {
        let parts = path.split(separator: "/", omittingEmptySubsequences: true)
        guard parts.count >= 2 else { return nil }
        let server = parts[0].lowercased()
        guard server == "wsl.localhost" || server == "wsl$" else { return nil }
        let distro = parts[1].lowercased()
        let suffix = parts.dropFirst(2).joined(separator: "/")
        return suffix.isEmpty
            ? "//wsl.localhost/\(distro)"
            : "//wsl.localhost/\(distro)/\(suffix)"
    }

    private static func wslLinuxPath(_ path: String) -> String? {
        let canonical = comparisonPath(path)
        guard canonical.hasPrefix("//wsl.localhost/") else { return nil }
        let parts = canonical.split(separator: "/", omittingEmptySubsequences: true)
        guard parts.count >= 3 else { return "/" }
        return "/" + parts.dropFirst(2).joined(separator: "/")
    }

    private static func isAbsolute(_ path: String) -> Bool {
        path.hasPrefix("/") || isWindowsAbsolute(path)
    }

    private static func isWindowsAbsolute(_ path: String) -> Bool {
        if path.hasPrefix("\\\\") || path.hasPrefix("//") { return true }
        let characters = Array(path.prefix(3))
        return characters.count == 3
            && characters[0].isLetter
            && characters[1] == ":"
            && (characters[2] == "/" || characters[2] == "\\")
    }

    private static func isWindowsDriveRoot(_ path: String) -> Bool {
        let characters = Array(path)
        return characters.count == 3
            && characters[0].isLetter
            && characters[1] == ":"
            && characters[2] == "/"
    }
}

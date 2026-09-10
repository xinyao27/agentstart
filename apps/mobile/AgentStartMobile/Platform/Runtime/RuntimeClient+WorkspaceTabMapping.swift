import Foundation

extension RuntimeClient {
    func mapOpenTabs(_ wires: [MobileSessionTabWire]) -> [WorkspaceOpenTab] {
        wires.map { wire in
            let kind = WorkspaceOpenTabKind(rawValue: wire.type.rawValue) ?? .terminal
            let agentID = terminalAgentID(wire)
            return WorkspaceOpenTab(
                id: wire.id,
                title: openTabTitle(wire, kind: kind, agentID: agentID),
                kind: kind,
                isActive: wire.isActive,
                leafID: wire.leafId,
                terminalID: wire.terminal,
                agentID: agentID
            )
        }
    }

    private func terminalAgentID(_ wire: MobileSessionTabWire) -> String? {
        guard wire.type == .terminal else { return nil }
        if let resolvedAgentType = nonempty(wire.resolvedAgentType ?? "") {
            return resolvedAgentType
        }
        if let agentType = nonempty(wire.agentStatus?.agentType ?? ""), agentType != "unknown" {
            return agentType
        }
        if let launchAgent = nonempty(wire.launchAgent ?? "") {
            return launchAgent
        }
        return explicitTerminalTitleAgentID(wire.title)
    }

    private func openTabTitle(
        _ wire: MobileSessionTabWire,
        kind: WorkspaceOpenTabKind,
        agentID: String?
    ) -> String {
        switch kind {
        case .browser:
            let title = wire.title.trimmingCharacters(in: .whitespacesAndNewlines)
            if !title.isEmpty, !isBlankBrowserURL(title) {
                return title
            }
            return isBlankBrowserURL(wire.url ?? "") ? "New Browser" : "Browser"
        case .markdown:
            return wire.title.isEmpty ? "Markdown" : wire.title
        case .file:
            return wire.title.isEmpty ? "File" : wire.title
        case .terminal:
            guard agentID != nil else { return wire.title.isEmpty ? "Terminal" : wire.title }
            return stripLeadingAgentTitleDecoration(wire.title) ?? "Terminal"
        }
    }

    private func isBlankBrowserURL(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty || trimmed == "about:blank" || trimmed.hasPrefix("data:text/html")
    }

    private func stripLeadingAgentTitleDecoration(_ title: String) -> String? {
        let pattern = #"^(?:[✳✦⏲◇✋⠀-⣿]+|[.*]\s)\s*"#
        let range = title.startIndex..<title.endIndex
        let stripped = title.replacingOccurrences(
            of: pattern,
            with: "",
            options: .regularExpression,
            range: range
        ).trimmingCharacters(in: .whitespacesAndNewlines)
        return nonempty(stripped)
    }

    private func explicitTerminalTitleAgentID(_ title: String) -> String? {
        let value = title.lowercased()
        let namedAgents: [(tokens: [String], id: String)] = [
            (["openclaude"], "openclaude"),
            (["claude code", "claude"], "claude"),
            (["gemini cli", "gemini"], "gemini"),
            (["github copilot", "copilot"], "copilot"),
            (["antigravity", "agy"], "antigravity"),
            (["mimo code", "mimo"], "mimo-code"),
            (["opencode"], "opencode"),
            (["codex"], "codex"),
            (["grok"], "grok"),
            (["devin"], "devin"),
            (["aider"], "aider"),
            (["cursor"], "cursor"),
            (["droid"], "droid"),
            (["hermes"], "hermes"),
            (["omp"], "omp"),
            (["pi"], "pi"),
        ]
        for agent in namedAgents
        where agent.tokens.contains(where: { containsTitleToken(value, $0) }) {
            return agent.id
        }
        return nil
    }

    private func containsTitleToken(_ value: String, _ token: String) -> Bool {
        let escaped = NSRegularExpression.escapedPattern(for: token)
        let pattern = "(?<![a-z0-9])\(escaped)(?![a-z0-9])"
        return value.range(of: pattern, options: .regularExpression) != nil
    }
    private func nonempty(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

import Foundation

nonisolated enum TerminalWorkspaceTerminal: Hashable, Sendable {
    case pending
    case sleeping
    case ready(TerminalTarget)
}

nonisolated struct WorkspaceMarkdownTab: Hashable, Sendable {
    let relativePath: String
    let documentVersion: String
    let isHostDirty: Bool
}

nonisolated enum WorkspaceFileDiffSource: String, Hashable, Sendable {
    case staged
    case unstaged
}

nonisolated struct WorkspaceFileTab: Hashable, Sendable {
    let relativePath: String
    let language: String
    let diffSource: WorkspaceFileDiffSource?
}

nonisolated struct WorkspaceBrowserTab: Hashable, Sendable {
    let workspaceID: String
    let pageID: String?
    let url: String
    let isLoading: Bool
    let canGoBack: Bool
    let canGoForward: Bool
}

nonisolated enum TerminalWorkspaceTabContent: Hashable, Sendable {
    case terminal(TerminalWorkspaceTerminal)
    case markdown(WorkspaceMarkdownTab)
    case file(WorkspaceFileTab)
    case browser(WorkspaceBrowserTab)
}

nonisolated struct TerminalWorkspaceTab: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let isActive: Bool
    let isPinned: Bool
    let leafID: String?
    let content: TerminalWorkspaceTabContent
    let launchAgent: String?
    let resolvedAgentType: String?

    init(
        id: String,
        title: String,
        isActive: Bool,
        isPinned: Bool,
        leafID: String?,
        content: TerminalWorkspaceTabContent,
        launchAgent: String? = nil,
        resolvedAgentType: String? = nil
    ) {
        self.id = id
        self.title = title
        self.isActive = isActive
        self.isPinned = isPinned
        self.leafID = leafID
        self.content = content
        self.launchAgent = launchAgent
        self.resolvedAgentType = resolvedAgentType
    }

    var displayTitle: String {
        if case .browser(let browser) = content {
            let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedTitle.isEmpty,
                workspaceBrowserDisplayURL(trimmedTitle) != "about:blank"
            {
                return title
            }
            return workspaceBrowserDisplayURL(browser.url) == "about:blank"
                ? String(localized: "New Browser")
                : String(localized: "Browser")
        }
        guard terminalAgentID != nil else {
            return title
        }
        let decorations = CharacterSet(charactersIn: "✳✦⏲◇✋.* ")
        let cleaned = title.trimmingCharacters(in: decorations)
        return cleaned.isEmpty ? String(localized: "Terminal") : cleaned
    }

    var iconAssetName: String? {
        switch content {
        case .terminal:
            switch terminalAgentID {
            case "claude": "agent-claude"
            case "codex": "agent-openai"
            default: nil
            }
        case .markdown, .file, .browser:
            nil
        }
    }

    var iconGlyph: AgentStartIconID? {
        switch content {
        case .terminal:
            nil
        case .markdown:
            .fileText
        case .file:
            .file
        case .browser:
            .globe
        }
    }

    var usesTemplateIcon: Bool {
        iconAssetName != "agent-claude"
    }

    var terminalAgentID: String? {
        guard case .terminal = content else { return nil }
        let candidate = [resolvedAgentType, launchAgent]
            .compactMap { value -> String? in
                guard let value else { return nil }
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty || trimmed.lowercased() == "unknown" ? nil : trimmed
            }
            .first
        if let candidate {
            switch candidate.lowercased() {
            case "openai", "openai-codex", "codex": return "codex"
            case "claude", "claude-code": return "claude"
            default: return candidate
            }
        }
        return explicitTerminalAgentID(from: title)
    }

    var terminalTarget: TerminalTarget? {
        guard case .terminal(.ready(let target)) = content else { return nil }
        return target
    }

    var isSleepingTerminal: Bool {
        guard case .terminal(.sleeping) = content else { return false }
        return true
    }

    var isPendingTerminal: Bool {
        guard case .terminal(.pending) = content else { return false }
        return true
    }

    private func explicitTerminalAgentID(from value: String) -> String? {
        let normalizedTitle = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalizedTitle == "claude" || normalizedTitle.contains("claude code") {
            return "claude"
        }
        if normalizedTitle == "codex" || normalizedTitle.hasPrefix("codex ") {
            return "codex"
        }
        return nil
    }
}

nonisolated struct TerminalWorkspaceSnapshot: Sendable {
    let worktree: String
    let publicationEpoch: String
    let snapshotVersion: Int64
    let activeTabID: String?
    let tabs: [TerminalWorkspaceTab]
}

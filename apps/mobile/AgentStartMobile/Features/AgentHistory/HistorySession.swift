import Foundation

nonisolated enum AgentHistoryScope: String, CaseIterable, Sendable {
    case workspace
    case project
    case all
}

nonisolated struct AgentHistoryMessage: Hashable, Sendable {
    let role: String
    let text: String
    let timestamp: String?
}

nonisolated enum AgentHistorySessionPlatform: String, Hashable, Sendable {
    case darwin
    case linux
    case windows
    case unknown
}

nonisolated struct AgentHistoryDayTokens: Hashable, Sendable {
    let day: String
    let tokens: UInt64
}

nonisolated struct AgentHistoryTokenUsage: Hashable, Sendable {
    let provider: String?
    let model: String?
    let timestamp: String?
    let inputTokens: UInt64
    let outputTokens: UInt64
    let cacheReadTokens: UInt64
    let cacheWriteTokens: UInt64
    let reasoningOutputTokens: UInt64
    let totalTokens: UInt64
}

nonisolated enum AgentHistorySubagentStatus: String, Hashable, Sendable {
    case running
    case completed
    case failed
    case stopped
}

nonisolated struct AgentHistorySubagentInfo: Hashable, Sendable {
    let parentSessionID: String
    let agentType: String?
    let status: AgentHistorySubagentStatus?
}

nonisolated struct AgentHistorySession: Identifiable, Hashable, Sendable {
    let id: String
    let executionHostID: String
    let executionHostPlatform: AgentHistorySessionPlatform?
    let agent: String
    let sessionID: String
    let title: String
    let cwd: String?
    let branch: String?
    let model: String?
    let filePath: String
    let codexHome: String?
    let createdAt: String?
    let updatedAt: String?
    let modifiedAt: String
    let messageCount: Int
    let totalTokens: UInt64
    let tokensByDay: [AgentHistoryDayTokens]?
    let tokenUsage: [AgentHistoryTokenUsage]?
    let queuedMessageCount: Int
    let subagentTranscriptCount: Int
    let previewMessages: [AgentHistoryMessage]
    let lastUserPrompt: String?
    let resumeCommand: String
    let subagent: AgentHistorySubagentInfo?

    init(
        id: String,
        executionHostID: String,
        executionHostPlatform: AgentHistorySessionPlatform?,
        agent: String,
        sessionID: String,
        title: String,
        cwd: String?,
        branch: String?,
        model: String?,
        filePath: String,
        codexHome: String?,
        createdAt: String?,
        updatedAt: String?,
        modifiedAt: String,
        messageCount: Int,
        totalTokens: UInt64,
        tokensByDay: [AgentHistoryDayTokens]?,
        tokenUsage: [AgentHistoryTokenUsage]?,
        queuedMessageCount: Int,
        subagentTranscriptCount: Int,
        previewMessages: [AgentHistoryMessage],
        lastUserPrompt: String?,
        resumeCommand: String,
        subagent: AgentHistorySubagentInfo?
    ) {
        self.id = id
        self.executionHostID = executionHostID
        self.executionHostPlatform = executionHostPlatform
        self.agent = agent
        self.sessionID = sessionID
        self.title = title
        self.cwd = cwd
        self.branch = branch
        self.model = model
        self.filePath = filePath
        self.codexHome = codexHome
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.modifiedAt = modifiedAt
        self.messageCount = messageCount
        self.totalTokens = totalTokens
        self.tokensByDay = tokensByDay
        self.tokenUsage = tokenUsage
        self.queuedMessageCount = queuedMessageCount
        self.subagentTranscriptCount = subagentTranscriptCount
        self.previewMessages = previewMessages
        self.lastUserPrompt = lastUserPrompt
        self.resumeCommand = resumeCommand
        self.subagent = subagent
    }

    var displayTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? String(localized: "Untitled session") : title
    }

    var displayMessages: [AgentHistoryMessage] {
        let conversation = previewMessages.filter { $0.role == "user" || $0.role == "assistant" }
        return conversation.isEmpty ? previewMessages : conversation
    }

    var latestMessage: String {
        displayMessages.last?.text.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    var updatedDate: Date? {
        ISODateParser.date(updatedAt ?? modifiedAt)
    }

    var folderLabel: String {
        guard let cwd, !cwd.isEmpty else { return String(localized: "Unknown location") }
        let parts = cwd.replacingOccurrences(of: "\\", with: "/").split(separator: "/")
        return parts.suffix(2).joined(separator: "/")
    }

}

nonisolated struct AgentHistoryIssue: Hashable, Sendable {
    let executionHostID: String?
    let agent: String
    let path: String
    let message: String
}

nonisolated struct AgentHistorySnapshot: Sendable {
    let sessions: [AgentHistorySession]
    let issues: [AgentHistoryIssue]
    let scannedAt: String
}

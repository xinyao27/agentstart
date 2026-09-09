import Foundation
import YiruProtocol

nonisolated let agentHistoryRuntimeCapability = "aiVault.protobuf.v1"

extension RuntimeClient: AgentHistoryRepository {
    func supportsAgentHistory(for hostID: String) async throws -> Bool {
        let status = try await protocolStatus(
            hostID: hostID
        )
        return status.capabilities?.contains(agentHistoryRuntimeCapability) == true
    }

    func agentHistory(
        for hostID: String,
        scopePaths: [String],
        force: Bool
    ) async throws -> AgentHistorySnapshot {
        guard try await supportsAgentHistory(for: hostID) else {
            throw AgentHistoryRepositoryError.unsupported
        }
        let response = try await protocolAgentHistory(
            hostID: hostID,
            // Why: compact keeps a 500-session recency window below URLSession's frame limit.
            limit: 500,
            force: force,
            compact: true,
            scopePaths: scopePaths
        )
        try requireProtocolTimestamp(response.scannedAt)
        return AgentHistorySnapshot(
            sessions: try response.sessions.map(mapProtocolSession),
            issues: try response.issues.map(mapProtocolIssue),
            scannedAt: response.scannedAt
        )
    }

    func resumeAgentHistorySession(
        for hostID: String,
        workspace: WorkspaceSummary,
        session: AgentHistorySession,
        mutationID: String
    ) async throws {
        async let statusResult: MobileRuntimeStatusWire =
            protocolStatus(
                hostID: hostID
            )
        async let settingsResult: RuntimeClientSettings? = try? protocolClientSettings(
            for: hostID
        )
        let (status, settings) = try await (statusResult, settingsResult)
        let launch = try AgentHistoryResumeLaunchBuilder.build(
            session: session,
            workspace: workspace,
            status: status,
            settings: AgentHistoryResumeSettings(
                commandOverrides: settings?.agentCmdOverrides ?? [:],
                defaultArguments: settings?.agentDefaultArgs ?? [:],
                defaultEnvironment: settings?.agentDefaultEnv ?? [:]
            )
        )
        let command = launch.command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !command.isEmpty else { throw AgentHistoryRepositoryError.invalidResumeCommand }
        let wire: MobileSessionCreateTerminalResultWire = try await sessionTabsCreateTerminal(
            hostID: hostID,
            request: MobileSessionCreateTerminalRequestWire(
                worktree: "id:\(workspace.id)",
                afterTabId: nil,
                activate: true,
                clientMutationId: mutationID,
                agent: nil,
                command: nil,
                env: launch.environment,
                envToDelete: launch.environmentToDelete,
                launchConfig: launch.launchConfig,
                launchAgent: launch.launchAgent,
                startupCommandDelivery: nil,
                agentPrompt: nil
            )
        )
        guard let terminalID = wire.tab.terminal else {
            throw AgentHistoryRepositoryError.rejectedResume
        }
        let sent = try await protocolTerminalSend(
            hostID: hostID,
            terminal: terminalID,
            text: command
        )
        guard sent.send.accepted, sent.send.handle == terminalID else {
            throw AgentHistoryRepositoryError.rejectedResume
        }
    }
}

nonisolated private func mapProtocolSession(
    _ value: Yiru_Runtime_V1_AiVaultSession
) throws -> AgentHistorySession {
    guard
        !value.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
        !value.executionHostID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
        !value.sessionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
        !value.filePath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
        let messageCount = Int(exactly: value.messageCount),
        let queuedMessageCount = Int(exactly: value.queuedMessageCount),
        let subagentTranscriptCount = Int(exactly: value.subagentTranscriptCount)
    else {
        throw RuntimeResponseValidationError("session")
    }
    try requireProtocolTimestamp(value.modifiedAt)
    let createdAt = try optionalProtocolTimestamp(value.createdAt, present: value.hasCreatedAt)
    let updatedAt = try optionalProtocolTimestamp(value.updatedAt, present: value.hasUpdatedAt)
    let tokensByDay =
        try value.hasTokensByDay
        ? value.tokensByDay.values.map(mapProtocolDayTokens) : nil
    let tokenUsage =
        try value.hasTokenUsage
        ? value.tokenUsage.values.map(mapProtocolTokenUsage) : nil
    return AgentHistorySession(
        id: value.id,
        executionHostID: value.executionHostID,
        executionHostPlatform: try mapProtocolPlatform(value),
        agent: try mapProtocolAgent(value.agent),
        sessionID: value.sessionID,
        title: value.title,
        cwd: value.hasCwd ? value.cwd : nil,
        branch: value.hasBranch ? value.branch : nil,
        model: value.hasModel ? value.model : nil,
        filePath: value.filePath,
        codexHome: value.hasCodexHome ? value.codexHome : nil,
        createdAt: createdAt,
        updatedAt: updatedAt,
        modifiedAt: value.modifiedAt,
        messageCount: messageCount,
        totalTokens: value.totalTokens,
        tokensByDay: tokensByDay,
        tokenUsage: tokenUsage,
        queuedMessageCount: queuedMessageCount,
        subagentTranscriptCount: subagentTranscriptCount,
        previewMessages: try value.previewMessages.map(mapProtocolPreview),
        lastUserPrompt: value.hasLastUserPrompt ? value.lastUserPrompt : nil,
        resumeCommand: value.resumeCommand,
        subagent: try value.hasSubagent ? mapProtocolSubagent(value.subagent) : nil
    )
}

nonisolated private func mapProtocolDayTokens(
    _ value: Yiru_Runtime_V1_AiVaultDayTokens
) throws -> AgentHistoryDayTokens {
    guard isProtocolCalendarDay(value.day) else {
        throw RuntimeResponseValidationError("tokens_by_day.day")
    }
    return AgentHistoryDayTokens(day: value.day, tokens: value.tokens)
}

nonisolated private func mapProtocolTokenUsage(
    _ value: Yiru_Runtime_V1_AiVaultTokenUsage
) throws -> AgentHistoryTokenUsage {
    let timestamp = try optionalProtocolTimestamp(value.timestamp, present: value.hasTimestamp)
    return AgentHistoryTokenUsage(
        provider: value.hasProvider ? value.provider : nil,
        model: value.hasModel ? value.model : nil,
        timestamp: timestamp,
        inputTokens: value.inputTokens,
        outputTokens: value.outputTokens,
        cacheReadTokens: value.cacheReadTokens,
        cacheWriteTokens: value.cacheWriteTokens,
        reasoningOutputTokens: value.reasoningOutputTokens,
        totalTokens: value.totalTokens
    )
}

nonisolated private func mapProtocolPreview(
    _ value: Yiru_Runtime_V1_AiVaultPreviewMessage
) throws -> AgentHistoryMessage {
    AgentHistoryMessage(
        role: try mapProtocolPreviewRole(value.role),
        text: value.text,
        timestamp: try optionalProtocolTimestamp(value.timestamp, present: value.hasTimestamp)
    )
}

nonisolated private func mapProtocolSubagent(
    _ value: Yiru_Runtime_V1_AiVaultSubagentInfo
) throws -> AgentHistorySubagentInfo {
    guard !value.parentSessionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw RuntimeResponseValidationError("subagent.parent_session_id")
    }
    let status: AgentHistorySubagentStatus?
    if value.hasStatus {
        status = try mapProtocolSubagentStatus(value.status)
    } else {
        status = nil
    }
    return AgentHistorySubagentInfo(
        parentSessionID: value.parentSessionID,
        agentType: value.hasAgentType ? value.agentType : nil,
        status: status
    )
}

nonisolated private func mapProtocolIssue(
    _ value: Yiru_Runtime_V1_AiVaultScanIssue
) throws -> AgentHistoryIssue {
    guard !value.message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        throw RuntimeResponseValidationError("issue.message")
    }
    return AgentHistoryIssue(
        executionHostID: value.hasExecutionHostID ? value.executionHostID : nil,
        agent: try mapProtocolAgent(value.agent),
        path: value.path,
        message: value.message
    )
}

nonisolated private func mapProtocolAgent(_ value: String) throws -> String {
    let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalized.isEmpty, normalized.utf16.count <= 64, !normalized.contains("\0") else {
        throw RuntimeResponseValidationError("agent")
    }
    return value
}

nonisolated private func mapProtocolPlatform(
    _ value: Yiru_Runtime_V1_AiVaultSession
) throws -> AgentHistorySessionPlatform? {
    guard value.hasExecutionHostPlatform else { return nil }
    switch value.executionHostPlatform {
    case .darwin: return AgentHistorySessionPlatform.darwin
    case .linux: return AgentHistorySessionPlatform.linux
    case .windows: return AgentHistorySessionPlatform.windows
    case .unknown: return AgentHistorySessionPlatform.unknown
    case .UNRECOGNIZED: return AgentHistorySessionPlatform.unknown
    case .unspecified: throw RuntimeResponseValidationError("execution_host_platform")
    }
}

nonisolated private func mapProtocolPreviewRole(
    _ value: Yiru_Runtime_V1_AiVaultPreviewRole
) throws -> String {
    switch value {
    case .user: "user"
    case .assistant: "assistant"
    case .system: "system"
    case .tool: "tool"
    case .unknown: "unknown"
    case .UNRECOGNIZED: "unknown"
    case .unspecified: throw RuntimeResponseValidationError("preview_message.role")
    }
}

nonisolated private func mapProtocolSubagentStatus(
    _ value: Yiru_Runtime_V1_AiVaultSubagentStatus
) throws -> AgentHistorySubagentStatus? {
    switch value {
    case .running: .running
    case .completed: .completed
    case .failed: .failed
    case .stopped: .stopped
    case .UNRECOGNIZED: nil
    case .unspecified: throw RuntimeResponseValidationError("subagent.status")
    }
}

nonisolated private func optionalProtocolTimestamp(
    _ value: String,
    present: Bool
) throws -> String? {
    guard present else { return nil }
    try requireProtocolTimestamp(value)
    return value
}

nonisolated private func requireProtocolTimestamp(_ value: String) throws {
    guard ISODateParser.date(value) != nil else {
        throw RuntimeResponseValidationError("timestamp")
    }
}

nonisolated private func isProtocolCalendarDay(_ value: String) -> Bool {
    let fields = value.split(separator: "-", omittingEmptySubsequences: false)
    guard fields.count == 3,
        fields[0].count == 4,
        fields[1].count == 2,
        fields[2].count == 2,
        let year = Int(fields[0]),
        let month = Int(fields[1]),
        let day = Int(fields[2])
    else { return false }
    let calendar = Calendar(identifier: .gregorian)
    guard let date = calendar.date(from: DateComponents(year: year, month: month, day: day)) else {
        return false
    }
    let resolved = calendar.dateComponents([.year, .month, .day], from: date)
    return resolved.year == year && resolved.month == month && resolved.day == day
}

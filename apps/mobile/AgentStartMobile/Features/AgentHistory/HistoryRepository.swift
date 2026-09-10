nonisolated protocol AgentHistoryRepository: Sendable {
    func supportsAgentHistory(for hostID: String) async throws -> Bool
    func agentHistory(
        for hostID: String,
        scopePaths: [String],
        force: Bool
    ) async throws -> AgentHistorySnapshot
    func resumeAgentHistorySession(
        for hostID: String,
        workspace: WorkspaceSummary,
        session: AgentHistorySession,
        mutationID: String
    ) async throws
}

nonisolated enum AgentHistoryRepositoryError: Error {
    case unsupported
    case invalidResumeCommand
    case rejectedResume
}

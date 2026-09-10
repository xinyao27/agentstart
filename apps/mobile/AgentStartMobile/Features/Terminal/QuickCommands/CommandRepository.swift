import Foundation

nonisolated enum TerminalQuickCommandMutation: Sendable {
    case upsert(TerminalQuickCommand)
    case delete(String)
}

nonisolated protocol TerminalQuickCommandRepository: Sendable {
    func supportsQuickCommands(for hostID: String) async throws -> Bool
    func quickCommands(for hostID: String) async throws -> [TerminalQuickCommand]
    func mutateQuickCommands(for hostID: String, mutation: TerminalQuickCommandMutation)
        async throws
        -> [TerminalQuickCommand]
    func launchQuickCommand(
        for hostID: String,
        worktreeID: String,
        afterTabID: String?,
        command: TerminalQuickCommand
    ) async throws -> TerminalWorkspaceSnapshot
}

nonisolated enum TerminalQuickCommandRepositoryError: Error {
    case unsupported
    case invalidResponse
    case rejectedLaunch
}

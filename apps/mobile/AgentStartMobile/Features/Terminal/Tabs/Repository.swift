import Foundation

nonisolated protocol TerminalWorkspaceRepository: Sendable {
    func activateWorkspace(hostID: String, workspaceID: String) async throws
    func workspaceTabs(for hostID: String, worktreeID: String) async throws
        -> TerminalWorkspaceSnapshot
    func workspaceTabUpdates(for hostID: String, worktreeID: String) async throws
        -> AsyncThrowingStream<TerminalWorkspaceSnapshot, Error>
    func workspaceDisplayName(for hostID: String, worktreeID: String) async throws -> String?
    func workspaceInvalidations(for hostID: String) async throws
        -> AsyncThrowingStream<TerminalWorkspaceInvalidation, Error>
    func activateWorkspaceTab(
        for hostID: String,
        worktreeID: String,
        tabID: String,
        leafID: String?
    ) async throws -> TerminalWorkspaceSnapshot
    func createWorkspaceTerminal(
        for hostID: String,
        worktreeID: String,
        afterTabID: String?,
        agentID: String?
    ) async throws -> TerminalWorkspaceSnapshot
    func createWorkspaceMarkdown(
        for hostID: String,
        worktreeID: String
    ) async throws -> TerminalWorkspaceSnapshot
    func createWorkspaceBrowser(
        for hostID: String,
        worktreeID: String,
        url: String
    ) async throws -> TerminalWorkspaceSnapshot
    func closeWorkspaceTab(
        for hostID: String,
        worktreeID: String,
        tabID: String,
        leafID: String?
    ) async throws -> TerminalWorkspaceSnapshot
    func reconnectWorkspaceHost(hostID: String) async
}

nonisolated enum TerminalWorkspaceInvalidation: Sendable {
    case ready
    case repositoriesChanged
    case worktreesChanged(repoID: String)
    case end
}

nonisolated enum TerminalWorkspaceRepositoryError: Error {
    case hostNotFound
    case rejectedMutation
    case timeout
}

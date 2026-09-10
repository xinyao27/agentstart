nonisolated protocol WorkspaceFilesRepository: Sendable {
    func loadWorkspaceDirectory(
        for hostID: String,
        worktreeID: String,
        relativePath: String
    ) async throws -> [WorkspaceDirectoryEntry]
    func reconnectWorkspaceFiles(for hostID: String) async
    // Why: mirrors SourceControlRepository.liveWorktreeDisplayName — the header must show
    // the worktree's current display name, not the WorkspaceSummary snapshot handed to the
    // screen at navigation time. Best-effort: nil leaves the caller's static fallback in place.
    func liveWorktreeDisplayName(for hostID: String, worktreeID: String) async -> String?
}

nonisolated extension WorkspaceFilesRepository {
    func reconnectWorkspaceFiles(for _: String) async {}
}

nonisolated struct WorkspaceFilesLoadFailure: Error, Sendable {
    let message: String
    let isConnectionFailure: Bool
}

nonisolated protocol WorkspaceContentRepository: Sendable {
    func readWorkspaceMarkdown(
        for hostID: String,
        worktreeID: String,
        tab: TerminalWorkspaceTab,
        descriptor: WorkspaceMarkdownTab
    ) async throws -> WorkspaceMarkdownDocument
    func saveWorkspaceMarkdown(
        for hostID: String,
        worktreeID: String,
        tabID: String,
        baseVersion: String,
        content: String
    ) async throws -> WorkspaceMarkdownDocument
    func readWorkspaceFile(
        for hostID: String,
        worktreeID: String,
        descriptor: WorkspaceFileTab
    ) async throws -> WorkspaceFileDocument
    // Why: mirrors SourceControlRepository.liveWorktreeDisplayName — the preview header
    // must show the worktree's current display name, not the WorkspaceSummary snapshot
    // handed to the screen at navigation time. Best-effort: nil keeps the static fallback.
    func liveWorktreeDisplayName(for hostID: String, worktreeID: String) async -> String?
}

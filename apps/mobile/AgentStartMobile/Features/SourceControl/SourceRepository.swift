import Foundation

nonisolated protocol SourceControlRepository: Sendable {
    func sourceStatus(for hostID: String, worktreeID: String) async throws -> SourceStatusSnapshot
    func stageSourceFile(for hostID: String, worktreeID: String, path: String) async throws
    func unstageSourceFile(for hostID: String, worktreeID: String, path: String) async throws
    func discardSourceFile(for hostID: String, worktreeID: String, path: String) async throws
    func stageSourceFiles(for hostID: String, worktreeID: String, paths: [String]) async throws
    func unstageSourceFiles(for hostID: String, worktreeID: String, paths: [String]) async throws
    func commitSourceFiles(
        for hostID: String,
        worktreeID: String,
        message: String
    ) async throws
    func fetchSourceRemote(for hostID: String, worktreeID: String) async throws
    func pullSourceRemote(for hostID: String, worktreeID: String) async throws
    func pushSourceRemote(
        for hostID: String,
        worktreeID: String,
        publish: Bool,
        forceWithLease: Bool
    ) async throws
    func fastForwardSourceRemote(for hostID: String, worktreeID: String) async throws
    func sourceDefaultBaseRef(
        for hostID: String,
        worktreeID: String,
        repoID: String
    ) async throws -> String
    func rebaseSourceBranch(
        for hostID: String,
        worktreeID: String,
        baseRef: String
    ) async throws
    func abortSourceConflict(
        for hostID: String,
        worktreeID: String,
        operation: SourceConflictOperation
    ) async throws
    func sourceLocalBranches(
        for hostID: String,
        worktreeID: String
    ) async throws -> SourceLocalBranches
    func checkoutSourceBranch(
        for hostID: String,
        worktreeID: String,
        branch: String
    ) async throws
    func sourceBranchCompare(
        for hostID: String,
        worktreeID: String,
        baseRef: String
    ) async throws -> SourceBranchComparison
    func sourceBranchDiff(
        for hostID: String,
        worktreeID: String,
        entry: SourceBranchFile,
        comparison: SourceBranchComparison
    ) async throws -> WorkspaceFileDocument
    func generateSourceCommitMessage(for hostID: String, worktreeID: String) async throws -> String
    func cancelSourceCommitMessage(for hostID: String, worktreeID: String) async throws
    func launchSourceControlAgent(
        for hostID: String,
        worktreeID: String,
        prompt: String
    ) async throws
    func sourceHistory(
        for hostID: String,
        worktreeID: String,
        limit: Int
    ) async throws -> [SourceCommit]
    func sourceCommitFiles(
        for hostID: String,
        worktreeID: String,
        commitID: String
    ) async throws -> [SourceCommitFile]
    // Why: the header must show the worktree's current display name, not the
    // WorkspaceSummary snapshot handed to the screen at navigation time — that value can
    // predate a rename or the desktop settling meta.displayName. Best-effort: nil leaves the
    // caller's static fallback in place.
    func liveWorktreeDisplayName(for hostID: String, worktreeID: String) async -> String?
}

nonisolated enum SourceControlRepositoryError: LocalizedError {
    case rejectedMutation
    case rejectedCommit(String?)
    case missingBaseRef
    case unavailableBranchDiff
    case rejectedGeneration(String?)

    var errorDescription: String? {
        switch self {
        case .rejectedMutation:
            String(localized: "Source control action was rejected")
        case .rejectedCommit(let message):
            message ?? String(localized: "Commit failed")
        case .missingBaseRef:
            String(localized: "Unable to resolve the base branch")
        case .unavailableBranchDiff:
            String(localized: "Committed branch diff is unavailable")
        case .rejectedGeneration(let message):
            message ?? String(localized: "No commit message generated")
        }
    }
}

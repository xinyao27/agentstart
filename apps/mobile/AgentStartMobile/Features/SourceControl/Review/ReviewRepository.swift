import Foundation

nonisolated struct SourceReviewMetadata: Hashable, Sendable {
    let comments: [SourceReviewComment]
    let state: SourceReviewState
}

nonisolated enum SourceReviewDiff: Sendable {
    case document(WorkspaceFileDocument)
    case binary
    case deleted
}

nonisolated struct SourceReviewTerminal: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
}

nonisolated protocol SourceReviewRepository: Sendable {
    func sourceReviewMetadata(for hostID: String, worktreeID: String) async throws
        -> SourceReviewMetadata
    func saveSourceReviewMetadata(
        for hostID: String,
        worktreeID: String,
        comments: [SourceReviewComment],
        state: SourceReviewState
    ) async throws
    func sourceReviewDiff(
        for hostID: String,
        worktreeID: String,
        item: SourceReviewItem,
        branchComparison: SourceBranchComparison?
    ) async throws -> SourceReviewDiff
    func sourceReviewTerminals(for hostID: String, worktreeID: String) async throws
        -> [SourceReviewTerminal]
    func createSourceReviewTerminal(for hostID: String, worktreeID: String) async throws
        -> SourceReviewTerminal
    func sendSourceReviewNotes(
        for hostID: String,
        terminalID: String,
        comments: [SourceReviewComment]
    ) async throws
    func openSourceReviewInSession(
        for hostID: String,
        worktreeID: String,
        item: SourceReviewItem
    ) async throws
}

nonisolated enum SourceReviewRepositoryError: LocalizedError {
    case missingBranchComparison
    case missingTerminal
    case terminalRejected
    case unsupportedBinary

    var errorDescription: String? {
        switch self {
        case .missingBranchComparison: String(localized: "Committed diff is unavailable")
        case .missingTerminal: String(localized: "No terminal session is available")
        case .terminalRejected: String(localized: "Terminal input is locked")
        case .unsupportedBinary: String(localized: "Binary diff is unavailable on mobile")
        }
    }
}

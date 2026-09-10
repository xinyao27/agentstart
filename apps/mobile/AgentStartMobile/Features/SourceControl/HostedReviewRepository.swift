import Foundation

nonisolated protocol HostedReviewRepository: Sendable {
    func hostedReview(
        for hostID: String,
        workspace: WorkspaceSummary,
        status: SourceStatusSnapshot,
        linkedProvider: HostedReviewProvider?,
        linkedNumber: Int?
    ) async throws -> HostedReview?
    func hostedReviewEligibility(
        for hostID: String,
        workspace: WorkspaceSummary,
        status: SourceStatusSnapshot
    ) async throws -> HostedReviewEligibility
    func createHostedReview(
        for hostID: String,
        workspace: WorkspaceSummary,
        draft: HostedReviewDraft
    ) async throws -> HostedReviewCreation
    func setHostedReviewLink(
        for hostID: String,
        workspaceID: String,
        provider: HostedReviewProvider,
        number: Int?,
        baseRef: String?
    ) async throws
    func hostedReviewDetails(
        for hostID: String,
        workspace: WorkspaceSummary,
        review: HostedReview
    ) async throws -> HostedReviewDetails?
    func hostedReviewChecks(
        for hostID: String,
        workspace: WorkspaceSummary,
        review: HostedReview,
        details: HostedReviewDetails?
    ) async throws -> [HostedReviewCheck]
    func hostedReviewCheckDetails(
        for hostID: String,
        workspace: WorkspaceSummary,
        review: HostedReview,
        details: HostedReviewDetails?,
        check: HostedReviewCheck
    ) async throws -> HostedReviewCheckRunDetails?
    func hostedReviewAssignableUsers(
        for hostID: String,
        workspace: WorkspaceSummary
    ) async throws -> [HostedReviewUser]
    func launchHostedReviewTriage(
        for hostID: String,
        workspaceID: String,
        prompt: String
    ) async throws
    func mutateHostedReview(
        for hostID: String,
        workspace: WorkspaceSummary,
        review: HostedReview,
        details: HostedReviewDetails?,
        mutation: HostedReviewMutation
    ) async throws
}

nonisolated enum HostedReviewRepositoryError: LocalizedError {
    case rejected(String?)
    case invalidCreationResult
    case unsupportedMutation

    var errorDescription: String? {
        switch self {
        case .rejected(let message):
            message ?? String(localized: "The hosted review action was rejected.")
        case .invalidCreationResult:
            String(localized: "The provider did not return a valid hosted review.")
        case .unsupportedMutation:
            String(localized: "This action is not available for the current provider.")
        }
    }
}

nonisolated struct SourceHostedReviewCreateOutcome: Hashable, Sendable {
    let creation: HostedReviewCreation
    let provider: HostedReviewProvider
    let baseRef: String
    let didCommit: Bool
    let warning: String?
}

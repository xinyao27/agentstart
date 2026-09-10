import AgentStartProtocol
import Foundation
import SwiftProtobuf

extension RuntimeClient {
    func mutateHostedReview(
        for hostID: String,
        workspace: WorkspaceSummary,
        review: HostedReview,
        details: HostedReviewDetails?,
        mutation: HostedReviewMutation
    ) async throws {
        guard review.provider == .github else {
            throw HostedReviewRepositoryError.unsupportedMutation
        }
        let repo = hostedReviewRepoSelector(workspace.repoID)
        let prNumber = UInt64(review.number)
        let identity = details?.repoIdentity.map(hostedReviewRepoRef)
        switch mutation {
        case .update(let title, let body):
            var request = AgentStart_Runtime_V1_GitHubServiceUpdatePrRequest()
            request.repo = repo
            request.prNumber = prNumber
            if let title {
                request.title = title
            }
            if let body {
                request.body = body
            }
            if let identity {
                request.prRepo = identity
            }
            try await requireHostedReviewMutation(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitHubServiceMethods.updatePr,
                request: request,
                response: AgentStart_Runtime_V1_GitHubServiceUpdatePrResponse.self
            )
        case .merge(let method):
            var request = AgentStart_Runtime_V1_GitHubServiceMergePrRequest()
            request.repo = repo
            request.prNumber = prNumber
            request.method = hostedReviewMergeMethod(method)
            if let identity {
                request.prRepo = identity
            }
            try await requireHostedReviewMutation(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitHubServiceMethods.mergePr,
                request: request,
                response: AgentStart_Runtime_V1_GitHubServiceMergePrResponse.self
            )
        case .setAutoMerge(let enabled, let method):
            var request = AgentStart_Runtime_V1_GitHubServiceSetPrAutoMergeRequest()
            request.repo = repo
            request.prNumber = prNumber
            request.enabled = enabled
            request.method = hostedReviewMergeMethod(method)
            if let identity {
                request.prRepo = identity
            }
            try await requireHostedReviewMutation(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitHubServiceMethods.setPrAutoMerge,
                request: request,
                response: AgentStart_Runtime_V1_GitHubServiceSetPrAutoMergeResponse.self
            )
        case .updateState(let state):
            var request = AgentStart_Runtime_V1_GitHubServiceUpdatePrStateRequest()
            request.repo = repo
            request.prNumber = prNumber
            request.state = state == .closed ? .closed : .open
            try await requireHostedReviewMutation(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitHubServiceMethods.updatePrState,
                request: request,
                response: AgentStart_Runtime_V1_GitHubServiceUpdatePrStateResponse.self
            )
        case .requestReviewer(let login):
            var request = AgentStart_Runtime_V1_GitHubServiceRequestPrReviewersRequest()
            request.repo = repo
            request.prNumber = prNumber
            request.reviewers = [login]
            try await requireHostedReviewMutation(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitHubServiceMethods.requestPrReviewers,
                request: request,
                response: AgentStart_Runtime_V1_GitHubServiceRequestPrReviewersResponse.self
            )
        case .removeReviewer(let login):
            var request = AgentStart_Runtime_V1_GitHubServiceRemovePrReviewersRequest()
            request.repo = repo
            request.prNumber = prNumber
            request.reviewers = [login]
            try await requireHostedReviewMutation(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitHubServiceMethods.removePrReviewers,
                request: request,
                response: AgentStart_Runtime_V1_GitHubServiceRemovePrReviewersResponse.self
            )
        case .addComment(let body):
            var request = AgentStart_Runtime_V1_GitHubServiceAddPrCommentRequest()
            request.repo = repo
            request.number = prNumber
            request.body = body
            if let identity {
                request.prRepo = identity
            }
            let response = try await protocolUnary(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitHubServiceMethods.addPrComment,
                request: request,
                response: AgentStart_Runtime_V1_GitHubServiceAddPrCommentResponse.self
            )
            guard response.result.ok else {
                throw HostedReviewRepositoryError.rejected(
                    response.result.hasError ? response.result.error : nil
                )
            }
        case .reply(let comment, let body):
            var request = AgentStart_Runtime_V1_GitHubServiceAddPrReviewCommentReplyRequest()
            request.repo = repo
            request.prNumber = prNumber
            request.commentID = UInt64(comment.id)
            request.body = body
            if let threadID = comment.threadID {
                request.threadID = threadID
            }
            if let path = comment.path {
                request.path = path
            }
            if let line = comment.line {
                request.line = UInt64(line)
            }
            if let identity {
                request.prRepo = identity
            }
            let response = try await protocolUnary(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitHubServiceMethods.addPrReviewCommentReply,
                request: request,
                response: AgentStart_Runtime_V1_GitHubServiceAddPrReviewCommentReplyResponse.self
            )
            guard response.result.ok else {
                throw HostedReviewRepositoryError.rejected(
                    response.result.hasError ? response.result.error : nil
                )
            }
        case .rerunFailedChecks:
            var request = AgentStart_Runtime_V1_GitHubServiceRerunPrChecksRequest()
            request.repo = repo
            request.prNumber = prNumber
            if let headSha = details?.headSHA ?? review.headSHA {
                request.headSha = headSha
            }
            request.failedOnly = true
            if let identity {
                request.prRepo = identity
            }
            let response = try await protocolUnary(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitHubServiceMethods.rerunPrChecks,
                request: request,
                response: AgentStart_Runtime_V1_GitHubServiceRerunPrChecksResponse.self
            )
            guard response.ok else {
                throw HostedReviewRepositoryError.rejected(
                    response.hasError ? response.error : nil
                )
            }
        case .resolveThread(let id, let resolve):
            var request = AgentStart_Runtime_V1_GitHubServiceResolveReviewThreadRequest()
            request.repo = repo
            request.threadID = id
            request.resolve = resolve
            let response = try await protocolUnary(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitHubServiceMethods.resolveReviewThread,
                request: request,
                response: AgentStart_Runtime_V1_GitHubServiceResolveReviewThreadResponse.self
            )
            guard response.ok else { throw HostedReviewRepositoryError.rejected(nil) }
        }
    }

    private func requireHostedReviewMutation<
        Request: SwiftProtobuf.Message,
        Response: SwiftProtobuf.Message
    >(
        hostID: String,
        procedure: String,
        request: Request,
        response: Response.Type
    ) async throws where Response: HostedReviewMutationResult {
        let result = try await protocolUnary(
            hostID: hostID,
            procedure: procedure,
            request: request,
            response: response
        )
        guard result.mutationOK else {
            throw HostedReviewRepositoryError.rejected(result.mutationError)
        }
    }
}

nonisolated private protocol HostedReviewMutationResult {
    var mutationOK: Bool { get }
    var mutationError: String? { get }
}

extension AgentStart_Runtime_V1_GitHubServiceUpdatePrResponse: HostedReviewMutationResult {
    nonisolated var mutationOK: Bool { result.ok }
    nonisolated var mutationError: String? { result.hasError ? result.error : nil }
}

extension AgentStart_Runtime_V1_GitHubServiceMergePrResponse: HostedReviewMutationResult {
    nonisolated var mutationOK: Bool { result.ok }
    nonisolated var mutationError: String? { result.hasError ? result.error : nil }
}

extension AgentStart_Runtime_V1_GitHubServiceSetPrAutoMergeResponse: HostedReviewMutationResult {
    nonisolated var mutationOK: Bool { result.ok }
    nonisolated var mutationError: String? { result.hasError ? result.error : nil }
}

extension AgentStart_Runtime_V1_GitHubServiceUpdatePrStateResponse: HostedReviewMutationResult {
    nonisolated var mutationOK: Bool { result.ok }
    nonisolated var mutationError: String? { result.hasError ? result.error : nil }
}

extension AgentStart_Runtime_V1_GitHubServiceRequestPrReviewersResponse: HostedReviewMutationResult
{
    nonisolated var mutationOK: Bool { result.ok }
    nonisolated var mutationError: String? { result.hasError ? result.error : nil }
}

extension AgentStart_Runtime_V1_GitHubServiceRemovePrReviewersResponse: HostedReviewMutationResult {
    nonisolated var mutationOK: Bool { result.ok }
    nonisolated var mutationError: String? { result.hasError ? result.error : nil }
}

nonisolated private func hostedReviewMergeMethod(_ method: String)
    -> AgentStart_Runtime_V1_GitHubMergeMethod
{
    switch method {
    case "squash": .squash
    case "rebase": .rebase
    default: .merge
    }
}

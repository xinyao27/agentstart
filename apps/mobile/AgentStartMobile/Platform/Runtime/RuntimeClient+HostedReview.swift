import AgentStartProtocol
import Foundation
import SwiftProtobuf

extension RuntimeClient: HostedReviewRepository {
    func launchHostedReviewTriage(
        for hostID: String,
        workspaceID: String,
        prompt: String
    ) async throws {
        let snapshot = try await createWorkspaceTerminal(
            for: hostID,
            worktreeID: workspaceID,
            afterTabID: nil,
            agentID: nil
        )
        guard
            let tab = snapshot.tabs.first(where: { $0.isActive && $0.terminalTarget != nil })
                ?? snapshot.tabs.last(where: { $0.terminalTarget != nil }),
            let terminal = tab.terminalTarget
        else { throw SourceReviewRepositoryError.missingTerminal }
        let response = try await protocolTerminalSend(
            hostID: hostID,
            terminal: terminal.id,
            text: prompt
        )
        guard response.send.accepted else { throw SourceReviewRepositoryError.terminalRejected }
    }

    func hostedReview(
        for hostID: String,
        workspace: WorkspaceSummary,
        status: SourceStatusSnapshot,
        linkedProvider: HostedReviewProvider?,
        linkedNumber: Int?
    ) async throws -> HostedReview? {
        var request = AgentStart_Runtime_V1_GitHubServiceGetHostedReviewForBranchRequest()
        request.repo = hostedReviewRepoSelector(workspace.repoID)
        request.branch = status.branchLabel
        var lookup = AgentStart_Runtime_V1_GitHubPrBranchLookup()
        if linkedProvider == .github, let linkedNumber {
            lookup.linkedPrNumber = UInt64(linkedNumber)
        } else if let linkedPullRequest = workspace.linkedPullRequest?.number {
            lookup.linkedPrNumber = UInt64(linkedPullRequest)
        }
        if let head = status.head { lookup.currentHeadOid = head }
        request.lookup = lookup
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHubServiceMethods.getHostedReviewForBranch,
            request: request,
            response: AgentStart_Runtime_V1_GitHubServiceGetHostedReviewForBranchResponse.self
        )
        return response.hasReview ? hostedReviewSummary(response.review) : nil
    }

    func hostedReviewEligibility(
        for hostID: String,
        workspace: WorkspaceSummary,
        status: SourceStatusSnapshot
    ) async throws -> HostedReviewEligibility {
        let upstream = status.upstream
        var request = AgentStart_Runtime_V1_GitHubServiceGetHostedReviewCreationEligibilityRequest()
        request.repo = hostedReviewRepoSelector(workspace.repoID)
        request.worktree = hostedReviewWorktreeSelector(workspace.id)
        request.branch = status.branchLabel
        request.hasUncommittedChanges_p = !status.entries.isEmpty
        if let hasUpstream = upstream?.hasUpstream { request.hasUpstream_p = hasUpstream }
        if let ahead = upstream?.ahead { request.ahead = UInt64(ahead) }
        if let behind = upstream?.behind { request.behind = UInt64(behind) }
        if let linkedPullRequest = workspace.linkedPullRequest?.number {
            request.linkedGithubPr = UInt64(linkedPullRequest)
        }
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHubServiceMethods.getHostedReviewCreationEligibility,
            request: request,
            response: AgentStart_Runtime_V1_GitHubServiceGetHostedReviewCreationEligibilityResponse
                .self
        )
        return HostedReviewEligibility(
            provider: hostedReviewProvider(response.provider),
            canCreate: response.canCreate,
            blockedReason: hostedReviewBlockedReason(response.blockedReason),
            existingReviewURL: response.hasReview ? URL(string: response.review.url) : nil,
            defaultBaseRef: response.hasDefaultBaseRef ? response.defaultBaseRef : nil,
            head: response.hasHead ? response.head : nil,
            suggestedTitle: nil,
            suggestedBody: nil
        )
    }

    func createHostedReview(
        for hostID: String,
        workspace: WorkspaceSummary,
        draft: HostedReviewDraft
    ) async throws -> HostedReviewCreation {
        var request = AgentStart_Runtime_V1_GitHubServiceCreateHostedReviewRequest()
        request.repo = hostedReviewRepoSelector(workspace.repoID)
        request.worktree = hostedReviewWorktreeSelector(workspace.id)
        request.provider = hostedReviewProviderValue(draft.provider)
        request.base = draft.base
        if let head = draft.head { request.head = head }
        request.title = draft.title
        if !draft.body.isEmpty { request.body = draft.body }
        request.draft = draft.isDraft
        request.useTemplate = draft.useTemplate
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHubServiceMethods.createHostedReview,
            request: request,
            response: AgentStart_Runtime_V1_GitHubServiceCreateHostedReviewResponse.self
        )
        if response.ok, response.hasNumber {
            return HostedReviewCreation(
                number: Int(response.number),
                url: response.hasURL ? URL(string: response.url) : nil,
                isExisting: false
            )
        }
        if response.hasExistingReview {
            return HostedReviewCreation(
                number: Int(response.existingReview.number),
                url: URL(string: response.existingReview.url),
                isExisting: true
            )
        }
        if response.ok { throw HostedReviewRepositoryError.invalidCreationResult }
        throw HostedReviewRepositoryError.rejected(
            response.hasError ? response.error : nil
        )
    }

    func setHostedReviewLink(
        for hostID: String,
        workspaceID: String,
        provider: HostedReviewProvider,
        number: Int?,
        baseRef: String?
    ) async throws {
        guard provider != .unsupported else { return }
        let revision = try await workspaceMutationRevision(hostID: hostID, workspaceID: workspaceID)
        try await protocolSetWorktree(
            hostID: hostID,
            workspaceID: workspaceID,
            revision: revision
        ) { patch in
            var linked = AgentStart_Runtime_V1_WorktreeNullableInt64()
            if let number {
                linked.number = Int64(number)
            } else {
                linked.null = true
            }
            patch.linkedPr = linked
            if let baseRef { patch.baseRef = baseRef }
        }
    }

    func hostedReviewDetails(
        for hostID: String,
        workspace: WorkspaceSummary,
        review: HostedReview
    ) async throws -> HostedReviewDetails? {
        guard review.provider == .github else { return nil }
        var request = AgentStart_Runtime_V1_GitHubServiceGetWorkItemDetailsRequest()
        request.repo = hostedReviewRepoSelector(workspace.repoID)
        request.number = UInt64(review.number)
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHubServiceMethods.getWorkItemDetails,
            request: request,
            response: AgentStart_Runtime_V1_GitHubServiceGetWorkItemDetailsResponse.self
        )
        let settings: RuntimeClientSettings? = try? await protocolClientSettings(for: hostID)
        let botAuthors = hostedReviewBotAuthorSet(
            settings?.prBotAuthorOverrides ?? []
        )
        guard response.hasDetails else { return nil }
        return mapHostedReviewDetails(response.details, botAuthors: botAuthors)
    }

    func hostedReviewChecks(
        for hostID: String,
        workspace: WorkspaceSummary,
        review: HostedReview,
        details: HostedReviewDetails?
    ) async throws -> [HostedReviewCheck] {
        guard review.provider == .github else { return [] }
        var request = AgentStart_Runtime_V1_GitHubServiceGetPrChecksRequest()
        request.repo = hostedReviewRepoSelector(workspace.repoID)
        request.prNumber = UInt64(review.number)
        if let headSha = details?.headSHA ?? review.headSHA {
            request.headSha = headSha
        }
        if let identity = details?.repoIdentity {
            request.prRepo = hostedReviewRepoRef(identity)
        }
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHubServiceMethods.getPrChecks,
            request: request,
            response: AgentStart_Runtime_V1_GitHubServiceGetPrChecksResponse.self
        )
        return response.checks.map(hostedReviewCheck)
    }

    func hostedReviewAssignableUsers(
        for hostID: String,
        workspace: WorkspaceSummary
    ) async throws -> [HostedReviewUser] {
        var request = AgentStart_Runtime_V1_GitHubServiceListAssignableUsersRequest()
        request.repo = hostedReviewRepoSelector(workspace.repoID)
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHubServiceMethods.listAssignableUsers,
            request: request,
            response: AgentStart_Runtime_V1_GitHubServiceListAssignableUsersResponse.self
        )
        return response.users.map {
            HostedReviewUser(
                login: $0.login,
                name: $0.hasName ? $0.name : nil,
                avatarURL: URL(string: $0.avatarURL)
            )
        }
    }

    func hostedReviewCheckDetails(
        for hostID: String,
        workspace: WorkspaceSummary,
        review: HostedReview,
        details: HostedReviewDetails?,
        check: HostedReviewCheck
    ) async throws -> HostedReviewCheckRunDetails? {
        guard review.provider == .github else { return nil }
        var request = AgentStart_Runtime_V1_GitHubServiceGetPrCheckDetailsRequest()
        request.repo = hostedReviewRepoSelector(workspace.repoID)
        if let checkRunID = check.checkRunID {
            request.checkRunID = UInt64(checkRunID)
        }
        if let workflowRunID = check.workflowRunID {
            request.workflowRunID = UInt64(workflowRunID)
        }
        request.checkName = check.name
        if let url = check.url?.absoluteString {
            request.url = url
        }
        if let identity = details?.repoIdentity {
            request.prRepo = hostedReviewRepoRef(identity)
        }
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHubServiceMethods.getPrCheckDetails,
            request: request,
            response: AgentStart_Runtime_V1_GitHubServiceGetPrCheckDetailsResponse.self
        )
        guard response.hasDetails else { return nil }
        return hostedReviewCheckRunDetails(response.details)
    }
}

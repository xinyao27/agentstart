import AgentStartProtocol
import Foundation
import SwiftProtobuf

extension RuntimeClient {
    func workspaceSourceRefs(for hostID: String, repoID: String, query: String) async throws
        -> [WorkspaceSourceRef]
    {
        var request = AgentStart_Runtime_V1_RepoServiceSearchRefsRequest()
        request.repo = "id:\(repoID)"
        request.query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        request.limit = 20
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1RepoServiceMethods.searchRefs,
            request: request,
            response: AgentStart_Runtime_V1_RepoServiceSearchRefsResponse.self
        )
        if response.hasRefDetails {
            return response.refDetails.values.map {
                WorkspaceSourceRef(refName: $0.refName, localBranchName: $0.localBranchName)
            }
        }
        return response.refs.map { WorkspaceSourceRef(refName: $0, localBranchName: $0) }
    }

    func workspaceHostedSources(
        for hostID: String,
        repoID: String,
        query: String
    ) async throws -> [WorkspaceHostedSource] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        var request = AgentStart_Runtime_V1_GitHubServiceListWorkItemsRequest()
        request.repo = "id:\(repoID)"
        request.limit = 50
        request.query = trimmed.isEmpty ? "is:pr" : "is:pr \(trimmed)"
        do {
            let response = try await protocolUnary(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitHubServiceMethods.listWorkItems,
                request: request,
                response: AgentStart_Runtime_V1_GitHubServiceListWorkItemsResponse.self
            )
            return response.items.map(WorkspaceHostedSource.init(item:))
        } catch let error as RuntimeTransportError
            where isGitHubRemoteRequired(error)
        {
            throw WorkspaceHostedSourceError.githubRemoteRequired
        }
    }

    func resolveWorkspaceHostedSource(
        for hostID: String,
        repoID: String,
        source: WorkspaceHostedSource
    ) async throws -> WorkspaceHostedBase {
        var request = AgentStart_Runtime_V1_WorktreeServiceResolvePrBaseRequest()
        request.repo = "id:\(repoID)"
        request.prNumber = Int64(source.number)
        if let headRefName = source.branchName { request.headRefName = headRefName }
        if let baseRefName = source.baseRefName { request.baseRefName = baseRefName }
        request.isCrossRepository = source.isCrossRepository ?? false
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1WorktreeServiceMethods.resolvePrBase,
            request: request,
            response: AgentStart_Runtime_V1_WorktreeServiceResolvePrBaseResponse.self
        )
        switch response.result {
        case .success(let base):
            return WorkspaceHostedBase(
                baseBranch: base.baseBranch,
                compareBaseRef: base.hasCompareBaseRef ? base.compareBaseRef : nil,
                pushTarget: base.hasPushTarget
                    ? WorkspacePushTarget(pushTarget: base.pushTarget) : nil,
                branchNameOverride: base.hasBranchNameOverride ? base.branchNameOverride : nil
            )
        case .error(let message):
            throw WorkspaceHostedSourceError.rejected(message)
        case nil:
            throw WorkspaceHostedSourceError.rejected(
                String(localized: "Failed to resolve base branch.")
            )
        }
    }

    func workspacePastedGitHubSource(
        for hostID: String,
        repoID: String,
        number: Int,
        slug: WorkspaceRepoSlug?
    ) async throws -> WorkspaceHostedSource? {
        if let slug {
            var request = AgentStart_Runtime_V1_GitHubServiceGetWorkItemByOwnerRepoRequest()
            request.repo = "id:\(repoID)"
            request.number = UInt64(number)
            request.ownerRepo = hostedSourceRepoRef(slug)
            let response = try await protocolUnary(
                hostID: hostID,
                procedure: AgentStartRuntimeV1GitHubServiceMethods.getWorkItemByOwnerRepo,
                request: request,
                response: AgentStart_Runtime_V1_GitHubServiceGetWorkItemByOwnerRepoResponse.self
            )
            guard response.hasItem else { return nil }
            return WorkspaceHostedSource(item: response.item)
        }
        var request = AgentStart_Runtime_V1_GitHubServiceGetWorkItemRequest()
        request.repo = "id:\(repoID)"
        request.number = UInt64(number)
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHubServiceMethods.getWorkItem,
            request: request,
            response: AgentStart_Runtime_V1_GitHubServiceGetWorkItemResponse.self
        )
        guard response.hasItem else { return nil }
        return WorkspaceHostedSource(item: response.item)
    }

    func workspaceRepoSlug(for hostID: String, repoID: String) async throws -> WorkspaceRepoSlug? {
        var request = AgentStart_Runtime_V1_GitHubServiceGetRepoSlugRequest()
        request.repo = "id:\(repoID)"
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1GitHubServiceMethods.getRepoSlug,
            request: request,
            response: AgentStart_Runtime_V1_GitHubServiceGetRepoSlugResponse.self
        )
        guard response.hasRepo else { return nil }
        return WorkspaceRepoSlug(owner: response.repo.owner, repo: response.repo.repo)
    }

    func persistWorkspaceSetupTrust(
        for hostID: String,
        trustedHooks: WorkspaceTrustedHooks
    ) async throws -> WorkspaceTrustedHooks {
        let fields = try await protocolUiSet(
            hostID: hostID,
            fields: [
                "trustedAgentStartHooks": .object(trustedHooks.mapValues(\.uiValue))
            ]
        )
        return workspaceTrustedHooks(fields)
    }
}

// Why: the SSH-repo remote requirement is only reported as a `gh` message string,
// so the mobile client matches it the same way the workbench does.
nonisolated private func isGitHubRemoteRequired(_ error: RuntimeTransportError) -> Bool {
    guard case .serverStatus(_, let message) = error else { return false }
    return message.contains("GitHub work items require a GitHub remote for SSH repositories")
}

nonisolated private func hostedSourceRepoRef(_ slug: WorkspaceRepoSlug)
    -> AgentStart_Runtime_V1_GitHubRepoRef
{
    AgentStart_Runtime_V1_GitHubRepoRef.with {
        $0.owner = slug.owner
        $0.repo = slug.repo
    }
}

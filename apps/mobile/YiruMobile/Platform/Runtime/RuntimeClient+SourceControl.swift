import Foundation
import SwiftProtobuf
import YiruProtocol

extension RuntimeClient: SourceControlRepository {
    func launchSourceControlAgent(
        for hostID: String,
        worktreeID: String,
        prompt: String
    ) async throws {
        let snapshot = try await createWorkspaceTerminal(
            for: hostID,
            worktreeID: worktreeID,
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

    func sourceStatus(for hostID: String, worktreeID: String) async throws -> SourceStatusSnapshot {
        var request = Yiru_Runtime_V1_GitStatusServiceStatusRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1GitStatusServiceMethods.status,
            request: request,
            response: Yiru_Runtime_V1_GitStatusServiceStatusResponse.self
        )
        let status = response.status
        return SourceStatusSnapshot(
            entries: status.entries.map(sourceEntry),
            conflictOperation: sourceConflictOperation(status.conflictOperation),
            head: status.hasHead ? status.head : nil,
            branch: status.hasBranch ? status.branch : nil,
            upstream: status.hasUpstreamStatus ? sourceUpstreamStatus(status.upstreamStatus) : nil,
            didHitLimit: status.hasDidHitLimit ? status.didHitLimit : false
        )
    }

    func stageSourceFile(for hostID: String, worktreeID: String, path: String) async throws {
        var request = Yiru_Runtime_V1_GitStagingServiceStageRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.filePath = path
        try await sourceMutation(
            hostID,
            procedure: YiruRuntimeV1GitStagingServiceMethods.stage,
            request: request,
            response: Yiru_Runtime_V1_GitStagingServiceStageResponse.self,
            isOK: { $0.ok }
        )
    }

    func unstageSourceFile(for hostID: String, worktreeID: String, path: String) async throws {
        var request = Yiru_Runtime_V1_GitStagingServiceUnstageRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.filePath = path
        try await sourceMutation(
            hostID,
            procedure: YiruRuntimeV1GitStagingServiceMethods.unstage,
            request: request,
            response: Yiru_Runtime_V1_GitStagingServiceUnstageResponse.self,
            isOK: { $0.ok }
        )
    }

    func discardSourceFile(for hostID: String, worktreeID: String, path: String) async throws {
        var request = Yiru_Runtime_V1_GitStagingServiceDiscardRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.filePath = path
        try await sourceMutation(
            hostID,
            procedure: YiruRuntimeV1GitStagingServiceMethods.discard,
            request: request,
            response: Yiru_Runtime_V1_GitStagingServiceDiscardResponse.self,
            isOK: { $0.ok }
        )
    }

    func stageSourceFiles(for hostID: String, worktreeID: String, paths: [String]) async throws {
        var request = Yiru_Runtime_V1_GitStagingServiceBulkStageRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.filePaths = paths
        try await sourceMutation(
            hostID,
            procedure: YiruRuntimeV1GitStagingServiceMethods.bulkStage,
            request: request,
            response: Yiru_Runtime_V1_GitStagingServiceBulkStageResponse.self,
            isOK: { $0.ok }
        )
    }

    func unstageSourceFiles(for hostID: String, worktreeID: String, paths: [String]) async throws {
        var request = Yiru_Runtime_V1_GitStagingServiceBulkUnstageRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.filePaths = paths
        try await sourceMutation(
            hostID,
            procedure: YiruRuntimeV1GitStagingServiceMethods.bulkUnstage,
            request: request,
            response: Yiru_Runtime_V1_GitStagingServiceBulkUnstageResponse.self,
            isOK: { $0.ok }
        )
    }

    func commitSourceFiles(
        for hostID: String,
        worktreeID: String,
        message: String
    ) async throws {
        var request = Yiru_Runtime_V1_GitStagingServiceCommitRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.message = message
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1GitStagingServiceMethods.commit,
            request: request,
            response: Yiru_Runtime_V1_GitStagingServiceCommitResponse.self
        )
        guard response.success else {
            throw SourceControlRepositoryError.rejectedCommit(
                response.hasError ? response.error : nil
            )
        }
    }

    func fetchSourceRemote(for hostID: String, worktreeID: String) async throws {
        var request = Yiru_Runtime_V1_GitRemoteServiceFetchRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        try await sourceMutation(
            hostID,
            procedure: YiruRuntimeV1GitRemoteServiceMethods.fetch,
            request: request,
            response: Yiru_Runtime_V1_GitRemoteServiceFetchResponse.self,
            isOK: { $0.ok }
        )
    }

    func pullSourceRemote(for hostID: String, worktreeID: String) async throws {
        var request = Yiru_Runtime_V1_GitRemoteServicePullRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        try await sourceMutation(
            hostID,
            procedure: YiruRuntimeV1GitRemoteServiceMethods.pull,
            request: request,
            response: Yiru_Runtime_V1_GitRemoteServicePullResponse.self,
            isOK: { $0.ok }
        )
    }

    func pushSourceRemote(
        for hostID: String,
        worktreeID: String,
        publish: Bool,
        forceWithLease: Bool
    ) async throws {
        var request = Yiru_Runtime_V1_GitRemoteServicePushRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.publish = publish
        request.forceWithLease = forceWithLease
        try await sourceMutation(
            hostID,
            procedure: YiruRuntimeV1GitRemoteServiceMethods.push,
            request: request,
            response: Yiru_Runtime_V1_GitRemoteServicePushResponse.self,
            isOK: { $0.ok }
        )
    }

    func fastForwardSourceRemote(for hostID: String, worktreeID: String) async throws {
        var request = Yiru_Runtime_V1_GitRemoteServiceFastForwardRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        try await sourceMutation(
            hostID,
            procedure: YiruRuntimeV1GitRemoteServiceMethods.fastForward,
            request: request,
            response: Yiru_Runtime_V1_GitRemoteServiceFastForwardResponse.self,
            isOK: { $0.ok }
        )
    }

    func liveWorktreeDisplayName(for hostID: String, worktreeID: String) async -> String? {
        guard
            let response = try? await protocolWorktreeShow(hostID: hostID, workspaceID: worktreeID),
            let name = nonEmptyBaseRef(response.worktree.displayName)
        else { return nil }
        return name
    }

    func sourceDefaultBaseRef(
        for hostID: String,
        worktreeID: String,
        repoID: String
    ) async throws -> String {
        // Why: a worktree can pin a comparison base that differs from its repository default,
        // so resolve worktree first, then the repo projection, then the default resolver. That
        // order keeps branch review and rebase actions on the same ref.
        if let show = try? await protocolWorktreeShow(hostID: hostID, workspaceID: worktreeID),
            let baseRef = nonEmptyBaseRef(
                show.worktree.hasBaseRef ? show.worktree.baseRef : nil
            )
        {
            return baseRef
        }
        if let list: Yiru_Runtime_V1_RepoServiceListResponse = try? await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1RepoServiceMethods.list,
            request: Yiru_Runtime_V1_RepoServiceListRequest(),
            response: Yiru_Runtime_V1_RepoServiceListResponse.self
        ), let repo = list.repos.first(where: { $0.id == repoID }),
            let baseRef = nonEmptyBaseRef(repo.hasWorktreeBaseRef ? repo.worktreeBaseRef : nil)
        {
            return baseRef
        }
        var request = Yiru_Runtime_V1_RepoServiceBaseRefDefaultRequest()
        request.repo = "id:\(repoID)"
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1RepoServiceMethods.baseRefDefault,
            request: request,
            response: Yiru_Runtime_V1_RepoServiceBaseRefDefaultResponse.self
        )
        guard
            let baseRef = nonEmptyBaseRef(
                response.hasDefaultBaseRef ? response.defaultBaseRef : nil
            )
        else {
            throw SourceControlRepositoryError.missingBaseRef
        }
        return baseRef
    }

    func rebaseSourceBranch(
        for hostID: String,
        worktreeID: String,
        baseRef: String
    ) async throws {
        var request = Yiru_Runtime_V1_GitHistoryRewriteServiceRebaseFromBaseRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.baseRef = baseRef
        try await sourceMutation(
            hostID,
            procedure: YiruRuntimeV1GitHistoryRewriteServiceMethods.rebaseFromBase,
            request: request,
            response: Yiru_Runtime_V1_GitHistoryRewriteServiceRebaseFromBaseResponse.self,
            isOK: { $0.ok }
        )
    }

    func abortSourceConflict(
        for hostID: String,
        worktreeID: String,
        operation: SourceConflictOperation
    ) async throws {
        switch operation {
        case .merge:
            var request = Yiru_Runtime_V1_GitHistoryRewriteServiceAbortMergeRequest()
            request.worktree = sourceWorktreeID(worktreeID)
            try await sourceMutation(
                hostID,
                procedure: YiruRuntimeV1GitHistoryRewriteServiceMethods.abortMerge,
                request: request,
                response: Yiru_Runtime_V1_GitHistoryRewriteServiceAbortMergeResponse.self,
                isOK: { $0.ok }
            )
        case .rebase:
            var request = Yiru_Runtime_V1_GitHistoryRewriteServiceAbortRebaseRequest()
            request.worktree = sourceWorktreeID(worktreeID)
            try await sourceMutation(
                hostID,
                procedure: YiruRuntimeV1GitHistoryRewriteServiceMethods.abortRebase,
                request: request,
                response: Yiru_Runtime_V1_GitHistoryRewriteServiceAbortRebaseResponse.self,
                isOK: { $0.ok }
            )
        case .revert:
            var request = Yiru_Runtime_V1_GitHistoryRewriteServiceAbortRevertRequest()
            request.worktree = sourceWorktreeID(worktreeID)
            try await sourceMutation(
                hostID,
                procedure: YiruRuntimeV1GitHistoryRewriteServiceMethods.abortRevert,
                request: request,
                response: Yiru_Runtime_V1_GitHistoryRewriteServiceAbortRevertResponse.self,
                isOK: { $0.ok }
            )
        }
    }

    func sourceLocalBranches(
        for hostID: String,
        worktreeID: String
    ) async throws -> SourceLocalBranches {
        var request = Yiru_Runtime_V1_GitStatusServiceLocalBranchesRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1GitStatusServiceMethods.localBranches,
            request: request,
            response: Yiru_Runtime_V1_GitStatusServiceLocalBranchesResponse.self
        )
        return SourceLocalBranches(
            current: response.hasCurrent ? response.current : nil,
            branches: response.branches
        )
    }

    func checkoutSourceBranch(
        for hostID: String,
        worktreeID: String,
        branch: String
    ) async throws {
        var request = Yiru_Runtime_V1_GitBranchServiceCheckoutRequest()
        request.worktree = sourceWorktreeID(worktreeID)
        request.branch = branch
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1GitBranchServiceMethods.checkout,
            request: request,
            response: Yiru_Runtime_V1_GitBranchServiceCheckoutResponse.self
        )
        guard response.ok else { throw SourceControlRepositoryError.rejectedMutation }
    }
}

nonisolated private func nonEmptyBaseRef(_ value: String?) -> String? {
    let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return trimmed.isEmpty ? nil : trimmed
}

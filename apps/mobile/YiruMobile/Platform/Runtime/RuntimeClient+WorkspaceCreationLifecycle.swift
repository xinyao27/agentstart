import Foundation
import YiruProtocol

nonisolated private let workspaceProjectRevisionCapability =
    "workspaceEvents.projectRevision.protobuf.v1"
nonisolated private let maximumJSONSafeInteger: UInt64 = 9_007_199_254_740_991
nonisolated private let worktreeLifecycleCapability = "worktree.lifecycle.protobuf.v1"

extension RuntimeClient {
    func createWorkspace(
        for hostID: String,
        draft: WorkspaceCreationDraft,
        existingPaths: [String]
    ) async throws -> WorkspaceSummary {
        let requestedName = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let baseName =
            requestedName.isEmpty
            ? suggestedWorkspaceName(existingPaths: existingPaths) : requestedName
        guard
            try await supportsCapability(
                hostID: hostID,
                capability: workspaceProjectRevisionCapability
            )
        else {
            throw WorkspaceCreationError.rejected(
                String(localized: "Update Yiru on this host before creating a workspace.")
            )
        }
        guard
            try await supportsCapability(
                hostID: hostID,
                capability: worktreeLifecycleCapability
            )
        else {
            throw WorkspaceCreationError.rejected(
                String(localized: "Update Yiru on this host before creating a workspace.")
            )
        }
        let agent = draft.agentID.flatMap(MobileWorkspaceCreateAgentWire.init(rawValue:))
        var lastMessage: String?
        let attemptLimit = draft.failsOnBranchConflict ? 1 : 25
        for attempt in 0..<attemptLimit {
            let candidate = attempt == 0 ? baseName : "\(baseName)-\(attempt + 1)"
            do {
                let revision = try await workspaceRevision(
                    hostID: hostID,
                    projectID: draft.repoID
                )
                let result = try await protocolCreateWorktree(
                    hostID: hostID,
                    request: worktreeCreateRequest(
                        draft: draft,
                        revision: revision,
                        name: candidate,
                        agent: agent
                    )
                )
                guard result.hasWorktree, !result.worktree.id.isEmpty else {
                    throw RuntimeResponseValidationError("worktree.create.worktree")
                }
                let worktreeID = result.worktree.id
                let snapshot: WorkspaceSnapshot
                do {
                    snapshot = try await fetchWorkspaces(for: hostID)
                } catch is CancellationError {
                    throw CancellationError()
                } catch {
                    throw WorkspaceCreationError.createdWorkspaceUnavailable
                }
                guard
                    let workspace = snapshot.workspaces.first(where: {
                        $0.id == worktreeID
                    })
                else {
                    throw WorkspaceCreationError.createdWorkspaceUnavailable
                }
                return workspace
            } catch is CancellationError {
                throw CancellationError()
            } catch let error as WorkspaceCreationError {
                throw error
            } catch {
                let message = runtimeCreateErrorMessage(error)
                lastMessage = message
                guard isRetryableWorkspaceCreateConflict(message), attempt + 1 < attemptLimit else {
                    throw WorkspaceCreationError.rejected(message)
                }
            }
        }
        throw WorkspaceCreationError.rejected(lastMessage)
    }

    private func worktreeCreateRequest(
        draft: WorkspaceCreationDraft,
        revision: Int,
        name: String,
        agent: MobileWorkspaceCreateAgentWire?
    ) -> Yiru_Runtime_V1_WorktreeServiceCreateRequest {
        var request = Yiru_Runtime_V1_WorktreeServiceCreateRequest()
        request.repo = "id:\(draft.repoID)"
        request.expectedRevision = Int64(revision)
        request.name = name
        if let displayName = draft.displayName { request.displayName = displayName }
        if let baseBranch = nonempty(draft.baseBranch) { request.baseBranch = baseBranch }
        if let compareBaseRef = draft.compareBaseRef { request.compareBaseRef = compareBaseRef }
        if let branchNameOverride = draft.usesWorkspaceNameAsBranch
            ? name : nonempty(draft.branchName)
        {
            request.branchNameOverride = branchNameOverride
        }
        if let comment = nonempty(draft.note) { request.comment = comment }
        request.setupDecision = draft.setupDecision.wire.rawValue
        if let agent {
            request.startupAgent = agent.rawValue
            request.createdWithAgent = agent.rawValue
        }
        if let pushTarget = draft.pushTarget {
            var target = Yiru_Runtime_V1_WorktreePushTarget()
            target.remoteName = pushTarget.remoteName
            target.branchName = pushTarget.branchName
            if let remoteURL = pushTarget.remoteURL { target.remoteURL = remoteURL }
            if let wasRemoteCreated = pushTarget.wasRemoteCreated {
                target.remoteCreated = wasRemoteCreated
            }
            request.pushTarget = target
        }
        if let linkedPullRequest = draft.linkedPullRequest {
            var linkedPR = Yiru_Runtime_V1_WorktreeNullableInt64()
            linkedPR.number = Int64(linkedPullRequest)
            request.linkedPr = linkedPR
            request.activate = true
        }
        return request
    }

    private func runtimeCreateErrorMessage(_ error: Error) -> String? {
        if let error = error as? RuntimeServiceError {
            return error.serverMessage
        }
        if let transportError = error as? RuntimeTransportError,
            case .serverStatus(_, let message) = transportError
        {
            return message
        }
        return nil
    }

    private func nonempty(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func workspaceRevision(hostID: String, projectID: String) async throws -> Int {
        let revision = try await protocolProjectRevision(hostID: hostID, projectID: projectID)
        guard revision <= maximumJSONSafeInteger, let value = Int(exactly: revision) else {
            throw RuntimeResponseValidationError("workspace_events.revision")
        }
        return value
    }

    private func isRetryableWorkspaceCreateConflict(_ message: String?) -> Bool {
        guard let value = message?.lowercased() else { return false }
        return value.contains("already exists locally")
            || value.contains("already exists on a remote")
            || (value.hasPrefix("branch \"") && value.contains("already exists"))
            || value.contains("already has pr #")
    }
}

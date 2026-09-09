import Foundation

nonisolated struct WorkspaceCreationDraft: Sendable {
    let repoID: String
    let name: String
    let baseBranch: String
    let branchName: String
    let usesWorkspaceNameAsBranch: Bool
    let failsOnBranchConflict: Bool
    let note: String
    let displayName: String?
    let compareBaseRef: String?
    let pushTarget: WorkspacePushTarget?
    let linkedPullRequest: Int?
    let setupDecision: WorkspaceSetupDecision
    let agentID: String?
}

nonisolated struct WorkspaceCreationOptions: Sendable {
    let repos: [WorkspaceRepo]
    let agents: [WorkspaceCreationAgent]
    let preferredAgentID: String
    let trustedHooks: WorkspaceTrustedHooks
}

nonisolated struct WorkspaceCreationAgent: Identifiable, Hashable, Sendable {
    let id: String
    let label: String
    let launchCommand: String?

    static let blankID = "__blank__"

    var runtimeID: String? { id == Self.blankID ? nil : id }
}

nonisolated enum WorkspaceCreationError: Error {
    case noRepositories
    case rejected(String?)
    case createdWorkspaceUnavailable
}

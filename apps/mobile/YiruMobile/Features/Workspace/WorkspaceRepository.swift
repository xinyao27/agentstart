nonisolated protocol WorkspaceRepository: Sendable {
    func workspaces(for hostID: String) async throws -> WorkspaceSnapshot
    func workspaceListViewSettings(for hostID: String) async throws -> WorkspaceListViewSettings
    func setWorkspaceCollapsedGroups(hostID: String, groups: Set<String>) async throws
    func workspaceHostCompatibility(for hostID: String) async -> WorkspaceHostCompatibility?
    func allWorkspaceTabUpdates(for hostID: String) async throws
        -> AsyncThrowingStream<[String: [WorkspaceOpenTab]], Error>
    func activateWorkspace(hostID: String, workspaceID: String) async throws
    func selectWorkspaceTab(hostID: String, workspaceID: String, tab: WorkspaceOpenTab) async throws
    func sleepWorkspace(hostID: String, workspaceID: String) async throws
    func setWorkspacePinned(hostID: String, workspaceID: String, isPinned: Bool) async throws
    func removeWorkspace(hostID: String, workspaceID: String) async throws
    func reconnect(hostID: String) async
}

extension WorkspaceRepository {
    func workspaceHostCompatibility(for hostID: String) async -> WorkspaceHostCompatibility? { nil }

    func workspaceListViewSettings(for hostID: String) async throws -> WorkspaceListViewSettings {
        .standard
    }

    func setWorkspaceCollapsedGroups(hostID: String, groups: Set<String>) async throws {}

    func selectWorkspaceTab(hostID: String, workspaceID: String, tab: WorkspaceOpenTab) async throws
    {}
}

nonisolated enum WorkspaceRepositoryError: Error {
    case hostNotFound
    case rejectedMutation
    case timeout
}

nonisolated protocol WorkspaceCreationRepository: Sendable {
    func workspaceCreationOptions(for hostID: String) async throws -> WorkspaceCreationOptions
    func workspaceTerminalAgents(for hostID: String, repoID: String?) async throws
        -> [WorkspaceCreationAgent]
    func workspaceSetupDetails(for hostID: String, repoID: String) async throws
        -> WorkspaceSetupDetails
    func workspaceSourceRefs(for hostID: String, repoID: String, query: String) async throws
        -> [WorkspaceSourceRef]
    func workspaceHostedSources(
        for hostID: String,
        repoID: String,
        query: String
    ) async throws -> [WorkspaceHostedSource]
    func resolveWorkspaceHostedSource(
        for hostID: String,
        repoID: String,
        source: WorkspaceHostedSource
    ) async throws -> WorkspaceHostedBase
    func workspacePastedGitHubSource(
        for hostID: String,
        repoID: String,
        number: Int,
        slug: WorkspaceRepoSlug?
    ) async throws -> WorkspaceHostedSource?
    func workspaceRepoSlug(for hostID: String, repoID: String) async throws -> WorkspaceRepoSlug?
    func persistWorkspaceSetupTrust(
        for hostID: String,
        trustedHooks: WorkspaceTrustedHooks
    ) async throws -> WorkspaceTrustedHooks
    func createWorkspace(
        for hostID: String,
        draft: WorkspaceCreationDraft,
        existingPaths: [String]
    ) async throws -> WorkspaceSummary
}

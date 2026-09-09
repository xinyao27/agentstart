import Foundation

nonisolated private let repoHooksProtobufCapability = "repo.hooks.protobuf.v1"

extension RuntimeClient: WorkspaceCreationRepository {
    func workspaceCreationOptions(for hostID: String) async throws -> WorkspaceCreationOptions {
        async let detectedResult: [String]? = try? await protocolPreflightDetectAgents(
            hostID: hostID
        )
        async let settingsResult: RuntimeClientSettings? = try? await protocolClientSettings(
            for: hostID
        )
        async let uiFields: [String: RuntimeUiValue]? = try? await protocolUiGet(hostID: hostID)
        let repos = await fetchWorkspaceRepos(for: hostID)
        let detected = await detectedResult ?? []
        let settings = await settingsResult
        let trustedHooks = workspaceTrustedHooks(await uiFields)
        let agents = workspaceCreationAgents(
            detectedIDs: detected,
            disabledIDs: settings?.disabledTuiAgents ?? [],
            overrides: settings?.agentCmdOverrides ?? [:]
        )
        return WorkspaceCreationOptions(
            repos: repos,
            agents: agents,
            preferredAgentID: preferredWorkspaceCreationAgentID(
                available: agents,
                preferredID: settings?.defaultTuiAgent
            ),
            trustedHooks: trustedHooks
        )
    }

    func workspaceTerminalAgents(for hostID: String, repoID: String?) async throws
        -> [WorkspaceCreationAgent]
    {
        async let settingsResult: RuntimeClientSettings = protocolClientSettings(for: hostID)
        let connectionID: String?
        if let repoID {
            let repos = await fetchWorkspaceRepos(for: hostID)
            guard let repo = repos.first(where: { $0.id == repoID }) else {
                throw WorkspaceRepositoryError.hostNotFound
            }
            connectionID = repo.connectionID?.trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            connectionID = nil
        }
        let detected: [String]
        if let connectionID, !connectionID.isEmpty {
            detected = try await protocolPreflightDetectRemoteAgents(
                hostID: hostID,
                connectionID: connectionID
            )
        } else {
            detected = try await protocolPreflightDetectAgents(hostID: hostID)
        }
        let settings = try await settingsResult
        let available = workspaceCreationAgents(
            detectedIDs: detected,
            disabledIDs: settings.disabledTuiAgents,
            overrides: settings.agentCmdOverrides
        ).filter { $0.runtimeID != nil }
        guard
            let preferred = available.first(where: {
                $0.id
                    == preferredWorkspaceCreationAgentID(
                        available: available,
                        preferredID: settings.defaultTuiAgent
                    )
            })
        else { return available }
        return [preferred] + available.filter { $0.id != preferred.id }
    }

    func workspaceSetupDetails(for hostID: String, repoID: String) async throws
        -> WorkspaceSetupDetails
    {
        guard
            try await supportsCapability(
                hostID: hostID,
                capability: repoHooksProtobufCapability
            )
        else {
            throw WorkspaceCreationError.rejected(
                String(localized: "Update Yiru on this host before inspecting setup commands.")
            )
        }
        let response = try await protocolRepoHooks(hostID: hostID, projectID: repoID)
        return try WorkspaceSetupDetails(protocolValue: response)
    }
}

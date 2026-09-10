import AgentStartProtocol
import Foundation
import SwiftProtobuf

nonisolated struct RuntimeClientSettings: Equatable, Sendable {
    let defaultTuiAgent: String?
    let disabledTuiAgents: [String]
    let agentCmdOverrides: [String: String]
    let agentDefaultArgs: [String: String]
    let agentDefaultEnv: [String: [String: String]]
    let prBotAuthorOverrides: [String]
}

// Why: the native projection intentionally keeps the six fields mobile consumes and
// strips the snapshot's desktop-only settings (status hooks, minimax keys).
nonisolated func runtimeClientSettings(
    _ snapshot: AgentStart_Runtime_V1_SettingsSnapshot
) -> RuntimeClientSettings {
    RuntimeClientSettings(
        defaultTuiAgent: settingsDefaultTuiAgent(snapshot),
        disabledTuiAgents: snapshot.disabledTuiAgents,
        agentCmdOverrides: snapshot.agentCmdOverrides,
        agentDefaultArgs: snapshot.agentDefaultArgs,
        // Why: a repeated env entry per agent stands in for the JSON record this
        // replaces, and last-wins matches how duplicate JSON keys decode.
        agentDefaultEnv: Dictionary(
            snapshot.agentDefaultEnv.map { ($0.agent, $0.vars) },
            uniquingKeysWith: { _, latest in latest }
        ),
        prBotAuthorOverrides: snapshot.prBotAuthorOverrides
    )
}

nonisolated private func settingsDefaultTuiAgent(
    _ snapshot: AgentStart_Runtime_V1_SettingsSnapshot
) -> String? {
    guard snapshot.hasDefaultTuiAgent, case .agent(let agent)? = snapshot.defaultTuiAgent.value
    else { return nil }
    return agent
}

extension RuntimeClient {
    func protocolClientSettings(for hostID: String) async throws -> RuntimeClientSettings {
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1SettingsServiceMethods.get,
            request: AgentStart_Runtime_V1_SettingsServiceGetRequest(),
            response: AgentStart_Runtime_V1_SettingsServiceGetResponse.self
        )
        return runtimeClientSettings(response.settings)
    }
}

import AgentStartProtocol
import Foundation
import SwiftProtobuf

extension RuntimeClient {
    func protocolPreflightDetectAgents(hostID: String) async throws -> [String] {
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1PreflightServiceMethods.detectAgents,
            request: AgentStart_Runtime_V1_PreflightServiceDetectAgentsRequest(),
            response: AgentStart_Runtime_V1_PreflightServiceDetectAgentsResponse.self
        )
        return response.agents
    }

    func protocolPreflightDetectRemoteAgents(
        hostID: String,
        connectionID: String
    ) async throws -> [String] {
        let request = AgentStart_Runtime_V1_PreflightServiceDetectRemoteAgentsRequest.with {
            $0.connectionID = connectionID
        }
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: AgentStartRuntimeV1PreflightServiceMethods.detectRemoteAgents,
            request: request,
            response: AgentStart_Runtime_V1_PreflightServiceDetectAgentsResponse.self
        )
        return response.agents
    }
}

import Foundation
import SwiftProtobuf
import YiruProtocol

extension RuntimeClient {
    func protocolPreflightDetectAgents(hostID: String) async throws -> [String] {
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1PreflightServiceMethods.detectAgents,
            request: Yiru_Runtime_V1_PreflightServiceDetectAgentsRequest(),
            response: Yiru_Runtime_V1_PreflightServiceDetectAgentsResponse.self
        )
        return response.agents
    }

    func protocolPreflightDetectRemoteAgents(
        hostID: String,
        connectionID: String
    ) async throws -> [String] {
        let request = Yiru_Runtime_V1_PreflightServiceDetectRemoteAgentsRequest.with {
            $0.connectionID = connectionID
        }
        let response = try await protocolUnary(
            hostID: hostID,
            procedure: YiruRuntimeV1PreflightServiceMethods.detectRemoteAgents,
            request: request,
            response: Yiru_Runtime_V1_PreflightServiceDetectAgentsResponse.self
        )
        return response.agents
    }
}

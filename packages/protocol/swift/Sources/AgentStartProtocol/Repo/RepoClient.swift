import Foundation
import SwiftProtobuf

public struct RepoClient: Sendable {
  private let transport: any RuntimeTransport

  public init(transport: any RuntimeTransport) {
    self.transport = transport
  }

  public func getHooks(
    projectID: String,
    options: RuntimeCallOptions = RuntimeCallOptions()
  ) async throws -> AgentStart_Runtime_V1_RepoServiceGetHooksResponse {
    var request = AgentStart_Runtime_V1_RepoServiceGetHooksRequest()
    request.projectID = projectID
    let response = try await transport.unary(
      RuntimeUnaryCall(
        procedure: AgentStartRuntimeV1RepoServiceMethods.getHooks,
        payload: try request.serializedData(),
        options: options
      )
    )
    return try AgentStart_Runtime_V1_RepoServiceGetHooksResponse(serializedBytes: response)
  }
}

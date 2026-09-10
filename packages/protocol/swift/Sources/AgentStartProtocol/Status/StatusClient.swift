import Foundation
import SwiftProtobuf

public struct StatusClient: Sendable {
  private let transport: any RuntimeTransport

  public init(transport: any RuntimeTransport) {
    self.transport = transport
  }

  public func get(options: RuntimeCallOptions = RuntimeCallOptions()) async throws
    -> AgentStart_Runtime_V1_GetStatusResponse
  {
    let request = AgentStart_Runtime_V1_GetStatusRequest()
    let response = try await transport.unary(
      RuntimeUnaryCall(
        procedure: AgentStartRuntimeV1StatusServiceMethods.getStatus,
        payload: try request.serializedData(),
        options: options
      )
    )
    return try AgentStart_Runtime_V1_GetStatusResponse(serializedBytes: response)
  }
}

import Foundation
import SwiftProtobuf

public struct TerminalPreferencesClient: Sendable {
  private let transport: any RuntimeTransport

  public init(transport: any RuntimeTransport) {
    self.transport = transport
  }

  public func getAutoRestoreFit(options: RuntimeCallOptions = RuntimeCallOptions()) async throws
    -> Yiru_Runtime_V1_GetAutoRestoreFitResponse
  {
    let request = Yiru_Runtime_V1_GetAutoRestoreFitRequest()
    let response = try await transport.unary(
      RuntimeUnaryCall(
        procedure: YiruRuntimeV1TerminalPreferencesServiceMethods.getAutoRestoreFit,
        payload: try request.serializedData(),
        options: options
      )
    )
    return try Yiru_Runtime_V1_GetAutoRestoreFitResponse(serializedBytes: response)
  }

  public func setAutoRestoreFit(
    milliseconds: Double?,
    options: RuntimeCallOptions = RuntimeCallOptions()
  ) async throws -> Yiru_Runtime_V1_SetAutoRestoreFitResponse {
    var request = Yiru_Runtime_V1_SetAutoRestoreFitRequest()
    if let milliseconds {
      request.milliseconds = milliseconds
    }
    let response = try await transport.unary(
      RuntimeUnaryCall(
        procedure: YiruRuntimeV1TerminalPreferencesServiceMethods.setAutoRestoreFit,
        payload: try request.serializedData(),
        options: options
      )
    )
    return try Yiru_Runtime_V1_SetAutoRestoreFitResponse(serializedBytes: response)
  }
}

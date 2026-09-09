import Foundation
import SwiftProtobuf

public struct WorktreeClient: Sendable {
    private let transport: any RuntimeTransport

    public init(transport: any RuntimeTransport) {
        self.transport = transport
    }

    public func create(
        request: Yiru_Runtime_V1_WorktreeServiceCreateRequest,
        options: RuntimeCallOptions = RuntimeCallOptions()
    ) async throws -> Yiru_Runtime_V1_WorktreeServiceCreateResponse {
        let response = try await transport.unary(
            RuntimeUnaryCall(
                procedure: YiruRuntimeV1WorktreeServiceMethods.create,
                payload: try request.serializedData(),
                options: options
            )
        )
        return try Yiru_Runtime_V1_WorktreeServiceCreateResponse(serializedBytes: response)
    }
}

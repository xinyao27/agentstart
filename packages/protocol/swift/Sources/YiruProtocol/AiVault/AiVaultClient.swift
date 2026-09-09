import Foundation
import SwiftProtobuf

public struct AiVaultClient: Sendable {
    private let transport: any RuntimeTransport

    public init(transport: any RuntimeTransport) {
        self.transport = transport
    }

    public func listSessions(
        limit: UInt32?,
        force: Bool,
        compact: Bool,
        scopePaths: [String],
        executionHostScope: String? = nil,
        executionHostID: String? = nil,
        options: RuntimeCallOptions = RuntimeCallOptions()
    ) async throws -> Yiru_Runtime_V1_AiVaultServiceListSessionsResponse {
        var request = Yiru_Runtime_V1_AiVaultServiceListSessionsRequest()
        if let limit {
            request.limit = limit
        }
        request.force = force
        request.compact = compact
        request.scopePaths = scopePaths
        if let executionHostScope {
            request.executionHostScope = executionHostScope
        }
        if let executionHostID {
            request.executionHostID = executionHostID
        }
        let response = try await transport.unary(
            RuntimeUnaryCall(
                procedure: YiruRuntimeV1AiVaultServiceMethods.listSessions,
                payload: try request.serializedData(),
                options: options
            )
        )
        return try Yiru_Runtime_V1_AiVaultServiceListSessionsResponse(serializedBytes: response)
    }
}

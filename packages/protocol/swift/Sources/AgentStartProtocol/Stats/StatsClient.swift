import Foundation
import SwiftProtobuf

public struct StatsClient: Sendable {
    private let transport: any RuntimeTransport

    public init(transport: any RuntimeTransport) {
        self.transport = transport
    }

    public func getSummary(
        refreshUsage: Bool,
        range: AgentStart_Runtime_V1_StatsUsageRange,
        options: RuntimeCallOptions = RuntimeCallOptions()
    ) async throws -> AgentStart_Runtime_V1_GetSummaryResponse {
        var request = AgentStart_Runtime_V1_GetSummaryRequest()
        request.refreshUsage = refreshUsage
        request.range = range
        let response = try await transport.unary(
            RuntimeUnaryCall(
                procedure: AgentStartRuntimeV1StatsServiceMethods.getSummary,
                payload: try request.serializedData(),
                options: options
            )
        )
        return try AgentStart_Runtime_V1_GetSummaryResponse(serializedBytes: response)
    }
}

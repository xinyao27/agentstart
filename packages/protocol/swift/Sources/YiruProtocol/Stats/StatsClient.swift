import Foundation
import SwiftProtobuf

public struct StatsClient: Sendable {
    private let transport: any RuntimeTransport

    public init(transport: any RuntimeTransport) {
        self.transport = transport
    }

    public func getSummary(
        refreshUsage: Bool,
        range: Yiru_Runtime_V1_StatsUsageRange,
        options: RuntimeCallOptions = RuntimeCallOptions()
    ) async throws -> Yiru_Runtime_V1_GetSummaryResponse {
        var request = Yiru_Runtime_V1_GetSummaryRequest()
        request.refreshUsage = refreshUsage
        request.range = range
        let response = try await transport.unary(
            RuntimeUnaryCall(
                procedure: YiruRuntimeV1StatsServiceMethods.getSummary,
                payload: try request.serializedData(),
                options: options
            )
        )
        return try Yiru_Runtime_V1_GetSummaryResponse(serializedBytes: response)
    }
}

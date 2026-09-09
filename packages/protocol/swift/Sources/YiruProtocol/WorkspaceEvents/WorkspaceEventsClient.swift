import Foundation
import SwiftProtobuf

public struct WorkspaceEventsClient: Sendable {
    private let transport: any RuntimeTransport

    public init(transport: any RuntimeTransport) {
        self.transport = transport
    }

    public func getProjectRevision(
        projectID: String,
        options: RuntimeCallOptions = RuntimeCallOptions()
    ) async throws -> UInt64 {
        var request = Yiru_Runtime_V1_WorkspaceEventsServiceGetProjectRevisionRequest()
        request.projectID = projectID
        let response = try await transport.unary(
            RuntimeUnaryCall(
                procedure: YiruRuntimeV1WorkspaceEventsServiceMethods.getProjectRevision,
                payload: try request.serializedData(),
                options: options
            )
        )
        return try Yiru_Runtime_V1_WorkspaceEventsServiceGetProjectRevisionResponse(
            serializedBytes: response
        ).revision
    }
}

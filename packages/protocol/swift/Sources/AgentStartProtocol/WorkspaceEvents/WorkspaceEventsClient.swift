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
        var request = AgentStart_Runtime_V1_WorkspaceEventsServiceGetProjectRevisionRequest()
        request.projectID = projectID
        let response = try await transport.unary(
            RuntimeUnaryCall(
                procedure: AgentStartRuntimeV1WorkspaceEventsServiceMethods.getProjectRevision,
                payload: try request.serializedData(),
                options: options
            )
        )
        return try AgentStart_Runtime_V1_WorkspaceEventsServiceGetProjectRevisionResponse(
            serializedBytes: response
        ).revision
    }
}

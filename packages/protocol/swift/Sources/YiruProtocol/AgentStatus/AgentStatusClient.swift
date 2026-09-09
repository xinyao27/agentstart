import Foundation
import SwiftProtobuf

public struct AgentStatusClient: Sendable {
    private let transport: any RuntimeTransport

    public init(transport: any RuntimeTransport) {
        self.transport = transport
    }

    public func inferInterrupt(
        paneKey: String,
        baselineUpdatedAt: Double,
        baselineStateStartedAt: Double,
        baselinePrompt: String,
        baselineAgentType: String?,
        intent: Yiru_Runtime_V1_AgentInterruptIntent,
        inputCount: UInt32?,
        options: RuntimeCallOptions = RuntimeCallOptions()
    ) async throws -> Bool {
        var request = Yiru_Runtime_V1_AgentStatusServiceInferInterruptRequest()
        request.paneKey = paneKey
        request.baselineUpdatedAt = baselineUpdatedAt
        request.baselineStateStartedAt = baselineStateStartedAt
        request.baselinePrompt = baselinePrompt
        if let baselineAgentType {
            request.baselineAgentType = baselineAgentType
        }
        request.intent = intent
        if let inputCount {
            request.inputCount = inputCount
        }
        let response = try await transport.unary(
            RuntimeUnaryCall(
                procedure: YiruRuntimeV1AgentStatusServiceMethods.inferInterrupt,
                payload: try request.serializedData(),
                options: options
            )
        )
        return try Yiru_Runtime_V1_AgentStatusServiceInferInterruptResponse(
            serializedBytes: response
        ).inferred
    }
}

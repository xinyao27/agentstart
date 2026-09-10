import Foundation
import SwiftProtobuf

public struct TerminalClient: Sendable {
    private let transport: any RuntimeTransport

    public init(transport: any RuntimeTransport) {
        self.transport = transport
    }

    public func list(
        worktree: String?,
        limit: UInt32?,
        requireFreshPtyLiveness: Bool,
        options: RuntimeCallOptions = RuntimeCallOptions()
    ) async throws -> AgentStart_Runtime_V1_TerminalServiceListResponse {
        var request = AgentStart_Runtime_V1_TerminalServiceListRequest()
        if let worktree {
            request.worktree = worktree
        }
        if let limit {
            request.limit = limit
        }
        request.requireFreshPtyLiveness = requireFreshPtyLiveness
        return try await unary(
            procedure: AgentStartRuntimeV1TerminalServiceMethods.list,
            request: request,
            response: AgentStart_Runtime_V1_TerminalServiceListResponse.self,
            options: options
        )
    }

    public func close(
        terminal: String,
        options: RuntimeCallOptions = RuntimeCallOptions()
    ) async throws -> AgentStart_Runtime_V1_TerminalServiceCloseResponse {
        var request = AgentStart_Runtime_V1_TerminalServiceCloseRequest()
        request.terminal = terminal
        return try await unary(
            procedure: AgentStartRuntimeV1TerminalServiceMethods.close,
            request: request,
            response: AgentStart_Runtime_V1_TerminalServiceCloseResponse.self,
            options: options
        )
    }

    public func focus(
        terminal: String,
        options: RuntimeCallOptions = RuntimeCallOptions()
    ) async throws -> AgentStart_Runtime_V1_TerminalServiceFocusResponse {
        var request = AgentStart_Runtime_V1_TerminalServiceFocusRequest()
        request.terminal = terminal
        return try await unary(
            procedure: AgentStartRuntimeV1TerminalServiceMethods.focus,
            request: request,
            response: AgentStart_Runtime_V1_TerminalServiceFocusResponse.self,
            options: options
        )
    }

    private func unary<Request: SwiftProtobuf.Message, Response: SwiftProtobuf.Message>(
        procedure: String,
        request: Request,
        response _: Response.Type,
        options: RuntimeCallOptions
    ) async throws -> Response {
        let bytes = try await transport.unary(
            RuntimeUnaryCall(
                procedure: procedure,
                payload: try request.serializedData(),
                options: options
            )
        )
        return try Response(serializedBytes: bytes)
    }
}

import Foundation
import SwiftProtobuf

public struct NotificationsClient: Sendable {
    private let transport: any RuntimeTransport

    public init(transport: any RuntimeTransport) {
        self.transport = transport
    }

    public func getMissedSince(
        lastSeenSequence: Int64,
        options: RuntimeCallOptions = RuntimeCallOptions()
    ) async throws -> AgentStart_Runtime_V1_GetMissedSinceResponse {
        var request = AgentStart_Runtime_V1_GetMissedSinceRequest()
        request.lastSeenSequence = lastSeenSequence
        let response = try await transport.unary(
            RuntimeUnaryCall(
                procedure: AgentStartRuntimeV1NotificationsServiceMethods.getMissedSince,
                payload: try request.serializedData(),
                options: options
            )
        )
        return try AgentStart_Runtime_V1_GetMissedSinceResponse(serializedBytes: response)
    }

    public func subscribe(options: RuntimeCallOptions = RuntimeCallOptions()) async throws
        -> NotificationsStream
    {
        let request = AgentStart_Runtime_V1_SubscribeRequest()
        let stream = try await transport.subscribe(
            RuntimeUnaryCall(
                procedure: AgentStartRuntimeV1NotificationsServiceMethods.subscribe,
                payload: try request.serializedData(),
                options: options
            )
        )
        return NotificationsStream(stream: stream)
    }
}

public struct NotificationsStream: AsyncSequence, Sendable {
    public typealias Element = AgentStart_Runtime_V1_SubscribeResponse

    private let stream: RuntimeStream

    fileprivate init(stream: RuntimeStream) {
        self.stream = stream
    }

    public func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(bytes: stream.events.makeAsyncIterator())
    }

    public func cancel(reason: String? = nil) async throws {
        try await stream.cancel(reason: reason)
    }

    public struct AsyncIterator: AsyncIteratorProtocol {
        private var bytes: RuntimeByteStream.AsyncIterator

        fileprivate init(bytes: RuntimeByteStream.AsyncIterator) {
            self.bytes = bytes
        }

        nonisolated(nonsending) public mutating func next() async throws -> Element? {
            guard let data = try await bytes.next() else { return nil }
            return try Element(serializedBytes: data)
        }
    }
}

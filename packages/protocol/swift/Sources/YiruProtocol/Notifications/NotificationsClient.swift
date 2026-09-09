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
    ) async throws -> Yiru_Runtime_V1_GetMissedSinceResponse {
        var request = Yiru_Runtime_V1_GetMissedSinceRequest()
        request.lastSeenSequence = lastSeenSequence
        let response = try await transport.unary(
            RuntimeUnaryCall(
                procedure: YiruRuntimeV1NotificationsServiceMethods.getMissedSince,
                payload: try request.serializedData(),
                options: options
            )
        )
        return try Yiru_Runtime_V1_GetMissedSinceResponse(serializedBytes: response)
    }

    public func registerPush(
        registration: NotificationsPushRegistration?,
        options: RuntimeCallOptions = RuntimeCallOptions()
    ) async throws -> Yiru_Runtime_V1_RegisterPushResponse {
        var request = Yiru_Runtime_V1_RegisterPushRequest()
        if let registration {
            request.token = registration.token
            request.environment = registration.environment
        }
        let response = try await transport.unary(
            RuntimeUnaryCall(
                procedure: YiruRuntimeV1NotificationsServiceMethods.registerPush,
                payload: try request.serializedData(),
                options: options
            )
        )
        return try Yiru_Runtime_V1_RegisterPushResponse(serializedBytes: response)
    }

    public func subscribe(options: RuntimeCallOptions = RuntimeCallOptions()) async throws
        -> NotificationsStream
    {
        let request = Yiru_Runtime_V1_SubscribeRequest()
        let stream = try await transport.subscribe(
            RuntimeUnaryCall(
                procedure: YiruRuntimeV1NotificationsServiceMethods.subscribe,
                payload: try request.serializedData(),
                options: options
            )
        )
        return NotificationsStream(stream: stream)
    }
}

public struct NotificationsPushRegistration: Sendable {
    public let environment: Yiru_Runtime_V1_ApnsEnvironment
    public let token: String

    public init(environment: Yiru_Runtime_V1_ApnsEnvironment, token: String) {
        self.environment = environment
        self.token = token
    }
}

public struct NotificationsStream: AsyncSequence, Sendable {
    public typealias Element = Yiru_Runtime_V1_SubscribeResponse

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

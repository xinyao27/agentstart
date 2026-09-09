import Foundation
import SwiftProtobuf
import YiruProtocol

// Why: the session-tabs subscriptions are protobuf server streams, so they
// ride the runtime protocol adapter's flow-controlled frame channel the same
// way the notifications stream does; events decode lazily as the consumer
// iterates instead of buffering the whole publication history.

extension RuntimePeer {
    func sessionTabsEvents(worktree: String) async throws -> SessionTabsEventSource {
        var request = Yiru_Runtime_V1_SessionTabsServiceListRequest()
        request.worktree = worktree
        return SessionTabsEventSource(
            stream: try await protocolAdapter.subscribe(
                RuntimeUnaryCall(
                    procedure: YiruRuntimeV1SessionTabsServiceMethods.subscribe,
                    payload: try request.serializedData(),
                    options: RuntimeCallOptions()
                )
            )
        )
    }

    func sessionTabsAllEvents() async throws -> SessionTabsAllEventSource {
        SessionTabsAllEventSource(
            stream: try await protocolAdapter.subscribe(
                RuntimeUnaryCall(
                    procedure: YiruRuntimeV1SessionTabsServiceMethods.subscribeAll,
                    payload: try Yiru_Runtime_V1_SessionTabsServiceListAllRequest()
                        .serializedData(),
                    options: RuntimeCallOptions()
                )
            )
        )
    }
}

nonisolated struct SessionTabsEventSource: AsyncSequence, Sendable {
    typealias Element = Yiru_Runtime_V1_SessionTabsServiceEvent

    private let stream: RuntimeStream

    init(stream: RuntimeStream) {
        self.stream = stream
    }

    func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(bytes: stream.events.makeAsyncIterator())
    }

    func cancel(reason: String? = nil) async throws {
        try await stream.cancel(reason: reason)
    }

    struct AsyncIterator: AsyncIteratorProtocol {
        private var bytes: RuntimeByteStream.AsyncIterator

        init(bytes: RuntimeByteStream.AsyncIterator) {
            self.bytes = bytes
        }

        nonisolated(nonsending) public mutating func next() async throws -> Element? {
            guard let data = try await bytes.next() else { return nil }
            return try Element(serializedBytes: data)
        }
    }
}

nonisolated struct SessionTabsAllEventSource: AsyncSequence, Sendable {
    typealias Element = Yiru_Runtime_V1_SessionTabsServiceAllEvent

    private let stream: RuntimeStream

    init(stream: RuntimeStream) {
        self.stream = stream
    }

    func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(bytes: stream.events.makeAsyncIterator())
    }

    func cancel(reason: String? = nil) async throws {
        try await stream.cancel(reason: reason)
    }

    struct AsyncIterator: AsyncIteratorProtocol {
        private var bytes: RuntimeByteStream.AsyncIterator

        init(bytes: RuntimeByteStream.AsyncIterator) {
            self.bytes = bytes
        }

        nonisolated(nonsending) public mutating func next() async throws -> Element? {
            guard let data = try await bytes.next() else { return nil }
            return try Element(serializedBytes: data)
        }
    }
}

import Foundation
import SwiftProtobuf
import YiruProtocol

// Why: the client-events subscription is a protobuf server stream, so it rides
// the runtime protocol adapter's flow-controlled frame channel the same way the
// session-tabs stream does; events decode lazily as the consumer iterates
// instead of buffering the whole publication history.

extension RuntimePeer {
    func clientEventsEvents() async throws -> ClientEventsEventSource {
        ClientEventsEventSource(
            stream: try await protocolAdapter.subscribe(
                RuntimeUnaryCall(
                    procedure: YiruRuntimeV1ClientEventsServiceMethods.subscribe,
                    payload: try Yiru_Runtime_V1_ClientEventsServiceSubscribeRequest()
                        .serializedData(),
                    options: RuntimeCallOptions()
                )
            )
        )
    }
}

nonisolated struct ClientEventsEventSource: AsyncSequence, Sendable {
    typealias Element = Yiru_Runtime_V1_ClientEventsServiceEvent

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

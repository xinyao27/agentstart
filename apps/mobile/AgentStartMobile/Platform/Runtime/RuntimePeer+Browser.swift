import AgentStartProtocol
import Foundation
import SwiftProtobuf

// Why: the browser screencast subscription is a protobuf server stream, so it
// rides the runtime protocol adapter's flow-controlled frame channel the same
// way the session-tabs stream does; frames arrive inline in the stream events
// instead of on a raw binary side channel.

extension RuntimePeer {
    func browserScreencastEvents(
        request: AgentStart_Runtime_V1_BrowserScreencastSubscribeRequest
    ) async throws -> BrowserScreencastEventSource {
        BrowserScreencastEventSource(
            stream: try await protocolAdapter.subscribe(
                RuntimeUnaryCall(
                    procedure: AgentStartRuntimeV1BrowserScreencastServiceMethods.subscribe,
                    payload: try request.serializedData(),
                    options: RuntimeCallOptions()
                )
            )
        )
    }
}

nonisolated struct BrowserScreencastEventSource: AsyncSequence, Sendable {
    typealias Element = AgentStart_Runtime_V1_BrowserScreencastEvent

    private let stream: RuntimeStream

    init(stream: RuntimeStream) {
        self.stream = stream
    }

    func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(bytes: stream.events.makeAsyncIterator())
    }

    // Why: cancelling the stream is the screencast unsubscribe — the service
    // defines no separate unsubscribe rpc.
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

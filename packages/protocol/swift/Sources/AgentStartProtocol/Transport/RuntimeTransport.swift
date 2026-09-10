import Foundation

public let agentstartRuntimeProtocolVersion = UInt32(AgentStart_Protocol_V1_ProtocolVersion.v2.rawValue)
public let agentstartRuntimeDefaultTimeout: Duration = .seconds(30)
public let agentstartRuntimeInitialCallCreditBytes = 1024 * 1024
public let agentstartRuntimeMaxFrameBytes = 1024 * 1024
public let agentstartRuntimeMaxPendingCalls = 128
public let agentstartRuntimeMaxPendingResponseBytes = 8 * 1024 * 1024
public let agentstartRuntimeMaxPendingRequestBytes = 8 * 1024 * 1024
public let agentstartRuntimeWirePreambleBytes = 5

public enum RuntimeTransportError: Error, Sendable {
    case callBufferExceeded
    case closed
    case deadlineExceeded
    case handshakeFailed
    case pendingCallsExceeded
    case requestExceedsCredit
    case sequenceViolation
    case serverStatus(code: Int32, message: String)
    case unexpectedMessage
    case unsupportedVersion
}

public struct RuntimeCallOptions: Sendable {
    public let timeout: Duration?

    public init(timeout: Duration? = nil) {
        self.timeout = timeout
    }
}

public struct RuntimeUnaryCall: Sendable {
    public let procedure: String
    public let payload: Data
    public let options: RuntimeCallOptions

    public init(
        procedure: String,
        payload: Data,
        options: RuntimeCallOptions = RuntimeCallOptions()
    ) {
        self.procedure = procedure
        self.payload = payload
        self.options = options
    }
}

public struct RuntimeStream: Sendable {
    public let events: RuntimeByteStream

    private let lifetime: RuntimeStreamLifetime

    public init(
        next: @escaping @Sendable () async throws -> Data?,
        cancel: @escaping @Sendable (String?) async throws -> Void
    ) {
        let lifetime = RuntimeStreamLifetime(cancel: cancel)
        self.events = RuntimeByteStream(next: next, lifetime: lifetime)
        self.lifetime = lifetime
    }

    public func cancel(reason: String? = nil) async throws {
        try await lifetime.cancellation.cancel(reason: reason)
    }
}

public struct RuntimeByteStream: AsyncSequence, Sendable {
    public typealias Element = Data

    private let lifetime: RuntimeStreamLifetime
    private let makeIteratorHandler: @Sendable () -> AsyncIterator

    fileprivate init(
        next: @escaping @Sendable () async throws -> Data?,
        lifetime: RuntimeStreamLifetime
    ) {
        self.lifetime = lifetime
        self.makeIteratorHandler = {
            AsyncIterator(
                nextValue: next,
                lifetime: RuntimeStreamIteratorLifetime(cancellation: lifetime.cancellation)
            )
        }
    }

    public func makeAsyncIterator() -> AsyncIterator {
        makeIteratorHandler()
    }

    public struct AsyncIterator: AsyncIteratorProtocol, Sendable {
        private let nextValue: @Sendable () async throws -> Data?
        private let lifetime: RuntimeStreamIteratorLifetime

        fileprivate init(
            nextValue: @escaping @Sendable () async throws -> Data?,
            lifetime: RuntimeStreamIteratorLifetime
        ) {
            self.nextValue = nextValue
            self.lifetime = lifetime
        }

        nonisolated(nonsending) public mutating func next() async throws -> Data? {
            do {
                let value = try await nextValue()
                if value == nil {
                    await lifetime.complete()
                }
                return value
            } catch {
                await lifetime.complete()
                throw error
            }
        }
    }
}

private actor RuntimeStreamCancellation {
    typealias Handler = @Sendable (String?) async throws -> Void

    private var handler: Handler?

    init(cancel: @escaping Handler) {
        self.handler = cancel
    }

    func cancel(reason: String?) async throws {
        guard let handler = takeHandler() else { return }
        try await handler(reason)
    }

    func complete() {
        handler = nil
    }

    private func takeHandler() -> Handler? {
        defer { handler = nil }
        return handler
    }
}

private final class RuntimeStreamLifetime: Sendable {
    let cancellation: RuntimeStreamCancellation

    init(cancel: @escaping RuntimeStreamCancellation.Handler) {
        self.cancellation = RuntimeStreamCancellation(cancel: cancel)
    }

    deinit {
        let cancellation = cancellation
        Task { try? await cancellation.cancel(reason: "Runtime stream consumer stopped") }
    }
}

private final class RuntimeStreamIteratorLifetime: Sendable {
    let cancellation: RuntimeStreamCancellation

    init(cancellation: RuntimeStreamCancellation) {
        self.cancellation = cancellation
    }

    func complete() async {
        await cancellation.complete()
    }

    deinit {
        let cancellation = cancellation
        Task { try? await cancellation.cancel(reason: "Runtime stream consumer stopped") }
    }
}

public protocol RuntimeTransport: Sendable {
    func unary(_ call: RuntimeUnaryCall) async throws -> Data
    func subscribe(_ call: RuntimeUnaryCall) async throws -> RuntimeStream
}

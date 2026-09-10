nonisolated enum RuntimeNotificationEvent: Sendable {
    case notification(
        source: String,
        title: String,
        body: String,
        worktreeID: String?,
        notificationID: String?,
        sequence: Int64?
    )
    case dismiss(notificationID: String, sequence: Int64?)
    case ready
    case end

    var sequence: Int64? {
        switch self {
        case .notification(_, _, _, _, _, let sequence): sequence
        case .dismiss(_, let sequence): sequence
        case .ready, .end: nil
        }
    }
}

nonisolated struct RuntimeNotificationStream: AsyncSequence, Sendable {
    typealias Element = RuntimeNotificationEvent

    private let lifetime: RuntimeNotificationStreamLifetime
    private let nextValue: @Sendable () async throws -> Element?

    init(
        next: @escaping @Sendable () async throws -> Element?,
        cancel: @escaping @Sendable () async -> Void
    ) {
        nextValue = next
        lifetime = RuntimeNotificationStreamLifetime(cancel: cancel)
    }

    func makeAsyncIterator() -> AsyncIterator {
        AsyncIterator(nextValue: nextValue, lifetime: lifetime)
    }

    struct AsyncIterator: AsyncIteratorProtocol {
        private let lifetime: RuntimeNotificationStreamLifetime
        private let nextValue: @Sendable () async throws -> Element?

        fileprivate init(
            nextValue: @escaping @Sendable () async throws -> Element?,
            lifetime: RuntimeNotificationStreamLifetime
        ) {
            self.nextValue = nextValue
            self.lifetime = lifetime
        }

        mutating func next() async throws -> Element? {
            try await withTaskCancellationHandler {
                do {
                    let value = try await nextValue()
                    if value == nil { await lifetime.cancellation.complete() }
                    return value
                } catch {
                    await lifetime.cancellation.complete()
                    throw error
                }
            } onCancel: {
                let cancellation = lifetime.cancellation
                Task { await cancellation.cancel() }
            }
        }
    }
}

nonisolated private final class RuntimeNotificationStreamLifetime: Sendable {
    let cancellation: RuntimeNotificationStreamCancellation

    init(cancel: @escaping RuntimeNotificationStreamCancellation.Handler) {
        cancellation = RuntimeNotificationStreamCancellation(cancel: cancel)
    }

    deinit {
        let cancellation = cancellation
        Task { await cancellation.cancel() }
    }
}

private actor RuntimeNotificationStreamCancellation {
    typealias Handler = @Sendable () async -> Void

    private var handler: Handler?

    init(cancel: @escaping Handler) {
        handler = cancel
    }

    func cancel() async {
        guard let handler else { return }
        self.handler = nil
        await handler()
    }

    func complete() {
        handler = nil
    }
}

nonisolated protocol NotificationRuntimeRepository: Sendable {
    func notificationUpdates(for hostID: String) async throws
        -> RuntimeNotificationStream
    func missedNotifications(for hostID: String, after sequence: Int64) async throws
        -> [RuntimeNotificationEvent]
}

nonisolated struct NotificationRoute: Sendable {
    let hostID: String
    let worktreeID: String?
}

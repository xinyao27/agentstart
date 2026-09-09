import Foundation
import YiruProtocol

nonisolated private enum RuntimeProtocolStreamError: Error {
    case concurrentRead
}

actor RuntimeProtocolStreamBuffer {
    private let limit: Int
    private let onConsumed: @Sendable (Int) async throws -> Void
    private let onCancel: @Sendable (String?) async -> Void
    private var isFinished = false
    private var isReading = false
    private var queue = RuntimeProtocolStreamQueue()
    private var terminalError: Error?
    private var waiter: CheckedContinuation<Data?, Error>?

    init(
        limit: Int,
        onConsumed: @escaping @Sendable (Int) async throws -> Void,
        onCancel: @escaping @Sendable (String?) async -> Void
    ) {
        self.limit = limit
        self.onConsumed = onConsumed
        self.onCancel = onCancel
    }

    func push(_ data: Data) throws {
        guard !isFinished, terminalError == nil else { throw RuntimeTransportError.closed }
        if let waiter {
            self.waiter = nil
            waiter.resume(returning: data)
            return
        }
        guard queue.count < limit else { throw RuntimeTransportError.callBufferExceeded }
        queue.append(data)
    }

    func next() async throws -> Data? {
        guard !isReading else { throw RuntimeProtocolStreamError.concurrentRead }
        isReading = true
        defer { isReading = false }
        return try await withTaskCancellationHandler {
            guard let data = try await takeNext() else { return nil }
            try await onConsumed(data.count)
            return data
        } onCancel: {
            Task { await self.cancel(reason: "Runtime stream consumer cancelled") }
        }
    }

    func finish(error: Error? = nil) {
        if let error {
            terminalError = error
            queue.removeAll()
            waiter?.resume(throwing: error)
        } else {
            isFinished = true
            if queue.isEmpty {
                waiter?.resume(returning: nil)
            }
        }
        waiter = nil
    }

    func cancel(reason: String?) async {
        guard terminalError == nil else { return }
        let shouldNotify = !isFinished || !queue.isEmpty || waiter != nil
        guard shouldNotify else { return }
        isFinished = true
        queue.removeAll()
        waiter?.resume(throwing: CancellationError())
        waiter = nil
        await onCancel(reason)
    }

    private func takeNext() async throws -> Data? {
        if let data = queue.popFirst() {
            return data
        }
        if let terminalError {
            throw terminalError
        }
        if isFinished {
            return nil
        }
        guard waiter == nil else { throw RuntimeProtocolStreamError.concurrentRead }
        return try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<Data?, Error>) in
            waiter = continuation
        }
    }
}

nonisolated private struct RuntimeProtocolStreamQueue {
    private var storage: [Data?] = Array(repeating: nil, count: 16)
    private var head = 0
    private(set) var count = 0

    var isEmpty: Bool { count == 0 }

    mutating func append(_ data: Data) {
        if count == storage.count {
            grow()
        }
        storage[(head + count) % storage.count] = data
        count += 1
    }

    mutating func popFirst() -> Data? {
        guard count > 0, let data = storage[head] else { return nil }
        storage[head] = nil
        head = (head + 1) % storage.count
        count -= 1
        return data
    }

    mutating func removeAll() {
        storage = Array(repeating: nil, count: 16)
        head = 0
        count = 0
    }

    private mutating func grow() {
        var expanded = [Data?](repeating: nil, count: storage.count * 2)
        for offset in 0..<count {
            expanded[offset] = storage[(head + offset) % storage.count]
        }
        storage = expanded
        head = 0
    }
}

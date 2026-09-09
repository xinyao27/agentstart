import Foundation
import YiruProtocol

nonisolated struct RuntimeProtocolDuplex: Sendable {
    let source: RuntimeStream
    let send: @Sendable (Data) async throws -> Void
    let finish: @Sendable () async throws -> Void
}

extension RuntimeProtocolAdapter {
    func duplex(_ call: RuntimeUnaryCall) async throws -> RuntimeProtocolDuplex {
        try ensureCallAdmission()
        let callID = try reserveCallID()
        let buffer = RuntimeProtocolStreamBuffer(
            limit: runtimeProtocolStreamBufferLimit,
            onConsumed: { [weak self] count in
                guard let self else { throw RuntimeTransportError.closed }
                try await self.restoreCredit(callID: callID, byteCount: count)
            },
            onCancel: { [weak self] reason in
                await self?.cancel(
                    callID: callID, reason: reason ?? "Runtime duplex consumer stopped",
                    code: .cancelled)
            }
        )
        pending[callID] = .stream(
            PendingStreamCall(
                buffer: buffer, bufferedResponseBytes: 0,
                incomingCreditBytes: negotiatedCallCreditBytes, isFinished: false, requestBytes: 0,
                timeoutTask: timeoutTask(callID: callID, options: call.options, unary: false)
            ))
        let sender = RuntimeProtocolDuplexSender(credit: negotiatedCallCreditBytes) {
            [weak self] payload in
            guard let self else { throw RuntimeTransportError.closed }
            try await self.sendDuplexFrame(callID: callID, payload: payload)
        }
        duplexSenders[callID] = sender
        do {
            try await sendFrame(
                .callStart(makeCallStart(callID: callID, call: call, defaultTimeout: nil)))
            try await sendDuplexPayload(callID: callID, payload: call.payload)
        } catch {
            await cancel(callID: callID, reason: "Runtime duplex start failed", code: .cancelled)
            throw error
        }
        return RuntimeProtocolDuplex(
            source: RuntimeStream(
                next: { try await buffer.next() },
                cancel: { reason in await buffer.cancel(reason: reason) }),
            send: { [weak self] payload in
                guard let self else { throw RuntimeTransportError.closed }
                try await self.sendDuplexPayload(callID: callID, payload: payload)
            },
            finish: { try await sender.finishInput() }
        )
    }

    func sendDuplexPayload(callID: UInt64, payload: Data) async throws {
        try Task.checkCancellation()
        guard let sender = duplexSenders[callID], case .stream(var stream)? = pending[callID],
            !stream.isFinished
        else {
            throw RuntimeTransportError.closed
        }
        guard payload.count <= negotiatedCallCreditBytes else {
            throw RuntimeTransportError.requestExceedsCredit
        }
        try reserveRequestBytes(payload.count)
        stream.requestBytes += payload.count
        pending[callID] = .stream(stream)
        defer {
            if case .stream(var current)? = pending[callID], !current.isFinished,
                current.requestBytes >= payload.count
            {
                current.requestBytes -= payload.count
                pendingRequestBytes -= payload.count
                pending[callID] = .stream(current)
            }
        }
        try await withTaskCancellationHandler {
            try await sender.send(payload)
        } onCancel: {
            Task {
                await self.cancel(
                    callID: callID, reason: "Runtime duplex send cancelled", code: .cancelled)
            }
        }
    }

    private func sendDuplexFrame(callID: UInt64, payload: Data?) async throws {
        try ensureActiveCall(callID: callID)
        if let payload {
            try await sendFrame(.payload(makePayload(callID: callID, data: payload)))
        } else {
            try await sendFrame(.callEnd(makeCallEnd(callID: callID)))
        }
    }

    func acceptDuplexCredit(_ update: Yiru_Protocol_V1_WindowUpdate) async throws {
        if let sender = duplexSenders[update.callID] {
            try await sender.addCredit(update.creditBytes)
        } else if pending[update.callID] == nil && !isRetiredClientCall(update.callID) {
            throw RuntimeTransportError.unexpectedMessage
        }
    }
}

actor RuntimeProtocolDuplexSender {
    typealias Send = @Sendable (Data?) async throws -> Void
    private struct Write {
        let payload: Data?
        let continuation: CheckedContinuation<Void, Error>
    }
    private let sendFrame: Send
    private let maximumCredit: Int
    private var credit: Int
    private var queue: [Write] = []
    private var isDraining = false
    private var isFinishing = false
    private var failure: Error?

    init(credit: Int, send: @escaping Send) {
        self.credit = credit
        self.maximumCredit = credit
        self.sendFrame = send
    }

    func send(_ payload: Data) async throws {
        guard !isFinishing else { throw RuntimeTransportError.closed }
        try await enqueue(payload)
    }

    func finishInput() async throws {
        guard !isFinishing else { return }
        isFinishing = true
        try await enqueue(nil)
    }

    func addCredit(_ bytes: UInt64) throws {
        guard bytes > 0, bytes <= UInt64(maximumCredit - credit) else {
            throw RuntimeTransportError.unexpectedMessage
        }
        credit += Int(bytes)
        drainIfNeeded()
    }

    func close(_ error: Error) {
        guard failure == nil else { return }
        failure = error
        let writes = queue
        queue.removeAll()
        writes.forEach { $0.continuation.resume(throwing: error) }
    }

    private func enqueue(_ payload: Data?) async throws {
        if let failure { throw failure }
        try Task.checkCancellation()
        guard queue.count < runtimeProtocolOutboundBatchLimit else {
            throw RuntimeTransportError.callBufferExceeded
        }
        try await withCheckedThrowingContinuation { continuation in
            queue.append(Write(payload: payload, continuation: continuation))
            drainIfNeeded()
        }
    }

    private func drainIfNeeded() {
        guard !isDraining, failure == nil, let first = queue.first,
            (first.payload?.count ?? 0) <= credit
        else { return }
        isDraining = true
        Task { await drain() }
    }

    private func drain() async {
        defer { isDraining = false }
        while failure == nil, let first = queue.first, (first.payload?.count ?? 0) <= credit {
            queue.removeFirst()
            credit -= first.payload?.count ?? 0
            do {
                try await sendFrame(first.payload)
                if let failure {
                    first.continuation.resume(throwing: failure)
                } else {
                    first.continuation.resume()
                }
            } catch {
                first.continuation.resume(throwing: error)
                close(error)
            }
        }
    }
}

import Foundation
import YiruProtocol

nonisolated let runtimeProtocolStreamBufferLimit = 128
nonisolated let runtimeProtocolOutboundBufferLimitBytes = 4 * 1024 * 1024
nonisolated let runtimeProtocolOutboundBatchLimit = 256
nonisolated let runtimeProtocolCancelledCallLimit = 1_024

actor RuntimeProtocolAdapter: RuntimeTransport {
    let closeConnection: @Sendable () async -> Void
    let sendBinary: @Sendable (Data) async throws -> Void
    var incomingSequence: UInt64 = 0
    var isClosed = false
    var isDrainingSends = false
    var keepAliveNonce: UInt64 = 0
    var keepAliveTask: Task<Void, Never>?
    var isOpening = false
    var hasSentHello = false
    var negotiatedCallCreditBytes = yiruRuntimeInitialCallCreditBytes
    var negotiatedMaxFrameBytes = yiruRuntimeMaxFrameBytes
    var nextCallID: UInt64 = 1
    var openContinuation: CheckedContinuation<Void, Error>?
    var outgoingSequence: UInt64 = 0
    var outboundInFlightBytes = 0
    var outboundQueue = PendingSendQueue()
    var pending: [UInt64: PendingCall] = [:]
    var duplexSenders: [UInt64: RuntimeProtocolDuplexSender] = [:]
    var pendingResponseBytes = 0
    var pendingRequestBytes = 0
    var pendingPong: PendingPong?
    var pendingWelcome: Yiru_Protocol_V1_Welcome?
    var locallyCancelledCalls = LocallyCancelledCalls(limit: runtimeProtocolCancelledCallLimit)
    var welcome: Yiru_Protocol_V1_Welcome?

    init(
        sendBinary: @escaping @Sendable (Data) async throws -> Void,
        closeConnection: @escaping @Sendable () async -> Void
    ) {
        self.sendBinary = sendBinary
        self.closeConnection = closeConnection
    }

    func receive(_ data: Data) async throws {
        let frame = try RuntimeFrameCodec.decode(data, maxFrameBytes: negotiatedMaxFrameBytes)
        guard incomingSequence < UInt64.max, frame.sequence == incomingSequence + 1 else {
            throw RuntimeTransportError.sequenceViolation
        }
        incomingSequence = frame.sequence
        try await handleFrame(frame)
    }

    func unary(_ call: RuntimeUnaryCall) async throws -> Data {
        try ensureCallAdmission()
        let callID = try reserveCallID()
        try reserveRequestBytes(call.payload.count)
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation {
                (continuation: CheckedContinuation<Data, Error>) in
                pending[callID] = .unary(
                    PendingUnaryCall(
                        bufferedResponseBytes: 0,
                        continuation: continuation,
                        incomingCreditBytes: negotiatedCallCreditBytes,
                        payload: nil,
                        requestBytes: call.payload.count,
                        timeoutTask: timeoutTask(callID: callID, options: call.options, unary: true)
                    )
                )
                Task {
                    do {
                        try await self.startCall(
                            callID: callID,
                            call: call,
                            defaultTimeout: yiruRuntimeDefaultTimeout
                        )
                    } catch {
                        await self.finishFailed(callID: callID, error: error)
                    }
                }
            }
        } onCancel: {
            Task {
                await self.cancel(
                    callID: callID,
                    reason: "Runtime call cancelled",
                    code: .cancelled
                )
            }
        }
    }

    func subscribe(_ call: RuntimeUnaryCall) async throws -> RuntimeStream {
        try ensureCallAdmission()
        let callID = try reserveCallID()
        try reserveRequestBytes(call.payload.count)
        let buffer = RuntimeProtocolStreamBuffer(
            limit: runtimeProtocolStreamBufferLimit,
            onConsumed: { [weak self] byteCount in
                guard let self else { throw RuntimeTransportError.closed }
                try await self.restoreCredit(callID: callID, byteCount: byteCount)
            },
            onCancel: { [weak self] reason in
                await self?.cancel(
                    callID: callID,
                    reason: reason ?? "Runtime stream consumer stopped",
                    code: .cancelled
                )
            }
        )
        pending[callID] = .stream(
            PendingStreamCall(
                buffer: buffer,
                bufferedResponseBytes: 0,
                incomingCreditBytes: negotiatedCallCreditBytes,
                isFinished: false,
                requestBytes: call.payload.count,
                timeoutTask: timeoutTask(callID: callID, options: call.options, unary: false)
            )
        )

        do {
            try await startCall(callID: callID, call: call, defaultTimeout: nil)
        } catch {
            await finishFailed(callID: callID, error: error)
            throw error
        }
        return RuntimeStream(
            next: { try await buffer.next() },
            cancel: { reason in await buffer.cancel(reason: reason) }
        )
    }

    func close() async {
        await terminate(RuntimeTransportError.closed)
    }
}

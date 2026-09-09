import Foundation
import YiruProtocol

extension RuntimeProtocolAdapter {
    func cancel(
        callID: UInt64,
        reason: String,
        code: Yiru_Protocol_V1_StatusCode
    ) async {
        if let call = pending[callID], case .stream(let stream) = call, stream.isFinished {
            _ = takePending(callID: callID)
            return
        }
        guard pending[callID] != nil else { return }
        locallyCancelledCalls.insert(callID)
        guard await finishCall(callID: callID, status: makeStatus(code: code, message: reason))
        else {
            return
        }
        do {
            try await sendFrame(.cancel(makeCancel(callID: callID, reason: reason, code: code)))
        } catch {
            await terminate(error)
        }
    }

    func startCall(
        callID: UInt64,
        call: RuntimeUnaryCall,
        defaultTimeout: Duration?
    ) async throws {
        guard call.payload.count <= negotiatedCallCreditBytes else {
            throw RuntimeTransportError.requestExceedsCredit
        }
        try ensureActiveCall(callID: callID)
        try await sendFrames([
            .callStart(
                makeCallStart(
                    callID: callID,
                    call: call,
                    defaultTimeout: defaultTimeout
                )
            ),
            .payload(makePayload(callID: callID, data: call.payload)),
            .callEnd(makeCallEnd(callID: callID)),
        ])
    }

    func restoreCredit(callID: UInt64, byteCount: Int) async throws {
        guard byteCount >= 0 else { throw RuntimeTransportError.unexpectedMessage }
        guard byteCount > 0 else { return }
        if var call = pending[callID], case .stream(var stream) = call {
            guard
                byteCount <= stream.bufferedResponseBytes,
                byteCount <= pendingResponseBytes
            else {
                await terminate(RuntimeTransportError.unexpectedMessage)
                throw RuntimeTransportError.unexpectedMessage
            }
            stream.bufferedResponseBytes -= byteCount
            pendingResponseBytes -= byteCount
            if stream.isFinished {
                if stream.bufferedResponseBytes == 0 {
                    pending.removeValue(forKey: callID)
                } else {
                    call = .stream(stream)
                    pending[callID] = call
                }
                return
            }
            stream.incomingCreditBytes = min(
                negotiatedCallCreditBytes,
                stream.incomingCreditBytes + byteCount
            )
            call = .stream(stream)
            pending[callID] = call
            do {
                try await sendFrame(
                    .windowUpdate(
                        makeWindowUpdate(callID: callID, creditBytes: UInt64(byteCount))
                    )
                )
            } catch {
                await terminate(error)
                throw error
            }
        }
    }

    func sendFrame(_ body: Yiru_Protocol_V1_Frame.OneOf_Body) async throws {
        try await sendFrames([body])
    }

    func sendFrames(_ bodies: [Yiru_Protocol_V1_Frame.OneOf_Body]) async throws {
        var sequence = outgoingSequence
        let frames = try bodies.map { body in
            guard sequence < UInt64.max else { throw RuntimeTransportError.sequenceViolation }
            sequence += 1
            var frame = Yiru_Protocol_V1_Frame()
            frame.protocolVersion = yiruRuntimeProtocolVersion
            frame.sequence = sequence
            frame.body = body
            return try RuntimeFrameCodec.encode(frame, maxFrameBytes: negotiatedMaxFrameBytes)
        }
        try await enqueueSend(frames, endingSequence: sequence)
    }

    func enqueueSend(_ frames: [Data], endingSequence: UInt64) async throws {
        guard !isClosed else { throw RuntimeTransportError.closed }
        var byteCount = 0
        for frame in frames {
            guard frame.count <= Int.max - byteCount else {
                throw RuntimeTransportError.callBufferExceeded
            }
            byteCount += frame.count
        }
        let occupiedBytes = outboundQueue.bufferedBytes + outboundInFlightBytes
        guard
            outboundQueue.batchCount < runtimeProtocolOutboundBatchLimit,
            byteCount <= runtimeProtocolOutboundBufferLimitBytes - occupiedBytes
        else {
            throw RuntimeTransportError.callBufferExceeded
        }
        try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<Void, Error>) in
            outgoingSequence = endingSequence
            outboundQueue.append(
                PendingSend(
                    byteCount: byteCount,
                    frames: frames,
                    continuation: continuation
                )
            )
            startSendDrainIfNeeded()
        }
    }

    func startSendDrainIfNeeded() {
        guard !isDrainingSends else { return }
        isDrainingSends = true
        Task { await self.drainSends() }
    }

    func drainSends() async {
        while !isClosed {
            guard let next = outboundQueue.popFirst() else {
                isDrainingSends = false
                return
            }
            outboundInFlightBytes = next.byteCount
            do {
                for frame in next.frames {
                    try await sendBinary(frame)
                }
            } catch {
                outboundInFlightBytes = 0
                next.continuation.resume(throwing: error)
                failQueuedSends(error)
                await terminate(error)
                return
            }
            outboundInFlightBytes = 0
            if isClosed {
                next.continuation.resume(throwing: RuntimeTransportError.closed)
                return
            }
            next.continuation.resume()
        }
        failQueuedSends(RuntimeTransportError.closed)
        isDrainingSends = false
    }

    func failQueuedSends(_ error: Error) {
        while let send = outboundQueue.popFirst() {
            send.continuation.resume(throwing: error)
        }
    }

    func reserveCallID() throws -> UInt64 {
        guard nextCallID % 2 == 1 else { throw RuntimeTransportError.unexpectedMessage }
        let callID = nextCallID
        guard nextCallID <= UInt64.max - 2 else { throw RuntimeTransportError.pendingCallsExceeded }
        nextCallID += 2
        return callID
    }

    func ensureCallAdmission() throws {
        guard !isClosed else { throw RuntimeTransportError.closed }
        guard welcome != nil else { throw RuntimeTransportError.handshakeFailed }
        guard pending.count < yiruRuntimeMaxPendingCalls else {
            throw RuntimeTransportError.pendingCallsExceeded
        }
    }

    func ensureActiveCall(callID: UInt64) throws {
        guard !isClosed else { throw RuntimeTransportError.closed }
        guard pending[callID] != nil else { throw CancellationError() }
    }

    func reserveRequestBytes(_ byteCount: Int) throws {
        guard byteCount <= yiruRuntimeMaxPendingRequestBytes - pendingRequestBytes else {
            throw RuntimeTransportError.requestExceedsCredit
        }
        pendingRequestBytes += byteCount
    }

    func timeoutTask(
        callID: UInt64,
        options: RuntimeCallOptions,
        unary: Bool
    ) -> Task<Void, Never> {
        let timeout = options.timeout ?? (unary ? yiruRuntimeDefaultTimeout : nil)
        return Task { [weak self] in
            guard let timeout else { return }
            do {
                try await Task.sleep(for: timeout)
                await self?.cancel(
                    callID: callID,
                    reason: "Runtime call deadline exceeded",
                    code: .deadlineExceeded
                )
            } catch {}
        }
    }

    func startKeepAlive(intervalMs: UInt32) {
        guard intervalMs > 0 else { return }
        keepAliveTask?.cancel()
        keepAliveTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    try await Task.sleep(for: .milliseconds(Int64(intervalMs)))
                    await self?.sendKeepAlivePing()
                } catch {
                    return
                }
            }
        }
    }

    func sendKeepAlivePing() async {
        guard pendingPong == nil, !isClosed else { return }
        guard keepAliveNonce < UInt64.max else {
            await terminate(RuntimeTransportError.sequenceViolation)
            return
        }
        keepAliveNonce += 1
        let nonce = keepAliveNonce
        pendingPong = PendingPong(
            nonce: nonce,
            timeoutTask: Task { [weak self] in
                do {
                    try await Task.sleep(for: .seconds(8))
                    await self?.failPongDeadline(nonce: nonce)
                } catch {}
            }
        )
        do {
            try await sendFrame(.ping(makePing(nonce: nonce)))
        } catch {
            await terminate(error)
        }
    }

    func acceptPong(_ pong: Yiru_Protocol_V1_Pong) async {
        guard let pendingPong, pendingPong.nonce == pong.nonce else {
            await terminate(RuntimeTransportError.unexpectedMessage)
            return
        }
        pendingPong.timeoutTask.cancel()
        self.pendingPong = nil
    }

    func failPongDeadline(nonce: UInt64) async {
        guard pendingPong?.nonce == nonce else { return }
        await terminate(RuntimeTransportError.deadlineExceeded)
    }
}

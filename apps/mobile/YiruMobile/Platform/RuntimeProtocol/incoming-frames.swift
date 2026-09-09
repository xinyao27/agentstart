import Foundation
import YiruProtocol

extension RuntimeProtocolAdapter {
    func handleFrame(_ frame: Yiru_Protocol_V1_Frame) async throws {
        guard let body = frame.body else { throw RuntimeTransportError.unexpectedMessage }
        if welcome == nil {
            switch body {
            case .welcome(let accepted):
                guard isOpening else { throw RuntimeTransportError.handshakeFailed }
                guard hasSentHello else {
                    guard pendingWelcome == nil else {
                        throw RuntimeTransportError.handshakeFailed
                    }
                    pendingWelcome = accepted
                    return
                }
                try acceptWelcome(accepted)
                return
            case .goAway(let goAway):
                let failure = error(for: goAway.status)
                failOpen(failure)
                await terminate(failure)
                throw failure
            default:
                throw RuntimeTransportError.handshakeFailed
            }
        }

        switch body {
        case .welcome:
            throw RuntimeTransportError.handshakeFailed
        case .payload(let payload):
            try await acceptPayload(payload)
        case .callEnd(let end):
            try await finishIncomingCall(callID: end.callID, status: end.status)
        case .cancel(let cancel):
            try await finishIncomingCancel(callID: cancel.callID, status: cancel.status)
        case .goAway(let goAway):
            let failure = error(for: goAway.status)
            await terminate(failure)
            throw failure
        case .ping(let ping):
            Task {
                do {
                    try await self.sendFrame(.pong(makePong(nonce: ping.nonce)))
                } catch {
                    await self.terminate(error)
                }
            }
        case .pong(let pong):
            await acceptPong(pong)
        case .windowUpdate(let update):
            try await acceptDuplexCredit(update)
        case .hello, .callStart:
            throw RuntimeTransportError.unexpectedMessage
        }
    }

    func acceptPayload(_ payload: Yiru_Protocol_V1_Payload) async throws {
        guard var call = pending[payload.callID] else {
            if locallyCancelledCalls.contains(payload.callID) { return }
            throw RuntimeTransportError.unexpectedMessage
        }
        guard payload.data.count <= yiruRuntimeMaxPendingResponseBytes - pendingResponseBytes else {
            await cancel(
                callID: payload.callID,
                reason: "Runtime connection response budget exceeded",
                code: .resourceExhausted
            )
            return
        }
        switch call {
        case .unary(var unary):
            guard unary.incomingCreditBytes >= payload.data.count, unary.payload == nil else {
                throw RuntimeTransportError.callBufferExceeded
            }
            unary.incomingCreditBytes -= payload.data.count
            unary.bufferedResponseBytes += payload.data.count
            pendingResponseBytes += payload.data.count
            unary.payload = payload.data
            call = .unary(unary)
        case .stream(var stream):
            guard !stream.isFinished else { throw RuntimeTransportError.unexpectedMessage }
            guard stream.incomingCreditBytes >= payload.data.count else {
                await cancel(
                    callID: payload.callID,
                    reason: "Runtime stream exceeded its receive credit",
                    code: .resourceExhausted
                )
                return
            }
            stream.incomingCreditBytes -= payload.data.count
            stream.bufferedResponseBytes += payload.data.count
            pendingResponseBytes += payload.data.count
            call = .stream(stream)
            pending[payload.callID] = call
            do {
                try await stream.buffer.push(payload.data)
            } catch {
                if pending[payload.callID] != nil {
                    await cancel(
                        callID: payload.callID,
                        reason: "Runtime stream buffer limit exceeded",
                        code: .resourceExhausted
                    )
                }
                return
            }
            return
        }
        pending[payload.callID] = call
    }

    func finishIncomingCall(callID: UInt64, status: Yiru_Protocol_V1_Status) async throws {
        if await finishCall(callID: callID, status: status) { return }
        guard !isRetiredClientCall(callID) else { return }
        throw RuntimeTransportError.unexpectedMessage
    }

    func finishIncomingCancel(callID: UInt64, status: Yiru_Protocol_V1_Status) async throws {
        if let failure = errorIfPresent(status) {
            if await failCall(callID: callID, error: failure) { return }
        } else if await failCall(callID: callID, error: CancellationError()) {
            return
        }
        guard !isRetiredClientCall(callID) else { return }
        throw RuntimeTransportError.unexpectedMessage
    }

    @discardableResult
    func finishCall(callID: UInt64, status: Yiru_Protocol_V1_Status) async -> Bool {
        if let sender = duplexSenders.removeValue(forKey: callID) {
            await sender.close(errorIfPresent(status) ?? RuntimeTransportError.closed)
        }
        guard let call = pending[callID] else { return false }
        let failure = errorIfPresent(status)
        switch call {
        case .unary(let unary):
            _ = takePending(callID: callID)
            if let failure {
                unary.continuation.resume(throwing: failure)
            } else if let payload = unary.payload {
                unary.continuation.resume(returning: payload)
            } else {
                unary.continuation.resume(throwing: RuntimeTransportError.unexpectedMessage)
            }
        case .stream(var stream):
            if let failure {
                _ = takePending(callID: callID)
                await stream.buffer.finish(error: failure)
            } else {
                guard !stream.isFinished else { return false }
                stream.isFinished = true
                stream.timeoutTask.cancel()
                pendingRequestBytes -= stream.requestBytes
                stream.requestBytes = 0
                if stream.bufferedResponseBytes == 0 {
                    pending.removeValue(forKey: callID)
                } else {
                    pending[callID] = .stream(stream)
                }
                await stream.buffer.finish()
            }
        }
        return true
    }

    func finishFailed(callID: UInt64, error: Error) async {
        _ = await failCall(callID: callID, error: error)
    }

    @discardableResult
    func failCall(callID: UInt64, error: Error) async -> Bool {
        if let sender = duplexSenders.removeValue(forKey: callID) { await sender.close(error) }
        guard let call = takePending(callID: callID) else { return false }
        switch call {
        case .unary(let unary):
            unary.continuation.resume(throwing: error)
        case .stream(let stream):
            await stream.buffer.finish(error: error)
        }
        return true
    }

    func takePending(callID: UInt64) -> PendingCall? {
        guard let call = pending.removeValue(forKey: callID) else { return nil }
        pendingResponseBytes -= call.bufferedResponseBytes
        pendingRequestBytes -= call.requestBytes
        call.timeoutTask.cancel()
        return call
    }

    func isRetiredClientCall(_ callID: UInt64) -> Bool {
        callID > 0 && callID % 2 == 1 && callID < nextCallID
    }

    func terminate(_ error: Error) async {
        guard !isClosed else { return }
        isClosed = true
        failOpen(error)
        keepAliveTask?.cancel()
        keepAliveTask = nil
        pendingPong?.timeoutTask.cancel()
        pendingPong = nil
        failQueuedSends(error)
        isDrainingSends = false
        let senders = duplexSenders
        duplexSenders.removeAll()
        let calls = pending
        pending.removeAll()
        pendingRequestBytes = 0
        pendingResponseBytes = 0
        for sender in senders.values { await sender.close(error) }
        for call in calls.values {
            call.timeoutTask.cancel()
            switch call {
            case .unary(let unary):
                unary.continuation.resume(throwing: error)
            case .stream(let stream):
                await stream.buffer.finish(error: error)
            }
        }
        await closeConnection()
    }
}

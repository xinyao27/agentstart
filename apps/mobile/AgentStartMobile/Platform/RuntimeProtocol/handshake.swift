import AgentStartProtocol
import Foundation

extension RuntimeProtocolAdapter {
    func open(peerVersion: String) async throws {
        guard !isClosed else { throw RuntimeTransportError.closed }
        if welcome != nil { return }
        guard !isOpening else { throw RuntimeTransportError.handshakeFailed }
        isOpening = true
        do {
            try Task.checkCancellation()
            try await withTaskCancellationHandler {
                try await sendFrame(.hello(makeHello(peerVersion: peerVersion)))
            } onCancel: {
                Task { await self.terminate(CancellationError()) }
            }
            try Task.checkCancellation()
            hasSentHello = true
            if let pendingWelcome {
                self.pendingWelcome = nil
                try acceptWelcome(pendingWelcome)
                return
            }
            try await waitForWelcome()
        } catch {
            failOpen(error)
            throw error
        }
    }

    private func waitForWelcome() async throws {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation {
                (continuation: CheckedContinuation<Void, Error>) in
                guard isOpening, hasSentHello, openContinuation == nil else {
                    continuation.resume(throwing: RuntimeTransportError.handshakeFailed)
                    return
                }
                openContinuation = continuation
            }
        } onCancel: {
            Task { await self.failOpen(CancellationError()) }
        }
    }

    func makeHello(peerVersion: String) -> AgentStart_Protocol_V1_Hello {
        var hello = AgentStart_Protocol_V1_Hello()
        hello.supportedProtocolVersions = [agentstartRuntimeProtocolVersion]
        hello.peerKind = .iosApp
        hello.peerName = "AgentStart iOS"
        hello.peerVersion = peerVersion
        hello.peerInstanceID = UUID().uuidString.lowercased()
        hello.maxFrameBytes = UInt32(agentstartRuntimeMaxFrameBytes)
        hello.initialCallCreditBytes = UInt64(agentstartRuntimeInitialCallCreditBytes)
        hello.supportedTransportFeatures = []
        return hello
    }

    func acceptWelcome(_ accepted: AgentStart_Protocol_V1_Welcome) throws {
        guard isOpening, hasSentHello, welcome == nil,
            accepted.protocolVersion == agentstartRuntimeProtocolVersion,
            accepted.maxFrameBytes >= UInt32(agentstartRuntimeWirePreambleBytes),
            accepted.initialCallCreditBytes > 0,
            accepted.keepAliveIntervalMs > 0,
            accepted.enabledTransportFeatures.isEmpty,
            !accepted.runtimeID.isEmpty,
            !accepted.sessionID.isEmpty
        else {
            throw RuntimeTransportError.handshakeFailed
        }
        welcome = accepted
        negotiatedMaxFrameBytes = Int(
            min(UInt64(agentstartRuntimeMaxFrameBytes), UInt64(accepted.maxFrameBytes)))
        negotiatedCallCreditBytes = Int(
            min(UInt64(agentstartRuntimeInitialCallCreditBytes), accepted.initialCallCreditBytes)
        )
        startKeepAlive(intervalMs: accepted.keepAliveIntervalMs)
        finishOpen()
    }

    func finishOpen() {
        openContinuation?.resume()
        openContinuation = nil
        isOpening = false
        pendingWelcome = nil
    }

    func failOpen(_ error: Error) {
        openContinuation?.resume(throwing: error)
        openContinuation = nil
        hasSentHello = false
        isOpening = false
        pendingWelcome = nil
    }
}

nonisolated func mobileRuntimeProtocolPeerVersion() -> String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
}

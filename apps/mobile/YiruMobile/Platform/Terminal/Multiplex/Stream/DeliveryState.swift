import Foundation

actor TerminalMultiplexDeliveryState {
    private let route: TerminalBulkRoute
    private let delivery: TerminalMultiplexDelivery
    private var appState = TerminalSessionAppState.foreground
    private var subscribedAppState = TerminalSessionAppState.foreground
    private struct PendingReveal: Sendable {
        let stateVersion: UInt32
        let generation: UInt64
    }

    private var pendingReveal: PendingReveal?
    private var transitionGeneration: UInt64 = 0

    init(
        route: TerminalBulkRoute,
        delivery: TerminalMultiplexDelivery
    ) {
        self.route = route
        self.delivery = delivery
    }

    func transition(to state: TerminalSessionAppState, isSubscribed: Bool) async throws {
        guard state != appState else {
            await route.setAppState(state == .foreground ? .foreground : .background)
            return
        }
        appState = state
        transitionGeneration += 1
        let generation = transitionGeneration
        switch state {
        case .foreground:
            await route.setAppState(.foreground)
            guard isCurrent(generation, state: .foreground) else { return }
            if isSubscribed {
                try await apply(.foreground, generation: generation)
            }
        case .background:
            if isSubscribed {
                try await apply(.background, generation: generation)
            }
            guard isCurrent(generation, state: .background) else { return }
            await route.setAppState(.background)
        }
    }

    func prepareSubscription() -> TerminalSessionAppState {
        subscribedAppState = appState
        return appState
    }

    func reconcileAfterSubscription() async throws {
        if subscribedAppState != appState {
            transitionGeneration += 1
            try await apply(appState, generation: transitionGeneration)
        }
    }

    func handleAcknowledgement(_ frame: TerminalMultiplexFrame) async throws -> Bool {
        guard let record = TerminalMultiplexFlowRecordCodec.decodeAck(frame.payload),
            record.cumulativeSequence == frame.sequence
        else {
            throw TerminalMultiplexSessionError.invalidAcknowledgement
        }
        guard record.kind == 3 else { return false }
        guard frame.correlationID == pendingReveal?.stateVersion else { return true }
        guard record.status == 0, frame.correlationID != 0 else {
            pendingReveal = nil
            return true
        }
        let stateVersion = frame.correlationID
        guard let generation = pendingReveal?.generation else { return true }
        pendingReveal = nil
        try await delivery.beginReveal()
        guard isCurrent(generation, state: .foreground) else { return true }
        let payload = try JSONEncoder().encode(
            TerminalMultiplexRevealRecord(stateVersion: stateVersion)
        )
        let correlationID = try await route.allocateCorrelationID()
        guard isCurrent(generation, state: .foreground) else { return true }
        let sequence = await delivery.currentParsedSequence()
        guard isCurrent(generation, state: .foreground) else { return true }
        try await send(
            opcode: .revealSnapshot,
            sequence: sequence,
            correlationID: correlationID,
            payload: payload
        )
        return true
    }

    private func apply(_ state: TerminalSessionAppState, generation: UInt64) async throws {
        guard isCurrent(generation, state: state) else { return }
        switch state {
        case .foreground:
            guard
                let stateVersion = try await prepareVisibility(
                    isVisible: true,
                    hasDeliveryInterest: true,
                    priority: 2,
                    generation: generation,
                    state: state
                )
            else { return }
            pendingReveal = PendingReveal(stateVersion: stateVersion.id, generation: generation)
            try await sendVisibility(stateVersion)
            guard isCurrent(generation, state: state) else { return }
        case .background:
            pendingReveal = nil
            guard
                let stateVersion = try await prepareVisibility(
                    isVisible: false,
                    hasDeliveryInterest: false,
                    priority: 0,
                    generation: generation,
                    state: state
                )
            else { return }
            try await sendVisibility(stateVersion)
            guard isCurrent(generation, state: state) else { return }
            try await delivery.suspendDelivery()
            guard isCurrent(generation, state: state) else { return }
        }
        subscribedAppState = state
    }

    private struct PendingVisibility: Sendable {
        let id: UInt32
        let sequence: UInt64
        let payload: Data
    }

    private func prepareVisibility(
        isVisible: Bool,
        hasDeliveryInterest: Bool,
        priority: UInt8,
        generation: UInt64,
        state: TerminalSessionAppState
    ) async throws -> PendingVisibility? {
        let stateVersion = try await route.allocateCorrelationID()
        guard isCurrent(generation, state: state) else { return nil }
        guard
            let payload = TerminalMultiplexFlowRecordCodec.encode(
                TerminalMultiplexVisibilityRecord(
                    isVisible: isVisible,
                    hasDeliveryInterest: hasDeliveryInterest,
                    priority: priority,
                    stateVersion: stateVersion
                )
            )
        else {
            throw TerminalMultiplexSessionError.invalidFrame
        }
        let sequence = await delivery.currentParsedSequence()
        guard isCurrent(generation, state: state) else { return nil }
        return PendingVisibility(id: stateVersion, sequence: sequence, payload: payload)
    }

    private func sendVisibility(_ visibility: PendingVisibility) async throws {
        try await send(
            opcode: .visibilityGate,
            sequence: visibility.sequence,
            correlationID: visibility.id,
            payload: visibility.payload
        )
    }

    private func isCurrent(_ generation: UInt64, state: TerminalSessionAppState) -> Bool {
        generation == transitionGeneration && state == appState
    }

    private func send(
        opcode: TerminalMultiplexOpcodeWire,
        sequence: UInt64,
        correlationID: UInt32,
        payload: Data
    ) async throws {
        try await route.send(
            opcode: opcode,
            sequence: sequence,
            correlationID: correlationID,
            payload: payload
        )
    }
}

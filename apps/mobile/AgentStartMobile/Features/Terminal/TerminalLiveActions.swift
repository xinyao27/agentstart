import Foundation

@MainActor
extension TerminalLiveModel {
    func enqueue(_ action: TerminalSurfaceAction) {
        guard session != nil else {
            resolveConfirmation(in: action, as: .rejected)
            return
        }
        pendingActions.append(action)
        guard actionDrain == nil else { return }
        let connectionID = activeConnectionID
        let drainID = UUID()
        actionDrainID = drainID
        actionDrain = Task { [weak self] in
            await self?.drainActions(connectionID: connectionID, drainID: drainID)
        }
    }
    func drainActions(connectionID: UUID?, drainID: UUID) async {
        while activeConnectionID == connectionID, !pendingActions.isEmpty, !Task.isCancelled {
            let action = pendingActions.removeFirst()
            guard let session else {
                resolveConfirmation(in: action, as: .rejected)
                continue
            }
            do {
                switch action {
                case .input(let bytes):
                    try await session.sendInput(bytes)
                case .confirmedInput(let bytes, let continuation):
                    try await session.sendInputConfirmed(bytes)
                    continuation.resume(returning: .accepted)
                case .queryReply(let bytes):
                    try await session.sendQueryReply(bytes)
                case .resize(let size):
                    try await session.resize(size)
                }
            } catch {
                resolveConfirmation(in: action, as: deliveryOutcome(for: error))
                guard shouldReconnect(after: error) else { continue }
                guard activeConnectionID == connectionID, !Task.isCancelled else { break }
                self.session = nil
                discardPendingActions(as: .rejected)
                await session.close()
            }
        }
        guard actionDrainID == drainID else { return }
        actionDrain = nil
        actionDrainID = nil
    }
    func cancelActionDrain() {
        actionDrain?.cancel()
        actionDrain = nil
        actionDrainID = nil
    }
    func discardPendingActions(as outcome: TerminalInputDeliveryOutcome) {
        let actions = pendingActions
        pendingActions.removeAll(keepingCapacity: true)
        for action in actions {
            resolveConfirmation(in: action, as: outcome)
        }
    }
    func resolveConfirmation(
        in action: TerminalSurfaceAction,
        as outcome: TerminalInputDeliveryOutcome
    ) {
        guard case .confirmedInput(_, let continuation) = action else { return }
        continuation.resume(returning: outcome)
    }
    func deliveryOutcome(for error: Error) -> TerminalInputDeliveryOutcome {
        if let confirmation = error as? TerminalInputConfirmationError {
            switch confirmation {
            case .rejected: return .rejected
            case .deliveryUnknown: return .unknown
            }
        }
        if let sessionError = error as? TerminalMultiplexSessionError {
            switch sessionError {
            case .inputBackpressured, .invalidInput: return .rejected
            case .closed, .invalidFrame, .invalidSubscription, .invalidCredit,
                .invalidAcknowledgement, .server:
                return .unknown
            }
        }
        return .unknown
    }
    func shouldReconnect(after error: Error) -> Bool {
        if let confirmation = error as? TerminalInputConfirmationError {
            return confirmation == .deliveryUnknown
        }
        if let sessionError = error as? TerminalMultiplexSessionError {
            switch sessionError {
            case .inputBackpressured, .invalidInput: return false
            case .closed, .invalidFrame, .invalidSubscription, .invalidCredit,
                .invalidAcknowledgement, .server:
                return true
            }
        }
        return true
    }
}

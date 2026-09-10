import Foundation

nonisolated enum RuntimeConnectionPhase: Equatable, Sendable {
    case idle
    case connecting
    case connected
    case reconnecting
    case unreachable
    case authenticationFailed
}

nonisolated struct RuntimeConnectionSnapshot: Equatable, Sendable {
    let hostID: String
    let hostName: String
    let phase: RuntimeConnectionPhase
    let reconnectAttempt: Int
    let lastConnectedAt: Date?
}

extension RuntimeConnectionSnapshot {
    // Why: offer a manual escape hatch after three failed reconnect attempts while keeping the
    // list usable through the longer backoff window. The threshold lives in the transport model
    // so every surface renders the same connection verdict.
    static let retryWarningAttempt = 3

    var shouldShowRetry: Bool {
        switch phase {
        case .reconnecting:
            reconnectAttempt >= Self.retryWarningAttempt
        case .unreachable, .authenticationFailed:
            true
        case .idle, .connecting, .connected:
            false
        }
    }

    var isReconnectWarning: Bool {
        phase == .reconnecting && reconnectAttempt >= Self.retryWarningAttempt
    }
}

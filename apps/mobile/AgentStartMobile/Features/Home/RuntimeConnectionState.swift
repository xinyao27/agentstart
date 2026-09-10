nonisolated enum RuntimeConnectionState: Equatable, Sendable {
    case unpaired
    case paired(hostName: String)
    case connecting(hostName: String)
    case connected(hostName: String)
    case reconnecting(hostName: String, reconnectAttempt: Int)
    case unavailable(hostName: String, reconnectAttempt: Int)
    case authenticationFailed(hostName: String)
}

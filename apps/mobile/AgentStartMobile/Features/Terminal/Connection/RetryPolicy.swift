import Foundation

nonisolated enum TerminalReconnectPolicy {
    /// Why: the delays below already escalate to 90s, so the loop is bounded by attempt count
    /// rather than by wall-clock time. Past this the terminal reports a failure instead of
    /// retrying forever, which is what makes `TerminalLivePhase.failed` — and the banner's
    /// "tap to reconnect" action — reachable at all.
    static let maximumAttempts = 8

    static func delay(attempt: Int) -> Duration {
        let delays: [Duration] = [
            .milliseconds(500),
            .seconds(1),
            .seconds(2),
            .seconds(4),
            .seconds(8),
            .seconds(15),
            .seconds(30),
            .seconds(60),
        ]
        guard attempt <= delays.count else { return .seconds(90) }
        return delays[attempt - 1]
    }
}

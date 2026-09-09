import Foundation

nonisolated struct RuntimeReconnectPolicy: Sendable {
    let delays: [Duration]
    let fastAttemptLimit: Int
    let trickleDelay: Duration
    let authenticationRetryLimit: Int
    let maximumJitterRatio: Double
    let revivalMinimumInterval: Duration

    // Why: positive-only jitter preserves each backoff floor while spreading hosts, and the
    // revival interval coalesces path flaps without making a genuine recovery wait long.
    static let mobile = RuntimeReconnectPolicy(
        delays: [
            .milliseconds(500), .seconds(1), .seconds(2), .seconds(4), .seconds(8),
            .seconds(15), .seconds(30), .seconds(60),
        ],
        fastAttemptLimit: 12,
        trickleDelay: .seconds(90),
        authenticationRetryLimit: 3,
        maximumJitterRatio: 0.2,
        revivalMinimumInterval: .seconds(8)
    )

    func delay(after attempt: Int) -> Duration {
        let baseDelay =
            attempt < fastAttemptLimit
            ? delays[min(max(0, attempt - 1), delays.count - 1)]
            : trickleDelay
        return baseDelay * Double.random(in: 1...(1 + maximumJitterRatio))
    }
}

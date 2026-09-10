import Foundation

nonisolated enum TerminalReconnectPolicy {
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

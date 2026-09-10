import Foundation

nonisolated protocol PairingRuntime: Sendable {
    func pair(
        _ offer: PairingOffer,
        log: @escaping PairingLogSink
    ) async throws -> HostProfile
}

nonisolated enum PairingLogLevel: Sendable {
    case info
    case success
    case warning
    case error
}

nonisolated struct PairingLogEntry: Identifiable, Sendable {
    let id: UUID
    let date: Date
    let level: PairingLogLevel
    let message: String
    let detail: String?
}

typealias PairingLogSink =
    @Sendable (
        PairingLogLevel,
        String,
        String?
    ) async -> Void

nonisolated enum PairingRuntimeError: Error {
    case invalidEndpoint
    case timeout
    case cancelled
    case unexpectedMessage
    case authenticationFailed
    case connectionFailed(String)
}

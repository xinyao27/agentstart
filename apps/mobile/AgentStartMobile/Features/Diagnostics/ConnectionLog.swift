import Foundation

nonisolated enum ConnectionLogLevel: String, Codable, Sendable {
    case info
    case success
    case warning
    case error
}

nonisolated struct ConnectionLogEntry: Identifiable, Codable, Sendable {
    let id: UUID
    let date: Date
    let level: ConnectionLogLevel
    let message: String
    let detail: String?
}

nonisolated struct ConnectionDiagnosticsSnapshot: Sendable {
    let phase: RuntimeConnectionPhase
    let reconnectAttempt: Int
    let lastConnectedAt: Date?
    let entries: [ConnectionLogEntry]
}

nonisolated protocol ConnectionDiagnosticsRepository: Sendable {
    func connectionDiagnostics(for hostID: String) async throws
        -> AsyncStream<ConnectionDiagnosticsSnapshot>
}

actor RuntimeConnectionLogStore {
    private let maximumEntries = 200
    private var entries: [String: [ConnectionLogEntry]] = [:]
    private var snapshots: [String: RuntimeConnectionSnapshot] = [:]
    private var continuations:
        [String: [UUID: AsyncStream<ConnectionDiagnosticsSnapshot>.Continuation]] = [:]

    func append(
        hostID: String,
        level: ConnectionLogLevel,
        message: String,
        detail: String? = nil
    ) {
        var hostEntries = entries[hostID] ?? []
        hostEntries.append(
            ConnectionLogEntry(
                id: UUID(),
                date: Date(),
                level: level,
                message: message,
                detail: detail
            )
        )
        if hostEntries.count > maximumEntries {
            hostEntries.removeFirst(hostEntries.count - maximumEntries)
        }
        entries[hostID] = hostEntries
        publish(hostID)
    }

    func record(_ snapshot: RuntimeConnectionSnapshot) {
        snapshots[snapshot.hostID] = snapshot
        publish(snapshot.hostID)
    }

    func updates(hostID: String) -> AsyncStream<ConnectionDiagnosticsSnapshot> {
        let id = UUID()
        let (stream, continuation) = AsyncStream.makeStream(
            of: ConnectionDiagnosticsSnapshot.self,
            bufferingPolicy: .bufferingNewest(1)
        )
        continuations[hostID, default: [:]][id] = continuation
        continuation.yield(value(hostID))
        continuation.onTermination = { [weak self] _ in
            Task { await self?.remove(hostID: hostID, id: id) }
        }
        return stream
    }

    private func publish(_ hostID: String) {
        let next = value(hostID)
        continuations[hostID]?.values.forEach { $0.yield(next) }
    }

    private func value(_ hostID: String) -> ConnectionDiagnosticsSnapshot {
        let snapshot = snapshots[hostID]
        return ConnectionDiagnosticsSnapshot(
            phase: snapshot?.phase ?? .idle,
            reconnectAttempt: snapshot?.reconnectAttempt ?? 0,
            lastConnectedAt: snapshot?.lastConnectedAt,
            entries: entries[hostID] ?? []
        )
    }

    private func remove(hostID: String, id: UUID) {
        continuations[hostID]?.removeValue(forKey: id)
        if continuations[hostID]?.isEmpty == true { continuations.removeValue(forKey: hostID) }
    }
}

typealias RuntimeConnectionLogSink =
    @Sendable (
        ConnectionLogLevel,
        String,
        String?
    ) async -> Void

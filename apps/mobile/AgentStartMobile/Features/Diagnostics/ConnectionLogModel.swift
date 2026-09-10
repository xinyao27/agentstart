import Foundation
import Observation
import UIKit

@Observable
@MainActor
final class ConnectionLogModel {
    private(set) var hosts: [HostProfile] = []
    private(set) var snapshot = ConnectionDiagnosticsSnapshot(
        phase: .idle,
        reconnectAttempt: 0,
        lastConnectedAt: nil,
        entries: []
    )
    private(set) var isCopied = false
    var selectedHostID: String?

    @ObservationIgnored private let hostsRepository: any HostRepository
    @ObservationIgnored private let diagnosticsRepository: any ConnectionDiagnosticsRepository

    init(
        hosts: any HostRepository,
        diagnostics: any ConnectionDiagnosticsRepository
    ) {
        hostsRepository = hosts
        diagnosticsRepository = diagnostics
    }

    var selectedHost: HostProfile? {
        hosts.first { $0.id == selectedHostID }
    }

    func load() async {
        do {
            hosts = try await hostsRepository.hosts().sorted {
                $0.lastConnected > $1.lastConnected
            }
            if selectedHost == nil { selectedHostID = hosts.first?.id }
        } catch {
            hosts = []
            selectedHostID = nil
        }
    }

    func observe() async {
        guard let selectedHostID else { return }
        do {
            let updates = try await diagnosticsRepository.connectionDiagnostics(
                for: selectedHostID
            )
            for await value in updates {
                guard self.selectedHostID == selectedHostID else { return }
                snapshot = value
            }
        } catch is CancellationError {
            return
        } catch {
            return
        }
    }

    func copyDiagnostics() {
        guard let host = selectedHost else { return }
        UIPasteboard.general.string = diagnosticsReport(host: host, snapshot: snapshot)
        isCopied = true
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            self?.isCopied = false
        }
    }
}

@MainActor private func diagnosticsReport(
    host: HostProfile,
    snapshot: ConnectionDiagnosticsSnapshot,
    now: Date = Date()
) -> String {
    let version =
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        ?? "unknown"
    let endpointHost = URL(string: host.endpoint)?.host(percentEncoded: false) ?? host.endpoint
    let isTailscale = endpointHost.hasSuffix(".ts.net") || endpointHost.hasPrefix("100.")
    var lines = [
        "AgentStart Mobile connection diagnostics",
        "Generated: \(now.ISO8601Format())",
        "App: AgentStart Mobile \(version) · iOS \(UIDevice.current.systemVersion)",
        "Host: \(host.name)",
        "Endpoint: \(endpointHost)\(isTailscale ? " (Tailscale)" : "")",
        "State: \(connectionPhaseLabel(snapshot.phase)) (reconnect attempts: \(snapshot.reconnectAttempt))",
        snapshot.lastConnectedAt.map {
            "Last connected: \($0.ISO8601Format()) (\(agoLabel(now.timeIntervalSince($0))) ago)"
        } ?? "Last connected: never this session",
        "",
    ]
    if snapshot.entries.isEmpty {
        lines.append("No connection events recorded this session.")
    } else {
        lines.append("Connection log (\(snapshot.entries.count) events, oldest first):")
        lines.append(
            contentsOf: snapshot.entries.map { entry in
                let detail = entry.detail.map { " — \($0)" } ?? ""
                return
                    "\(entry.date.ISO8601Format()) [\(entry.level.rawValue)] \(entry.message)\(detail)"
            })
    }
    return lines.joined(separator: "\n")
}

// Why: a relative duration reads faster than a bare ISO timestamp
// when eyeballing how stale a connection is.
nonisolated private func agoLabel(_ interval: TimeInterval) -> String {
    let seconds = max(0, Int(interval.rounded()))
    if seconds < 60 { return "\(seconds)s" }
    let minutes = seconds / 60
    if minutes < 60 { return "\(minutes)m \(seconds % 60)s" }
    let hours = minutes / 60
    return "\(hours)h \(minutes % 60)m"
}

nonisolated func connectionPhaseLabel(_ phase: RuntimeConnectionPhase) -> String {
    switch phase {
    case .idle: "disconnected"
    case .connecting: "connecting"
    case .connected: "connected"
    case .reconnecting: "reconnecting"
    case .unreachable: "unreachable"
    case .authenticationFailed: "auth-failed"
    }
}

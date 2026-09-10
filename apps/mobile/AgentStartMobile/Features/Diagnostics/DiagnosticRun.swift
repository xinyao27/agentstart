import Foundation
import Observation

nonisolated enum DiagnosticResultStatus: Sendable {
    case pass
    case fail
    case warning
}

nonisolated struct DiagnosticResult: Identifiable, Sendable {
    let id: String
    let label: String
    let status: DiagnosticResultStatus
    let detail: String
}

@Observable
@MainActor
final class TroubleshootingModel {
    private(set) var isRunning = false
    private(set) var hasRun = false
    private(set) var results: [DiagnosticResult] = []

    @ObservationIgnored
    private let repository: any HostRepository
    @ObservationIgnored
    private var runTask: Task<Void, Never>?

    init(repository: any HostRepository) {
        self.repository = repository
    }

    func start() {
        guard !isRunning else { return }
        runTask = Task { await run() }
    }

    // Why: cancel the diagnostic run when the screen detaches so a stale run never keeps
    // probing hosts after the user has navigated away.
    func cancelActiveRun() {
        runTask?.cancel()
    }

    private func run() async {
        guard !isRunning else { return }
        isRunning = true
        hasRun = false
        results = []
        defer {
            isRunning = false
            if !Task.isCancelled { hasRun = true }
        }

        let hosts: [HostProfile]
        do {
            hosts = try await repository.hosts()
            append(
                id: "hosts",
                label: String(localized: "Paired hosts"),
                status: hosts.isEmpty ? .fail : .pass,
                detail: hosts.isEmpty
                    ? String(localized: "None — scan a QR to pair")
                    : String(localized: "\(hosts.count) paired")
            )
        } catch {
            hosts = []
            append(
                id: "hosts",
                label: String(localized: "Paired hosts"),
                status: .warning,
                detail: String(localized: "Could not read host data")
            )
        }

        let internetIsReachable = await Self.checkInternet()
        guard !Task.isCancelled else { return }
        append(
            id: "internet",
            label: String(localized: "Internet"),
            status: internetIsReachable ? .pass : .fail,
            detail: internetIsReachable
                ? String(localized: "Connected") : String(localized: "No connection")
        )

        for host in hosts {
            guard !Task.isCancelled else { return }
            let isReachable = await Self.checkHost(host.endpoint)
            guard !Task.isCancelled else { return }
            append(
                id: "host-\(host.id)",
                label: host.name,
                status: isReachable ? .pass : .fail,
                detail: isReachable
                    ? String(localized: "Reachable at \(Self.endpointLabel(host.endpoint))")
                    : Self.unreachableDetail(host.endpoint)
            )
        }

        guard !Task.isCancelled else { return }
        append(
            id: "platform",
            label: String(localized: "Platform"),
            status: .pass,
            detail: "iOS \(ProcessInfo.processInfo.operatingSystemVersionString)"
        )
    }

    private func append(id: String, label: String, status: DiagnosticResultStatus, detail: String) {
        results.append(DiagnosticResult(id: id, label: label, status: status, detail: detail))
    }

    private nonisolated static func checkInternet() async -> Bool {
        guard let url = URL(string: "https://dns.google/resolve?name=example.com&type=A") else {
            return false
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 5
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return false }
            return (200..<300).contains(http.statusCode)
        } catch {
            return false
        }
    }

    private nonisolated static func checkHost(_ endpoint: String) async -> Bool {
        guard let url = URL(string: endpoint) else { return false }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 4
        configuration.timeoutIntervalForResource = 4
        let session = URLSession(configuration: configuration)
        let socket = session.webSocketTask(with: url)
        socket.resume()
        defer {
            socket.cancel(with: .goingAway, reason: nil)
            session.invalidateAndCancel()
        }
        do {
            try await withCheckedThrowingContinuation {
                (continuation: CheckedContinuation<Void, Error>) in
                socket.sendPing { error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume()
                    }
                }
            }
            return true
        } catch {
            return false
        }
    }

    private nonisolated static func endpointLabel(_ endpoint: String) -> String {
        URL(string: endpoint)?.host(percentEncoded: false) ?? endpoint
    }

    private nonisolated static func unreachableDetail(_ endpoint: String) -> String {
        let host = endpointLabel(endpoint)
        if host.hasSuffix(".ts.net") || host.hasPrefix("100.") {
            return String(localized: "Cannot reach \(host) — check Tailscale")
        }
        return String(localized: "Cannot reach \(host)")
    }
}

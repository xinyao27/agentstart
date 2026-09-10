import Foundation
import Observation

enum PairingPhase {
    case ready
    case connecting
    case failed(LocalizedStringResource)
}

@Observable
@MainActor
final class PairingModel {
    let offer: PairingOffer
    private(set) var phase: PairingPhase = .ready
    private(set) var logEntries: [PairingLogEntry] = []

    @ObservationIgnored
    private let runtime: any PairingRuntime

    init(offer: PairingOffer, runtime: any PairingRuntime) {
        self.offer = offer
        self.runtime = runtime
    }

    func pair() async -> HostProfile? {
        phase = .connecting
        logEntries = []
        do {
            let host = try await runtime.pair(offer) { [weak self] level, message, detail in
                await self?.appendLog(level: level, message: message, detail: detail)
            }
            guard !Task.isCancelled else { return nil }
            return host
        } catch is CancellationError {
            phase = .ready
            return nil
        } catch PairingRuntimeError.timeout {
            phase = .failed(
                "The daemon did not respond within 25 seconds. Check the connection and try again."
            )
        } catch PairingRuntimeError.authenticationFailed {
            phase = .failed(
                "The daemon rejected this pairing code. Generate a new code and try again.")
        } catch PairingRuntimeError.connectionFailed(let detail) {
            phase = .failed(
                LocalizedStringResource(
                    stringLiteral: pairingFailureMessage(detail)
                )
            )
        } catch {
            phase = .failed(
                LocalizedStringResource(
                    stringLiteral: pairingFailureMessage(error.localizedDescription)
                )
            )
        }
        return nil
    }

    private func pairingFailureMessage(_ detail: String) -> String {
        let trimmed = detail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return "AgentStart could not establish a secure connection to this daemon."
        }
        return "Pairing failed: \(trimmed)"
    }

    private func appendLog(level: PairingLogLevel, message: String, detail: String?) {
        logEntries.append(
            PairingLogEntry(
                id: UUID(),
                date: Date(),
                level: level,
                message: message,
                detail: detail
            )
        )
    }

}

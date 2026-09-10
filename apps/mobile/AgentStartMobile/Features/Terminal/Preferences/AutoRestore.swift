import Foundation
import Observation

nonisolated protocol TerminalAutoRestoreRepository: Sendable {
    func terminalAutoRestoreFit(for hostID: String) async throws -> TimeInterval?
    func setTerminalAutoRestoreFit(for hostID: String, milliseconds: TimeInterval?) async throws
        -> TimeInterval?
}

nonisolated enum TerminalAutoRestoreOption: String, CaseIterable, Identifiable, Sendable {
    case indefinite
    case oneMinute
    case fiveMinutes
    case thirtyMinutes

    var id: Self { self }

    var milliseconds: TimeInterval? {
        switch self {
        case .indefinite: nil
        case .oneMinute: 60_000
        case .fiveMinutes: 5 * 60_000
        case .thirtyMinutes: 30 * 60_000
        }
    }

    var title: LocalizedStringResource {
        switch self {
        case .indefinite: "Keep at phone size (default)"
        case .oneMinute: "After 1 minute"
        case .fiveMinutes: "After 5 minutes"
        case .thirtyMinutes: "After 30 minutes"
        }
    }

    static func closest(to milliseconds: TimeInterval?) -> Self {
        guard let milliseconds else { return .indefinite }
        return allCases.filter { $0.milliseconds != nil }.min {
            abs(($0.milliseconds ?? 0) - milliseconds)
                < abs(($1.milliseconds ?? 0) - milliseconds)
        } ?? .indefinite
    }
}

nonisolated enum TerminalAutoRestoreState: Sendable {
    case loading
    case loaded(TimeInterval?)
    case updating(TimeInterval?)
    case failed

    var milliseconds: TimeInterval? {
        switch self {
        case .loaded(let value), .updating(let value): value
        case .loading, .failed: nil
        }
    }

    var isBusy: Bool {
        switch self {
        case .loading, .updating: true
        case .loaded, .failed: false
        }
    }
}

@Observable
@MainActor
final class TerminalAutoRestoreModel {
    private(set) var hosts: [HostProfile] = []
    private(set) var values: [String: TerminalAutoRestoreState] = [:]
    private(set) var loadFailure: String?

    @ObservationIgnored private let hostRepository: any HostRepository
    @ObservationIgnored private let repository: any TerminalAutoRestoreRepository

    init(
        hosts: any HostRepository,
        repository: any TerminalAutoRestoreRepository
    ) {
        hostRepository = hosts
        self.repository = repository
    }

    func load() async {
        do {
            hosts = try await hostRepository.hosts().sorted { $0.lastConnected > $1.lastConnected }
            values = Dictionary(uniqueKeysWithValues: hosts.map { ($0.id, .loading) })
            loadFailure = nil
        } catch {
            loadFailure = "Paired daemons could not be loaded."
            return
        }

        let hostIDs = hosts.map(\.id)
        let repository = repository
        await withTaskGroup(of: (String, Result<TimeInterval?, Error>).self) { group in
            for hostID in hostIDs {
                group.addTask {
                    do {
                        return (
                            hostID,
                            .success(try await repository.terminalAutoRestoreFit(for: hostID))
                        )
                    } catch {
                        return (hostID, .failure(error))
                    }
                }
            }
            for await (hostID, result) in group {
                guard !Task.isCancelled else { return }
                switch result {
                case .success(let value): values[hostID] = .loaded(value)
                case .failure: values[hostID] = .failed
                }
            }
        }
    }

    func select(_ option: TerminalAutoRestoreOption, for hostID: String) async {
        guard values[hostID]?.isBusy != true else { return }
        let previous = values[hostID] ?? .failed
        values[hostID] = .updating(option.milliseconds)
        do {
            let value = try await repository.setTerminalAutoRestoreFit(
                for: hostID,
                milliseconds: option.milliseconds
            )
            values[hostID] = .loaded(value)
        } catch {
            do {
                values[hostID] = .loaded(try await repository.terminalAutoRestoreFit(for: hostID))
            } catch {
                values[hostID] = previous
            }
        }
    }

    func summary(for hostID: String) -> String {
        guard let state = values[hostID] else { return "…" }
        switch state {
        case .loading: return "…"
        case .failed: return "Unavailable"
        case .loaded(let value), .updating(let value):
            if let exact = TerminalAutoRestoreOption.allCases.first(where: {
                $0.milliseconds == value
            }) {
                return String(localized: exact.title)
            }
            guard let value else {
                return String(localized: TerminalAutoRestoreOption.indefinite.title)
            }
            return String(localized: "After \(Int((value / 1_000).rounded()))s")
        }
    }
}

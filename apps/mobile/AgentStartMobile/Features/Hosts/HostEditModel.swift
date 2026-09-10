import Foundation
import Observation

@Observable
@MainActor
final class HostEditModel {
    let host: HostProfile
    var name: String
    var address: String
    private(set) var isSaving = false
    private(set) var failure: LocalizedStringResource?

    @ObservationIgnored private let repository: any HostRepository
    @ObservationIgnored private let connectionRuntime: any HostConnectionRuntime

    init(
        host: HostProfile,
        repository: any HostRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.host = host
        self.repository = repository
        self.connectionRuntime = connectionRuntime
        name = host.name
        address = HostEndpoint.display(host.endpoint)
    }

    var normalizedEndpoint: HostEndpointResult {
        HostEndpoint.normalize(address, currentEndpoint: host.endpoint)
    }

    var canSave: Bool {
        guard !isSaving else { return false }
        let nextName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !nextName.isEmpty, case .valid(let endpoint) = normalizedEndpoint else {
            return false
        }
        return nextName != host.name || endpoint != host.endpoint
    }

    func clearFailure() {
        failure = nil
    }

    func save() async -> HostProfile? {
        guard !isSaving else { return nil }
        let nextName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !nextName.isEmpty else {
            failure = "Enter a name."
            return nil
        }
        guard case .valid(let endpoint) = normalizedEndpoint else {
            if case .invalid(let message) = normalizedEndpoint { failure = message }
            return nil
        }
        isSaving = true
        defer { isSaving = false }
        do {
            let updated = try await repository.updateHost(
                hostID: host.id,
                name: nextName,
                endpoint: endpoint
            )
            if endpoint != host.endpoint {
                Task { await connectionRuntime.reconnect(hostID: host.id) }
            }
            return updated
        } catch HostRepositoryError.hostNotFound {
            failure = "This host was removed from this phone."
        } catch {
            let detail = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
            if detail.isEmpty {
                failure = "AgentStart could not save this host."
            } else {
                failure = LocalizedStringResource(stringLiteral: detail)
            }
        }
        return nil
    }
}

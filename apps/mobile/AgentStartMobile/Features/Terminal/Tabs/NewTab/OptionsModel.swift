import Foundation
import Observation

nonisolated enum WorkspaceNewTabOptionsPhase: Sendable {
    case idle
    case loading
    case ready([WorkspaceCreationAgent])
    case failed
}

@Observable
@MainActor
final class WorkspaceNewTabOptionsModel {
    private(set) var phase = WorkspaceNewTabOptionsPhase.idle
    private let hostID: String
    private let repoID: String?
    private let repository: any WorkspaceCreationRepository

    init(hostID: String, repoID: String?, repository: any WorkspaceCreationRepository) {
        self.hostID = hostID
        self.repoID = repoID
        self.repository = repository
    }

    func load() async {
        guard case .idle = phase else { return }
        phase = .loading
        do {
            let agents = try await repository.workspaceTerminalAgents(for: hostID, repoID: repoID)
            guard !Task.isCancelled else {
                // Why: SwiftUI cancels sheet tasks as soon as the chooser leaves the hierarchy.
                // Reset the transient phase so a retained chooser can retry instead of showing a
                // permanent loader after a cancelled host probe.
                phase = .idle
                return
            }
            phase = .ready(agents)
        } catch is CancellationError {
            phase = .idle
        } catch {
            phase = .failed
        }
    }
}

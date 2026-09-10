import Foundation
import Observation
import UIKit

nonisolated enum TerminalQuickCommandPhase: Sendable {
    case idle
    case loading
    case ready
    case unsupported
    case failed
}

@Observable
@MainActor
final class TerminalQuickCommandModel {
    private(set) var phase = TerminalQuickCommandPhase.idle
    private(set) var commands: [TerminalQuickCommand] = []
    private(set) var isMutating = false
    private(set) var errorMessage: String?
    var query = ""

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let repoID: String?
    @ObservationIgnored private let repository: any TerminalQuickCommandRepository

    init(
        hostID: String,
        repoID: String?,
        repository: any TerminalQuickCommandRepository
    ) {
        self.hostID = hostID
        self.repoID = repoID
        self.repository = repository
    }

    var visibleCommands: [TerminalQuickCommand] {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return availableCommands.filter { command in
            normalized.isEmpty
                || "\(command.label) \(command.preview)".lowercased().contains(normalized)
        }
    }

    var availableCommands: [TerminalQuickCommand] {
        commands.filter { $0.isVisible(repoID: repoID) }
    }

    var repositoryCommands: [TerminalQuickCommand] {
        visibleCommands.filter { $0.scope.repoID != nil }
    }

    var globalCommands: [TerminalQuickCommand] {
        visibleCommands.filter { $0.scope.repoID == nil }
    }

    var canAdd: Bool { phase == .ready && commands.count < 40 && !isMutating }

    var hasReachedLimit: Bool { commands.count >= 40 }

    func load() async {
        guard !isMutating else { return }
        phase = .loading
        errorMessage = nil
        do {
            guard try await repository.supportsQuickCommands(for: hostID) else {
                phase = .unsupported
                return
            }
            commands = try await repository.quickCommands(for: hostID)
            phase = .ready
        } catch is CancellationError {
            // Why: a transport cancellation must not leave a visible sheet in a permanent
            // loading phase. Preserve loaded commands when available; otherwise let the sheet
            // render its idle state until the user retries or dismisses it.
            phase = commands.isEmpty ? .idle : .ready
        } catch {
            errorMessage = error.localizedDescription
            phase = .failed
        }
    }

    func save(_ command: TerminalQuickCommand) async -> Bool {
        await mutate(.upsert(command))
    }

    func delete(_ command: TerminalQuickCommand) async {
        _ = await mutate(.delete(command.id))
    }

    private func mutate(_ mutation: TerminalQuickCommandMutation) async -> Bool {
        guard !isMutating else { return false }
        isMutating = true
        errorMessage = nil
        defer { isMutating = false }
        do {
            commands = try await repository.mutateQuickCommands(
                for: hostID,
                mutation: mutation
            )
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            phase = .ready
            return true
        } catch is CancellationError {
            return false
        } catch {
            errorMessage = String(localized: "Failed to save quick command")
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return false
        }
    }
}

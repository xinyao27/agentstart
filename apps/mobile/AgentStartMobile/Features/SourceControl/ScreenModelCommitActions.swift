import Foundation
import UIKit

extension SourceControlModel {
    func commit() async {
        let message = commitMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isConnected, !message.isEmpty, busyAction == nil else { return }
        busyAction = "commit"
        errorMessage = nil
        commitFailure = nil
        commitFailureLaunchError = nil
        let staged = snapshot?.staged ?? []
        do {
            try await repository.commitSourceFiles(
                for: hostID,
                worktreeID: worktreeID,
                message: message
            )
            commitMessage = ""
            busyAction = nil
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await refresh(initial: false)
        } catch is CancellationError {
            busyAction = nil
        } catch {
            busyAction = nil
            commitFailure = SourceCommitFailure(
                error: error.localizedDescription,
                commitMessage: message,
                stagedEntries: staged
            )
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    func commitThenRun(
        _ action: String,
        operation: () async throws -> Void
    ) async {
        let message = commitMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isConnected, !message.isEmpty, busyAction == nil else { return }
        busyAction = action
        errorMessage = nil
        commitFailure = nil
        commitFailureLaunchError = nil
        let staged = snapshot?.staged ?? []
        do {
            try await repository.commitSourceFiles(
                for: hostID,
                worktreeID: worktreeID,
                message: message
            )
            commitMessage = ""
            try await operation()
            busyAction = nil
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await refresh(initial: false)
        } catch is CancellationError {
            busyAction = nil
        } catch {
            busyAction = nil
            if commitMessage.isEmpty {
                let message = error.localizedDescription
                if shouldRecoverRejectedPush(action: action, error: error, message: message) {
                    try? await repository.fetchSourceRemote(for: hostID, worktreeID: worktreeID)
                    await refresh(initial: false)
                }
                errorMessage = message
            } else {
                commitFailure = SourceCommitFailure(
                    error: error.localizedDescription,
                    commitMessage: message,
                    stagedEntries: staged
                )
            }
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

}

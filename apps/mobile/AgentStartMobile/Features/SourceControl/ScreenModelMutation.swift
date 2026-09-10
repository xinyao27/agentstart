import Foundation
import UIKit

extension SourceControlModel {
    func sync() async {
        await mutate("sync") { try await runSyncSteps() }
    }

    func runSyncSteps() async throws {
        try await repository.fetchSourceRemote(for: hostID, worktreeID: worktreeID)
        let beforePull = try await repository.sourceStatus(for: hostID, worktreeID: worktreeID)
        if let upstream = beforePull.upstream,
            upstream.hasUpstream,
            upstream.ahead > 0,
            upstream.behind > 0,
            upstream.behindCommitsArePatchEquivalent
        {
            do {
                try await repository.pushSourceRemote(
                    for: hostID,
                    worktreeID: worktreeID,
                    publish: false,
                    forceWithLease: true
                )
            } catch {
                throw SourceSyncPushFailure(message: error.localizedDescription)
            }
            return
        }
        try await repository.pullSourceRemote(for: hostID, worktreeID: worktreeID)
        let afterPull = try await repository.sourceStatus(for: hostID, worktreeID: worktreeID)
        guard (afterPull.upstream?.ahead ?? 0) > 0 else { return }
        do {
            try await repository.pushSourceRemote(
                for: hostID,
                worktreeID: worktreeID,
                publish: false,
                forceWithLease: false
            )
        } catch {
            throw SourceSyncPushFailure(message: error.localizedDescription)
        }
    }

    @discardableResult
    func mutate(
        _ action: String,
        operation: () async throws -> Void
    ) async -> Bool {
        guard isConnected else {
            errorMessage = SourceControlUnavailableError().localizedDescription
            return false
        }
        guard busyAction == nil else { return false }
        busyAction = action
        errorMessage = nil
        commitFailure = nil
        commitFailureLaunchError = nil
        do {
            try await operation()
            busyAction = nil
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await refresh(initial: false)
            return true
        } catch is CancellationError {
            busyAction = nil
            return false
        } catch {
            let message = error.localizedDescription
            if shouldRecoverRejectedPush(action: action, error: error, message: message) {
                try? await repository.fetchSourceRemote(for: hostID, worktreeID: worktreeID)
                await refresh(initial: false)
            }
            busyAction = nil
            errorMessage = message
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return false
        }
    }

    func shouldRecoverRejectedPush(
        action: String,
        error: Error,
        message: String
    ) -> Bool {
        let isPushAction =
            action == "push" || action == "force-push" || action == "publish"
            || action == "commit-push" || action == "commit-sync"
            || action == "sync" && error is SourceSyncPushFailure
        guard isPushAction else { return false }
        return message.range(
            of:
                #"non-fast-forward|fetch first|updates were rejected|stale info|remote contains work that you do not have|(?:Submodule '[^'\n]+'|A submodule) has remote changes"#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }
}

nonisolated private struct SourceSyncPushFailure: LocalizedError, Sendable {
    let message: String
    var errorDescription: String? { message }
}

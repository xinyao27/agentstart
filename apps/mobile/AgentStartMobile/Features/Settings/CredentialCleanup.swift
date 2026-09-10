import Foundation
import Observation

nonisolated struct CredentialCleanupState: Equatable, Sendable {
    let pendingCount: Int
    let isStorageUnreadable: Bool

    var needsAttention: Bool { pendingCount > 0 || isStorageUnreadable }
}

nonisolated protocol CredentialCleanupRepository: Sendable {
    func pendingCredentialCleanup() async -> CredentialCleanupState
    func retryPendingCredentialCleanup() async -> CredentialCleanupState
}

@Observable
@MainActor
final class CredentialCleanupModel {
    private(set) var state = CredentialCleanupState(
        pendingCount: 0,
        isStorageUnreadable: false
    )
    private(set) var isRetrying = false
    private(set) var didRetryFail = false

    @ObservationIgnored
    private let repository: any CredentialCleanupRepository

    init(repository: any CredentialCleanupRepository) {
        self.repository = repository
    }

    func load() async {
        // Why: clear the "retry failed" message on every load, even while cleanup is still
        // pending, so returning to the page shows the neutral pending-count copy instead of a
        // failure the user has already seen and left.
        didRetryFail = false
        let nextState = await repository.pendingCredentialCleanup()
        guard !Task.isCancelled else { return }
        state = nextState
    }

    func retry() async {
        guard !isRetrying else { return }
        isRetrying = true
        didRetryFail = false
        state = await repository.retryPendingCredentialCleanup()
        didRetryFail = state.needsAttention
        isRetrying = false
    }

    var message: String {
        if didRetryFail {
            return String(localized: "Cleanup still couldn't be confirmed. Try again later.")
        }
        if state.pendingCount == 1 {
            return String(localized: "Couldn't confirm cleanup for 1 credential on this device.")
        }
        if state.pendingCount > 1 {
            return String(
                localized:
                    "Couldn't confirm cleanup for \(state.pendingCount) credentials on this device."
            )
        }
        return String(localized: "Couldn't check cleanup status on this device. Retry to be safe.")
    }
}

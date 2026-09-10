import Observation
import UIKit

nonisolated enum HostedReviewPhase: Sendable {
    case loading
    case waiting
    case empty(HostedReviewEligibility)
    case ready(HostedReview, HostedReviewDetails?, [HostedReviewCheck])
    case failed(String)
}

@Observable
@MainActor
final class HostedReviewModel {
    var phase = HostedReviewPhase.loading
    var isConnected = false
    private(set) var busyAction: String?
    private(set) var errorMessage: String?
    private(set) var assignableUsers: [HostedReviewUser] = []
    private(set) var isLoadingUsers = false
    private(set) var triageErrorMessage: String?
    private(set) var createProgress: SourceHostedReviewCreateProgress?
    private(set) var commitFailure: SourceCommitFailure?
    private(set) var commitFailureLaunchError: String?
    private(set) var createdReviewURL: URL?
    private(set) var createdReviewWarning: String?

    @ObservationIgnored let hostID: String
    @ObservationIgnored let workspace: WorkspaceSummary
    @ObservationIgnored let repository: any HostedReviewRepository
    @ObservationIgnored let sourceRepository: any SourceControlRepository
    @ObservationIgnored let connectionRuntime: any HostConnectionRuntime
    @ObservationIgnored var status: SourceStatusSnapshot
    @ObservationIgnored var linkedProvider: HostedReviewProvider?
    @ObservationIgnored var linkedNumber: Int?
    @ObservationIgnored var loadRevision = 0
    // Why: phase 2 (details/comments) has its own sequence so a chip-only summary refresh
    // (loadSummary, which bumps loadRevision) cannot orphan or duplicate an in-flight
    // details fetch.
    @ObservationIgnored var detailsRevision = 0
    // Why: observe() now starts once at model creation (ScreenModelRefresh.swift)
    // instead of only while HostedReviewView is mounted, so a reconnect retries
    // phase 1 for the branch-card chip too. Guards against a second concurrent
    // loop if HostedReviewView's own `.task` calls observe() again while it runs.
    @ObservationIgnored var isObserving = false

    init(
        hostID: String,
        workspace: WorkspaceSummary,
        status: SourceStatusSnapshot,
        repository: any HostedReviewRepository,
        sourceRepository: any SourceControlRepository,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.hostID = hostID
        self.workspace = workspace
        self.status = status
        self.repository = repository
        self.sourceRepository = sourceRepository
        self.connectionRuntime = connectionRuntime
        if let linked = workspace.linkedPullRequest {
            linkedProvider = .github
            linkedNumber = linked.number
        }
    }

    var review: HostedReview? {
        guard case .ready(let review, _, _) = phase else { return nil }
        return review
    }

    var details: HostedReviewDetails? {
        guard case .ready(_, let details, _) = phase else { return nil }
        return details
    }

    var checks: [HostedReviewCheck] {
        guard case .ready(_, _, let checks) = phase else { return [] }
        return checks
    }

    func create(_ draft: HostedReviewDraft) async {
        guard isConnected, busyAction == nil else { return }
        busyAction = "create"
        errorMessage = nil
        do {
            let creation = try await repository.createHostedReview(
                for: hostID,
                workspace: workspace,
                draft: draft
            )
            if let number = creation.number {
                try await repository.setHostedReviewLink(
                    for: hostID,
                    workspaceID: workspace.id,
                    provider: draft.provider,
                    number: number,
                    baseRef: draft.base
                )
                linkedProvider = draft.provider
                linkedNumber = number
            }
            busyAction = nil
            await load()
        } catch is CancellationError {
            busyAction = nil
        } catch {
            busyAction = nil
            errorMessage = error.localizedDescription
        }
    }

    func createFromBranch() async {
        guard isConnected, busyAction == nil else { return }
        busyAction = "create"
        errorMessage = nil
        createProgress = nil
        commitFailure = nil
        commitFailureLaunchError = nil
        do {
            let outcome = try await SourceHostedReviewCreator.run(
                hostID: hostID,
                workspace: workspace,
                initialStatus: status,
                commitMessage: "",
                sourceRepository: sourceRepository,
                hostedReviewRepository: repository
            ) { [weak self] progress in
                self?.createProgress = progress
            }
            createdReviewURL = outcome.creation.url
            createdReviewWarning = outcome.warning
            if let number = outcome.creation.number {
                linkedProvider = outcome.provider
                linkedNumber = number
            }
            busyAction = nil
            createProgress = nil
            status = try await sourceRepository.sourceStatus(
                for: hostID,
                worktreeID: workspace.id
            )
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await load()
        } catch is CancellationError {
            busyAction = nil
            createProgress = nil
        } catch let flowError as SourceHostedReviewCreateError {
            busyAction = nil
            createProgress = nil
            switch flowError {
            case .commitFailed(let failure): commitFailure = failure
            case .failed(let message): errorMessage = message
            }
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        } catch {
            busyAction = nil
            createProgress = nil
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    func launchCommitFailureFix() async {
        guard isConnected, let commitFailure, busyAction == nil else { return }
        busyAction = "commit-fix"
        commitFailureLaunchError = nil
        do {
            try await sourceRepository.launchSourceControlAgent(
                for: hostID,
                worktreeID: workspace.id,
                prompt: SourceCommitFailurePrompt.build(commitFailure)
            )
            busyAction = nil
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch is CancellationError {
            busyAction = nil
        } catch {
            busyAction = nil
            commitFailureLaunchError = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    func takeCreatedReviewURL() -> URL? {
        defer {
            createdReviewURL = nil
            createdReviewWarning = nil
        }
        return createdReviewURL
    }

    func link(provider: HostedReviewProvider, number: Int) async {
        guard isConnected, busyAction == nil else { return }
        busyAction = "link"
        errorMessage = nil
        do {
            try await repository.setHostedReviewLink(
                for: hostID,
                workspaceID: workspace.id,
                provider: provider,
                number: number,
                baseRef: nil
            )
            linkedProvider = provider
            linkedNumber = number
            busyAction = nil
            await load()
        } catch is CancellationError {
            busyAction = nil
        } catch {
            busyAction = nil
            errorMessage = error.localizedDescription
        }
    }

    func unlink() async {
        guard let review else { return }
        await run("unlink") {
            try await repository.setHostedReviewLink(
                for: hostID,
                workspaceID: workspace.id,
                provider: review.provider,
                number: nil,
                baseRef: nil
            )
            linkedProvider = nil
            linkedNumber = nil
        }
    }

    @discardableResult
    func mutate(_ mutation: HostedReviewMutation, action: String) async -> Bool {
        guard isConnected, let review else { return false }
        let details = details
        return await run(action) {
            try await repository.mutateHostedReview(
                for: hostID,
                workspace: workspace,
                review: review,
                details: details,
                mutation: mutation
            )
        }
    }

    func checkDetails(for check: HostedReviewCheck) async throws -> HostedReviewCheckRunDetails? {
        guard isConnected, let review else { return nil }
        return try await repository.hostedReviewCheckDetails(
            for: hostID,
            workspace: workspace,
            review: review,
            details: details,
            check: check
        )
    }

    func loadAssignableUsers() async {
        guard isConnected, !isLoadingUsers, assignableUsers.isEmpty else { return }
        isLoadingUsers = true
        errorMessage = nil
        do {
            assignableUsers = try await repository.hostedReviewAssignableUsers(
                for: hostID,
                workspace: workspace
            )
            isLoadingUsers = false
        } catch is CancellationError {
            isLoadingUsers = false
        } catch {
            isLoadingUsers = false
            errorMessage = error.localizedDescription
        }
    }

    func launchTriage(_ action: HostedReviewTriageAction, prompt: String) async {
        guard isConnected, busyAction == nil else { return }
        busyAction = action.busyKey
        triageErrorMessage = nil
        do {
            try await repository.launchHostedReviewTriage(
                for: hostID,
                workspaceID: workspace.id,
                prompt: prompt
            )
            busyAction = nil
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch is CancellationError {
            busyAction = nil
        } catch {
            busyAction = nil
            triageErrorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    func clearError() { errorMessage = nil }

    @discardableResult
    private func run(_ action: String, operation: () async throws -> Void) async -> Bool {
        guard busyAction == nil else { return false }
        busyAction = action
        errorMessage = nil
        do {
            try await operation()
            busyAction = nil
            await load()
            return true
        } catch is CancellationError {
            busyAction = nil
            return false
        } catch {
            busyAction = nil
            errorMessage = error.localizedDescription
            return false
        }
    }
}

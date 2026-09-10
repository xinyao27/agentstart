import Foundation

nonisolated enum SourceHostedReviewCreateProgress: String, Hashable, Sendable {
    case staging
    case generatingCommitMessage = "generating-commit-message"
    case committing
    case publishing
    case pushing
    case forcePushing = "force-pushing"
    case fastForwarding = "fast-forwarding"
    case creatingReview = "creating-review"

    var message: String {
        switch self {
        case .staging: "Staging changes..."
        case .generatingCommitMessage: "Generating commit message..."
        case .committing: "Committing changes..."
        case .publishing: "Publishing branch..."
        case .pushing: "Pushing commits..."
        case .forcePushing: "Force pushing with lease..."
        case .fastForwarding: "Updating branch..."
        case .creatingReview: "Creating review..."
        }
    }
}

nonisolated enum SourceHostedReviewCreateError: LocalizedError, Sendable {
    case failed(String)
    case commitFailed(SourceCommitFailure)

    var errorDescription: String? {
        switch self {
        case .failed(let message): message
        case .commitFailed(let failure): failure.error
        }
    }
}

nonisolated struct SourceHostedReviewEntry: Hashable, Sendable {
    let label: String
    let isEnabled: Bool
    let hint: String?
    let isLoading: Bool
    let action: SourceControlActionKind
}

@MainActor
enum SourceHostedReviewCreator {
    static func run(
        hostID: String,
        workspace: WorkspaceSummary,
        initialStatus: SourceStatusSnapshot,
        commitMessage: String,
        sourceRepository: any SourceControlRepository,
        hostedReviewRepository: any HostedReviewRepository,
        onProgress: (SourceHostedReviewCreateProgress) -> Void
    ) async throws -> SourceHostedReviewCreateOutcome {
        let expectedBranch = initialStatus.branchLabel
        var status = try await sourceRepository.sourceStatus(
            for: hostID,
            worktreeID: workspace.id
        )
        try requireBranch(expectedBranch, status)

        let didCommit = try await commitLocalChanges(
            hostID: hostID,
            workspaceID: workspace.id,
            expectedBranch: expectedBranch,
            status: &status,
            commitMessage: commitMessage,
            repository: sourceRepository,
            onProgress: onProgress
        )

        var eligibility = try await hostedReviewRepository.hostedReviewEligibility(
            for: hostID,
            workspace: workspace,
            status: status
        )
        for _ in 0..<2 {
            guard let step = remoteStep(eligibility: eligibility, status: status) else { break }
            onProgress(step.progress)
            try await step.run(sourceRepository, hostID, workspace.id)
            status = try await sourceRepository.sourceStatus(for: hostID, worktreeID: workspace.id)
            try requireBranch(expectedBranch, status)
            eligibility = try await hostedReviewRepository.hostedReviewEligibility(
                for: hostID,
                workspace: workspace,
                status: status
            )
        }

        guard eligibility.canCreate || eligibility.blockedReason == .needsPush else {
            throw SourceHostedReviewCreateError.failed(blockMessage(eligibility.blockedReason))
        }
        if eligibility.blockedReason == .needsPush {
            onProgress(.pushing)
            try await sourceRepository.pushSourceRemote(
                for: hostID,
                worktreeID: workspace.id,
                publish: false,
                forceWithLease: false
            )
        }

        let baseRef = eligibility.defaultBaseRef ?? "main"
        let draft = HostedReviewDraft(
            provider: eligibility.provider,
            base: baseRef,
            head: eligibility.head ?? expectedBranch,
            title: eligibility.suggestedTitle ?? workspace.name,
            body: eligibility.suggestedBody ?? "",
            isDraft: false,
            useTemplate: true
        )
        onProgress(.creatingReview)
        let creation = try await hostedReviewRepository.createHostedReview(
            for: hostID,
            workspace: workspace,
            draft: draft
        )

        var warning: String?
        if let number = creation.number {
            do {
                try await hostedReviewRepository.setHostedReviewLink(
                    for: hostID,
                    workspaceID: workspace.id,
                    provider: eligibility.provider,
                    number: number,
                    baseRef: baseRef
                )
            } catch {
                warning =
                    "\(eligibility.provider.reviewTitle) created, but AgentStart could not refresh it yet."
            }
        }
        if creation.isExisting {
            warning =
                creation.number.map {
                    "\(eligibility.provider.reviewTitle) #\($0) is already open."
                } ?? "\(eligibility.provider.reviewTitle) is already open."
        }
        return SourceHostedReviewCreateOutcome(
            creation: creation,
            provider: eligibility.provider,
            baseRef: baseRef,
            didCommit: didCommit,
            warning: warning
        )
    }

    private static func commitLocalChanges(
        hostID: String,
        workspaceID: String,
        expectedBranch: String,
        status: inout SourceStatusSnapshot,
        commitMessage: String,
        repository: any SourceControlRepository,
        onProgress: (SourceHostedReviewCreateProgress) -> Void
    ) async throws -> Bool {
        guard !status.entries.isEmpty else { return false }
        guard status.unresolvedCount == 0 else {
            throw SourceHostedReviewCreateError.failed(
                "Resolve conflicts before creating a pull request."
            )
        }
        let stageable = status.stageable
        if !stageable.isEmpty {
            onProgress(.staging)
            try await repository.stageSourceFiles(
                for: hostID,
                worktreeID: workspaceID,
                paths: stageable.map(\.path)
            )
            status = try await repository.sourceStatus(for: hostID, worktreeID: workspaceID)
            try requireBranch(expectedBranch, status)
        }
        guard !status.staged.isEmpty else {
            throw SourceHostedReviewCreateError.failed(
                "Resolve or stage changes before creating a pull request."
            )
        }

        var message = commitMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        if message.isEmpty {
            onProgress(.generatingCommitMessage)
            do {
                message = try await repository.generateSourceCommitMessage(
                    for: hostID,
                    worktreeID: workspaceID
                )
            } catch {
                throw SourceHostedReviewCreateError.failed(
                    "Could not generate a commit message. Add one in Source Control, then retry."
                )
            }
        }

        onProgress(.committing)
        do {
            try await repository.commitSourceFiles(
                for: hostID,
                worktreeID: workspaceID,
                message: message
            )
        } catch {
            throw SourceHostedReviewCreateError.commitFailed(
                SourceCommitFailure(
                    error: error.localizedDescription,
                    commitMessage: message,
                    stagedEntries: status.staged
                )
            )
        }
        status = try await repository.sourceStatus(for: hostID, worktreeID: workspaceID)
        try requireBranch(expectedBranch, status)
        return true
    }

    private static func requireBranch(
        _ expectedBranch: String,
        _ status: SourceStatusSnapshot
    ) throws {
        guard status.branchLabel == expectedBranch else {
            throw SourceHostedReviewCreateError.failed(
                "Branch changed while preparing the pull request."
            )
        }
    }

    private static func remoteStep(
        eligibility: HostedReviewEligibility,
        status: SourceStatusSnapshot
    ) -> SourceHostedReviewRemoteStep? {
        guard !eligibility.canCreate else { return nil }
        return switch eligibility.blockedReason {
        case .noUpstream: SourceHostedReviewRemoteStep.publish
        case .needsPush: SourceHostedReviewRemoteStep.push
        case .needsSync:
            if let upstream = status.upstream,
                upstream.hasUpstream,
                upstream.ahead > 0,
                upstream.behind > 0,
                upstream.behindCommitsArePatchEquivalent
            {
                SourceHostedReviewRemoteStep.forcePush
            } else if let upstream = status.upstream,
                upstream.hasUpstream,
                upstream.ahead == 0,
                upstream.behind > 0
            {
                SourceHostedReviewRemoteStep.fastForward
            } else {
                Optional<SourceHostedReviewRemoteStep>.none
            }
        default: Optional<SourceHostedReviewRemoteStep>.none
        }
    }

    static func blockMessage(_ reason: HostedReviewBlockedReason?) -> String {
        switch reason {
        case .dirty: "Commit changes before creating a pull request."
        case .detachedHead: "Check out a branch before creating a pull request."
        case .defaultBranch: "Switch to a feature branch before creating a pull request."
        case .noUpstream: "Publish commits before creating a pull request."
        case .needsSync: "Sync this branch before creating a pull request."
        case .authRequired: "Authenticate before creating a pull request."
        case .unsupportedProvider: "Creating pull requests is not supported for this repo."
        case .existingReview: "A pull request already exists for this branch."
        case .forkHeadUnsupported: "Creating a pull request from this fork is not supported."
        case .baseNotOnRemote: "Push the base branch before creating a pull request."
        case .needsPush, nil: "This branch is not ready for a pull request yet."
        }
    }
}

nonisolated private enum SourceHostedReviewRemoteStep: Sendable {
    case publish
    case push
    case forcePush
    case fastForward

    var progress: SourceHostedReviewCreateProgress {
        switch self {
        case .publish: .publishing
        case .push: .pushing
        case .forcePush: .forcePushing
        case .fastForward: .fastForwarding
        }
    }

    func run(
        _ repository: any SourceControlRepository,
        _ hostID: String,
        _ workspaceID: String
    ) async throws {
        switch self {
        case .publish:
            try await repository.pushSourceRemote(
                for: hostID,
                worktreeID: workspaceID,
                publish: true,
                forceWithLease: false
            )
        case .push:
            try await repository.pushSourceRemote(
                for: hostID,
                worktreeID: workspaceID,
                publish: false,
                forceWithLease: false
            )
        case .forcePush:
            try await repository.pushSourceRemote(
                for: hostID,
                worktreeID: workspaceID,
                publish: false,
                forceWithLease: true
            )
        case .fastForward:
            try await repository.fastForwardSourceRemote(for: hostID, worktreeID: workspaceID)
        }
    }
}

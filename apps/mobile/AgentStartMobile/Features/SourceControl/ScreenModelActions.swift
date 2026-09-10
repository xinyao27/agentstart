import Foundation
import UIKit

extension SourceControlModel {
    func stage(_ entry: SourceFileEntry) async {
        guard entry.canStage else { return }
        await mutate("stage:\(entry.path)") {
            try await repository.stageSourceFile(
                for: hostID,
                worktreeID: worktreeID,
                path: entry.path
            )
        }
    }

    func unstage(_ entry: SourceFileEntry) async {
        guard entry.area == .staged else { return }
        await mutate("unstage:\(entry.path)") {
            try await repository.unstageSourceFile(
                for: hostID,
                worktreeID: worktreeID,
                path: entry.path
            )
        }
    }

    func discard(_ entry: SourceFileEntry) async {
        guard entry.canDiscard else { return }
        await mutate("discard:\(entry.path)") {
            try await repository.discardSourceFile(
                for: hostID,
                worktreeID: worktreeID,
                path: entry.path
            )
        }
    }

    func stageAll() async {
        let paths = snapshot?.stageable.map(\.path) ?? []
        guard !paths.isEmpty else { return }
        await mutate("stage-all") {
            try await repository.stageSourceFiles(
                for: hostID,
                worktreeID: worktreeID,
                paths: paths
            )
        }
    }

    func unstageAll() async {
        let paths = snapshot?.staged.map(\.path) ?? []
        guard !paths.isEmpty else { return }
        await mutate("unstage-all") {
            try await repository.unstageSourceFiles(
                for: hostID,
                worktreeID: worktreeID,
                paths: paths
            )
        }
    }

    func fetch() async {
        await mutate("fetch") {
            try await repository.fetchSourceRemote(for: hostID, worktreeID: worktreeID)
        }
    }

    func pull() async {
        await mutate("pull") {
            try await repository.pullSourceRemote(for: hostID, worktreeID: worktreeID)
        }
    }

    func push(publish: Bool = false, forceWithLease: Bool = false) async {
        await mutate(publish ? "publish" : forceWithLease ? "force-push" : "push") {
            try await repository.pushSourceRemote(
                for: hostID,
                worktreeID: worktreeID,
                publish: publish,
                forceWithLease: forceWithLease
            )
        }
    }

    func fastForward() async {
        await mutate("fast-forward") {
            try await repository.fastForwardSourceRemote(for: hostID, worktreeID: worktreeID)
        }
    }

    func rebaseOntoBase() async {
        guard isConnected else {
            errorMessage = SourceControlUnavailableError().localizedDescription
            return
        }
        do {
            let ref = try await resolveBaseRef()
            await mutate("rebase") {
                try await repository.rebaseSourceBranch(
                    for: hostID,
                    worktreeID: worktreeID,
                    baseRef: ref
                )
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func abortConflict() async {
        guard let operation = snapshot?.conflictOperation else { return }
        await mutate("abort-\(operation.rawValue)") {
            try await repository.abortSourceConflict(
                for: hostID,
                worktreeID: worktreeID,
                operation: operation
            )
        }
    }

    func loadLocalBranches() async {
        guard isConnected else {
            errorMessage = SourceControlUnavailableError().localizedDescription
            return
        }
        guard busyAction == nil else { return }
        busyAction = "load-branches"
        errorMessage = nil
        do {
            localBranches = try await repository.sourceLocalBranches(
                for: hostID,
                worktreeID: worktreeID
            )
            busyAction = nil
        } catch {
            busyAction = nil
            localBranches = SourceLocalBranches(current: nil, branches: [])
            errorMessage = error.localizedDescription
        }
    }

    func checkout(_ branch: String) async {
        guard branch != localBranches?.current else { return }
        let succeeded = await mutate("checkout") {
            try await repository.checkoutSourceBranch(
                for: hostID,
                worktreeID: worktreeID,
                branch: branch
            )
        }
        if succeeded { localBranches = nil }
    }

    func generateOrCancelCommitMessage() async {
        if isGeneratingCommitMessage {
            guard isConnected else {
                errorMessage = SourceControlUnavailableError().localizedDescription
                return
            }
            do {
                try await repository.cancelSourceCommitMessage(for: hostID, worktreeID: worktreeID)
            } catch {
                errorMessage = error.localizedDescription
            }
            return
        }
        guard isConnected else {
            errorMessage = SourceControlUnavailableError().localizedDescription
            return
        }
        guard busyAction == nil else { return }
        isGeneratingCommitMessage = true
        errorMessage = nil
        do {
            commitMessage = try await repository.generateSourceCommitMessage(
                for: hostID,
                worktreeID: worktreeID
            )
        } catch is CancellationError {
            // Why: host cancellation is an expected completion, not a failure alert.
        } catch {
            errorMessage = error.localizedDescription
        }
        isGeneratingCommitMessage = false
    }

    func runPrimaryAction() async {
        switch primaryAction {
        case .commit(let enabled):
            guard enabled else { return }
            await commit()
        case .stageAll:
            await stageAll()
        case .publish:
            await push(publish: true)
        case .sync:
            await sync()
        case .pull:
            await pull()
        case .push(let forceWithLease):
            await push(forceWithLease: forceWithLease)
        case .current:
            return
        }
    }

    func runAction(_ action: SourceControlActionKind) async {
        switch action {
        case .commit:
            await commit()
        case .commitPush:
            await commitThenRun("commit-push") {
                try await repository.pushSourceRemote(
                    for: hostID,
                    worktreeID: worktreeID,
                    publish: false,
                    forceWithLease: false
                )
            }
        case .commitSync:
            await commitThenRun("commit-sync") { try await runSyncSteps() }
        case .push:
            await push()
        case .createReview:
            await createHostedReview(action: "create-pr")
        case .pushAndCreateReview:
            await createHostedReview(action: "push-create-pr")
        case .pull:
            await pull()
        case .sync:
            await sync()
        case .fetch:
            await fetch()
        case .publish:
            await push(publish: true)
        case .fastForward:
            await fastForward()
        case .rebase:
            await rebaseOntoBase()
        case .switchBranch, .commits:
            return
        }
    }

    func clearError() {
        errorMessage = nil
    }

    func clearCreatedReview() {
        createdReviewURL = nil
        createdReviewWarning = nil
        createdReviewProvider = nil
    }

    func launchCommitFailureFix() async {
        guard isConnected else {
            commitFailureLaunchError = SourceControlUnavailableError().localizedDescription
            return
        }
        guard let commitFailure, busyAction == nil else { return }
        busyAction = "commit-fix"
        commitFailureLaunchError = nil
        do {
            try await repository.launchSourceControlAgent(
                for: hostID,
                worktreeID: worktreeID,
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
}

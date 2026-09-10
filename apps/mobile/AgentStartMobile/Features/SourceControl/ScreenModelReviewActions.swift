import Foundation
import UIKit

extension SourceControlModel {
    func createHostedReview(action: String) async {
        guard
            isConnected,
            let snapshot,
            let hostedReviewRepository,
            busyAction == nil,
            snapshot.branch != nil
        else { return }
        busyAction = action
        errorMessage = nil
        commitFailure = nil
        reviewCreateProgress = nil
        let stagedBeforeCreate = snapshot.staged
        do {
            let outcome = try await SourceHostedReviewCreator.run(
                hostID: hostID,
                workspace: workspace,
                initialStatus: snapshot,
                commitMessage: commitMessage,
                sourceRepository: repository,
                hostedReviewRepository: hostedReviewRepository
            ) { [weak self] progress in
                self?.reviewCreateProgress = progress
            }
            if outcome.didCommit { commitMessage = "" }
            busyAction = nil
            reviewCreateProgress = nil
            createdReviewURL = outcome.creation.url
            createdReviewWarning = outcome.warning
            createdReviewProvider = outcome.provider
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await refresh(initial: false)
        } catch is CancellationError {
            busyAction = nil
            reviewCreateProgress = nil
        } catch let flowError as SourceHostedReviewCreateError {
            busyAction = nil
            reviewCreateProgress = nil
            switch flowError {
            case .commitFailed(let failure): commitFailure = failure
            case .failed(let message): errorMessage = message
            }
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        } catch {
            let refreshed = try? await repository.sourceStatus(for: hostID, worktreeID: worktreeID)
            if !stagedBeforeCreate.isEmpty, refreshed?.staged.isEmpty == true { commitMessage = "" }
            busyAction = nil
            reviewCreateProgress = nil
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            await refresh(initial: false)
        }
    }
}

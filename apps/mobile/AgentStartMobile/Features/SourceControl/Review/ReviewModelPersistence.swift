import Foundation
import UIKit

@MainActor
extension SourceReviewModel {
    func persist(comments: [SourceReviewComment], state: SourceReviewState) async -> Bool {
        guard isConnected else {
            errorMessage = SourceControlUnavailableError().localizedDescription
            return false
        }
        do {
            try await reviewRepository.saveSourceReviewMetadata(
                for: hostID,
                worktreeID: worktreeID,
                comments: comments,
                state: state
            )
            rebuild(comments: comments, state: state)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            return true
        } catch {
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return false
        }
    }

    func rebuild(comments: [SourceReviewComment], state: SourceReviewState) {
        guard let snapshot else { return }
        let items = SourceReviewProjection.items(
            worktreeID: worktreeID,
            status: snapshot.status,
            branch: snapshot.branchComparison,
            comments: comments,
            state: state
        )
        self.snapshot = SourceReviewSnapshot(
            status: snapshot.status,
            branchComparison: snapshot.branchComparison,
            comments: comments,
            reviewState: state,
            items: items
        )
        currentIndex = min(currentIndex, max(visibleItems.count - 1, 0))
    }

    func restorePosition(selectedID: String?) {
        let items = visibleItems
        guard !items.isEmpty else {
            currentIndex = 0
            return
        }
        if !didApplyTarget {
            didApplyTarget = true
            if let path = target.filePath,
                let index = items.firstIndex(where: {
                    $0.filePath == path && (target.scope == nil || $0.scope == target.scope)
                })
            {
                currentIndex = index
                return
            }
        }
        if let selectedID, let index = items.firstIndex(where: { $0.id == selectedID }) {
            currentIndex = index
        } else {
            currentIndex = min(currentIndex, items.count - 1)
        }
    }

    var nowMilliseconds: Double { Date().timeIntervalSince1970 * 1_000 }
}

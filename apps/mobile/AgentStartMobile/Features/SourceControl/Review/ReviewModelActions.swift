import UIKit

@MainActor
extension SourceReviewModel {
    func markReviewed() async {

        guard requireDesktopConnection() else { return }

        guard let item = currentItem, let snapshot else { return }

        let remaining = snapshot.items.filter { $0.id != item.id && !$0.isReviewed }

        let state = SourceReviewProjection.markReviewed(

            state: snapshot.reviewState,

            item: item,

            now: nowMilliseconds,

            isComplete: remaining.isEmpty

        )

        let visibleBefore = visibleItems

        let nextID =

            visibleBefore.dropFirst(currentIndex + 1).first(where: { !$0.isReviewed })?.id

            ?? visibleBefore.first(where: { $0.id != item.id && !$0.isReviewed })?.id

        guard await persist(comments: snapshot.comments, state: state) else { return }

        UINotificationFeedbackGenerator().notificationOccurred(.success)

        if let nextID, let index = visibleItems.firstIndex(where: { $0.id == nextID }) {

            currentIndex = index

            await loadCurrentDiff()

        } else {

            isShowingCompletion = true

        }

    }

    func markUnreviewed() async {

        guard requireDesktopConnection() else { return }

        guard let item = currentItem, let snapshot else { return }

        let state = SourceReviewProjection.markUnreviewed(

            state: snapshot.reviewState,

            item: item,

            now: nowMilliseconds

        )

        _ = await persist(comments: snapshot.comments, state: state)

    }

    func stageCurrent() async {

        await mutateCurrent("stage") { item in

            try await sourceRepository.stageSourceFile(

                for: hostID,

                worktreeID: worktreeID,

                path: item.filePath

            )

        }

    }

    func unstageCurrent() async {

        await mutateCurrent("unstage") { item in

            try await sourceRepository.unstageSourceFile(

                for: hostID,

                worktreeID: worktreeID,

                path: item.filePath

            )

        }

    }

    func discardCurrent() async {

        await mutateCurrent("discard") { item in

            try await sourceRepository.discardSourceFile(

                for: hostID,

                worktreeID: worktreeID,

                path: item.filePath

            )

        }

    }

    func stageReviewed() async {

        guard requireDesktopConnection(), busyAction == nil, let snapshot else { return }

        let files = snapshot.items.filter { $0.scope == .unstaged && $0.isReviewed && $0.canStage }

        guard !files.isEmpty else { return }

        busyAction = "stage-reviewed"

        errorMessage = nil

        var staged = 0

        var failed = 0

        for item in files {

            do {

                try await sourceRepository.stageSourceFile(

                    for: hostID,

                    worktreeID: worktreeID,

                    path: item.filePath

                )

                staged += 1

            } catch {

                failed += 1

            }

        }

        busyAction = nil

        errorMessage =

            failed > 0 ? "\(staged) staged, \(failed) failed" : "\(staged) reviewed files staged"

        await load()

    }

    func mutateCurrent(

        _ action: String,

        operation: (SourceReviewItem) async throws -> Void

    ) async {

        guard requireDesktopConnection(), busyAction == nil, let item = currentItem else { return }

        busyAction = "\(action):\(item.filePath)"

        errorMessage = nil

        do {

            try await operation(item)

            busyAction = nil

            UINotificationFeedbackGenerator().notificationOccurred(.success)

            await load()

        } catch {

            busyAction = nil

            errorMessage = error.localizedDescription

            UINotificationFeedbackGenerator().notificationOccurred(.error)

        }

    }
}

import Foundation
import UIKit

@MainActor
extension SourceReviewModel {
    func loadTerminals() async {

        guard requireDesktopConnection() else { return }

        guard !isLoadingTerminals else { return }

        isLoadingTerminals = true

        do {

            terminals = try await reviewRepository.sourceReviewTerminals(

                for: hostID,

                worktreeID: worktreeID

            )

        } catch {

            errorMessage = error.localizedDescription

            terminals = []

        }

        isLoadingTerminals = false

    }

    func sendNotes(to terminal: SourceReviewTerminal?) async -> Bool {

        guard requireDesktopConnection(), !unsentComments.isEmpty, let snapshot, busyAction == nil
        else {
            return false
        }

        busyAction = "send-notes"

        errorMessage = nil

        do {

            let destination =

                if let terminal {

                    terminal

                } else {

                    try await reviewRepository.createSourceReviewTerminal(

                        for: hostID,

                        worktreeID: worktreeID

                    )

                }

            try await reviewRepository.sendSourceReviewNotes(

                for: hostID,

                terminalID: destination.id,

                comments: unsentComments

            )

            let sentIDs = Set(unsentComments.map(\.id))

            let comments = snapshot.comments.map { value in

                guard sentIDs.contains(value.id) else { return value }

                return SourceReviewComment(

                    id: value.id,

                    worktreeID: value.worktreeID,

                    filePath: value.filePath,

                    source: value.source,

                    selectedText: value.selectedText,

                    startLine: value.startLine,

                    lineNumber: value.lineNumber,

                    body: value.body,

                    createdAt: value.createdAt,

                    updatedAt: value.updatedAt,

                    sentAt: nowMilliseconds,

                    scope: value.scope,

                    oldPath: value.oldPath,

                    diffIdentity: value.diffIdentity

                )

            }

            try await reviewRepository.saveSourceReviewMetadata(

                for: hostID,

                worktreeID: worktreeID,

                comments: comments,

                state: snapshot.reviewState

            )

            rebuild(comments: comments, state: snapshot.reviewState)

            busyAction = nil

            UINotificationFeedbackGenerator().notificationOccurred(.success)

            return true

        } catch {

            busyAction = nil

            errorMessage = error.localizedDescription

            return false

        }

    }

    func clearSentNotes() async {

        guard let snapshot else { return }

        _ = await persist(

            comments: snapshot.comments.filter { $0.sentAt == nil },

            state: snapshot.reviewState

        )

    }

    func copyNotes() {

        guard let comments = snapshot?.comments, !comments.isEmpty else { return }

        UIPasteboard.general.string = formattedComments(comments)

        errorMessage = String(localized: "Review notes copied")

        UINotificationFeedbackGenerator().notificationOccurred(.success)

    }

    func openCurrentInSession() async -> Bool {

        guard requireDesktopConnection(), let item = currentItem, item.scope != .branch else {
            return false
        }

        do {

            try await reviewRepository.openSourceReviewInSession(

                for: hostID,

                worktreeID: worktreeID,

                item: item

            )

            return true

        } catch {

            errorMessage = error.localizedDescription

            return false

        }

    }

    func clearError() { errorMessage = nil }

    func formattedComments(_ comments: [SourceReviewComment]) -> String {
        formatSourceReviewComments(comments)
    }
}

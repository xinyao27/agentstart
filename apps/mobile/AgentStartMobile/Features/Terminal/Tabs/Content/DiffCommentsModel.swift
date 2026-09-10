import Foundation
import Observation
import UIKit

@Observable
@MainActor
final class WorkspaceDiffCommentsModel {
    private(set) var comments: [SourceReviewComment] = []
    private(set) var isBusy = false
    private(set) var errorMessage: String?
    private(set) var feedbackMessage: String?
    private(set) var terminals: [SourceReviewTerminal]?
    private(set) var isLoadingTerminals = false
    var isShowingSend = false

    @ObservationIgnored private let hostID: String
    @ObservationIgnored private let worktreeID: String
    @ObservationIgnored private let repository: any SourceReviewRepository
    @ObservationIgnored private var reviewState = SourceReviewState.empty
    @ObservationIgnored private var didLoad = false

    init(
        hostID: String,
        worktreeID: String,
        repository: any SourceReviewRepository
    ) {
        self.hostID = hostID
        self.worktreeID = worktreeID
        self.repository = repository
    }

    var unsentComments: [SourceReviewComment] {
        comments.filter { $0.sentAt == nil }
    }

    func load() async {
        guard !didLoad else { return }
        do {
            let metadata = try await repository.sourceReviewMetadata(
                for: hostID,
                worktreeID: worktreeID
            )
            guard !Task.isCancelled else { return }
            comments = metadata.comments
            reviewState = metadata.state
            didLoad = true
        } catch is CancellationError {
            return
        } catch {
            // Why: Session content can appear before the runtime handshake; retrying on the next
            // diff pane avoids interrupting the terminal with an alert.
        }
    }

    func add(
        filePath: String,
        lineNumber: Int,
        body: String,
        source: WorkspaceFileDiffSource
    ) async -> Bool {
        let trimmedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedBody.isEmpty, !isBusy else { return false }
        let comment = SourceReviewComment(
            id: "mobile-\(Int(nowMilliseconds))-\(UUID().uuidString.lowercased())",
            worktreeID: worktreeID,
            filePath: filePath,
            source: "diff",
            selectedText: nil,
            startLine: nil,
            lineNumber: lineNumber,
            body: trimmedBody,
            createdAt: nowMilliseconds,
            updatedAt: nil,
            sentAt: nil,
            scope: reviewScope(for: source),
            oldPath: nil,
            diffIdentity: nil
        )
        let previous = comments
        let next = comments + [comment]
        isBusy = true
        comments = next
        do {
            try await persist(next)
            isBusy = false
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            return true
        } catch {
            comments = previous
            isBusy = false
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return false
        }
    }

    func delete(_ comment: SourceReviewComment) async {
        guard !isBusy else { return }
        let previous = comments
        let next = comments.filter { $0.id != comment.id }
        guard next.count != previous.count else { return }
        isBusy = true
        comments = next
        do {
            try await persist(next)
            isBusy = false
            UISelectionFeedbackGenerator().selectionChanged()
        } catch {
            comments = previous
            isBusy = false
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    func copyNotes() {
        guard !comments.isEmpty else { return }
        UIPasteboard.general.string = formattedComments(comments)
        feedbackMessage = "Review notes copied"
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    func loadTerminals() async {
        guard !isLoadingTerminals else { return }
        isLoadingTerminals = true
        do {
            terminals = try await repository.sourceReviewTerminals(
                for: hostID,
                worktreeID: worktreeID
            )
        } catch {
            terminals = []
            errorMessage = error.localizedDescription
        }
        isLoadingTerminals = false
    }

    func sendNotes(to terminal: SourceReviewTerminal?) async -> Bool {
        guard !unsentComments.isEmpty, !isBusy else { return false }
        isBusy = true
        do {
            let destination =
                if let terminal {
                    terminal
                } else {
                    try await repository.createSourceReviewTerminal(
                        for: hostID,
                        worktreeID: worktreeID
                    )
                }
            let delivered = unsentComments
            try await repository.sendSourceReviewNotes(
                for: hostID,
                terminalID: destination.id,
                comments: delivered
            )
            let deliveredIDs = Set(delivered.map(\.id))
            let next = comments.map { comment in
                guard deliveredIDs.contains(comment.id) else { return comment }
                return SourceReviewComment(
                    id: comment.id,
                    worktreeID: comment.worktreeID,
                    filePath: comment.filePath,
                    source: comment.source,
                    selectedText: comment.selectedText,
                    startLine: comment.startLine,
                    lineNumber: comment.lineNumber,
                    body: comment.body,
                    createdAt: comment.createdAt,
                    updatedAt: nowMilliseconds,
                    sentAt: nowMilliseconds,
                    scope: comment.scope,
                    oldPath: comment.oldPath,
                    diffIdentity: comment.diffIdentity
                )
            }
            try await persist(next)
            comments = next
            isBusy = false
            isShowingSend = false
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            return true
        } catch {
            isBusy = false
            errorMessage = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            return false
        }
    }

    func dismissMessage() {
        errorMessage = nil
        feedbackMessage = nil
    }

    private func persist(_ next: [SourceReviewComment]) async throws {
        try await repository.saveSourceReviewMetadata(
            for: hostID,
            worktreeID: worktreeID,
            comments: next,
            state: reviewState
        )
    }

    private func reviewScope(for source: WorkspaceFileDiffSource) -> SourceReviewScope {
        switch source {
        case .staged: .staged
        case .unstaged: .unstaged
        }
    }

    private var nowMilliseconds: Double { Date().timeIntervalSince1970 * 1_000 }

    private func formattedComments(_ values: [SourceReviewComment]) -> String {
        values.map { comment in
            let location: String
            if comment.lineNumber == 0 {
                location = "Scope: file"
            } else if let startLine = comment.startLine, startLine != comment.lineNumber {
                location = "Lines: \(startLine)-\(comment.lineNumber)"
            } else {
                location = "Line: \(comment.lineNumber)"
            }
            let escaped = comment.body
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\r", with: "\\r")
                .replacingOccurrences(of: "\n", with: "\\n")
            return "File: \(comment.filePath)\n\(location)\nUser comment: \"\(escaped)\""
        }.joined(separator: "\n\n")
    }
}

import Foundation

@MainActor
extension SourceReviewModel {
    func openComposer(line: Int) {
        composer = .create(line: line)
        composerBody = ""
    }

    func editComment(_ comment: SourceReviewComment) {
        composer = .edit(comment)
        composerBody = comment.body
    }

    func closeComposer() {
        composer = nil
        composerBody = ""
    }

    func saveComposer() async {
        guard let composer, let item = currentItem, let snapshot else { return }
        let body = composerBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        var comments = snapshot.comments
        switch composer {
        case .create(let line):
            comments.append(
                SourceReviewComment(
                    id: "mobile-\(Int(nowMilliseconds))-\(UUID().uuidString.lowercased())",
                    worktreeID: worktreeID,
                    filePath: item.filePath,
                    source: "diff",
                    selectedText: nil,
                    startLine: nil,
                    lineNumber: line,
                    body: body,
                    createdAt: nowMilliseconds,
                    updatedAt: nil,
                    sentAt: nil,
                    scope: item.scope,
                    oldPath: item.oldPath,
                    diffIdentity: item.diffIdentity
                )
            )
        case .edit(let comment):
            comments = comments.map {
                guard $0.id == comment.id else { return $0 }
                return SourceReviewComment(
                    id: $0.id,
                    worktreeID: $0.worktreeID,
                    filePath: $0.filePath,
                    source: $0.source,
                    selectedText: $0.selectedText,
                    startLine: $0.startLine,
                    lineNumber: $0.lineNumber,
                    body: body,
                    createdAt: $0.createdAt,
                    updatedAt: nowMilliseconds,
                    sentAt: nil,
                    scope: $0.scope,
                    oldPath: $0.oldPath,
                    diffIdentity: $0.diffIdentity
                )
            }
        }
        if await persist(comments: comments, state: snapshot.reviewState) { closeComposer() }
    }

    func deleteComposerComment() async {
        guard case .edit(let comment) = composer, let snapshot else { return }
        if await persist(
            comments: snapshot.comments.filter { $0.id != comment.id },
            state: snapshot.reviewState
        ) {
            closeComposer()
        }
    }
}

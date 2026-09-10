import Foundation

nonisolated enum HostedReviewCommentGroup: Identifiable, Hashable, Sendable {
    case standalone(HostedReviewComment)
    case thread(id: String, root: HostedReviewComment, replies: [HostedReviewComment])

    var id: String {
        switch self {
        case .standalone(let comment): "comment:\(comment.id)"
        case .thread(let id, _, _): "thread:\(id)"
        }
    }

    var root: HostedReviewComment {
        switch self {
        case .standalone(let comment): comment
        case .thread(_, let root, _): root
        }
    }

    var comments: [HostedReviewComment] {
        switch self {
        case .standalone(let comment): [comment]
        case .thread(_, let root, let replies): [root] + replies
        }
    }

    var isThread: Bool {
        switch self {
        case .standalone: false
        case .thread: true
        }
    }

    var isResolved: Bool { root.isResolved }
}

private struct HostedReviewCommentThread: Sendable {
    let root: HostedReviewComment
    var replies: [HostedReviewComment]
}

nonisolated func groupHostedReviewComments(
    _ comments: [HostedReviewComment]
) -> [HostedReviewCommentGroup] {
    var threads: [String: HostedReviewCommentThread] = [:]
    var standalone: [Int: HostedReviewCommentGroup] = [:]

    for comment in comments {
        guard let threadID = comment.threadID, !threadID.isEmpty else {
            standalone[comment.id] = .standalone(comment)
            continue
        }

        if var thread = threads[threadID] {
            thread.replies.append(comment)
            threads[threadID] = thread
        } else {
            threads[threadID] = HostedReviewCommentThread(root: comment, replies: [])
        }
    }

    var emittedThreads = Set<String>()
    var groups: [HostedReviewCommentGroup] = []
    for comment in comments {
        guard let threadID = comment.threadID, !threadID.isEmpty else {
            if let group = standalone[comment.id] { groups.append(group) }
            continue
        }
        guard emittedThreads.insert(threadID).inserted, let thread = threads[threadID] else {
            continue
        }
        groups.append(.thread(id: threadID, root: thread.root, replies: thread.replies))
    }
    return groups
}

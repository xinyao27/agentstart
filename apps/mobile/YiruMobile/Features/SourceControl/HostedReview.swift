import Foundation
import SwiftUI

nonisolated enum HostedReviewProvider: String, Hashable, Sendable {
    case github
    case unsupported

    var title: String {
        switch self {
        case .github: "GitHub"
        case .unsupported: String(localized: "Hosted review")
        }
    }

    var supportsCreation: Bool {
        switch self {
        case .github: true
        case .unsupported: false
        }
    }

    var reviewTitle: String { "Pull Request" }
    var reviewLabel: String { "pull request" }
    var shortReviewTitle: String { "PR" }
}

nonisolated enum HostedReviewState: String, Hashable, Sendable {
    case open
    case closed
    case merged
    case draft

    var title: LocalizedStringResource {
        switch self {
        case .open: "Open"
        case .closed: "Closed"
        case .merged: "Merged"
        case .draft: "Draft"
        }
    }

    @MainActor var color: Color {
        switch self {
        case .open: Theme.Colors.reviewOpen
        case .closed: Theme.Colors.attention
        case .merged: Theme.Colors.reviewMerged
        case .draft: Theme.Colors.mutedForeground
        }
    }
}

nonisolated enum HostedReviewCheckStatus: String, Hashable, Sendable {
    case pending
    case success
    case failure
    case neutral
}

nonisolated enum HostedReviewMergeable: String, Hashable, Sendable {
    case mergeable = "MERGEABLE"
    case conflicting = "CONFLICTING"
    case unknown = "UNKNOWN"
}

nonisolated enum HostedReviewDecision: String, Hashable, Sendable {
    case approved = "APPROVED"
    case changesRequested = "CHANGES_REQUESTED"
    case reviewRequired = "REVIEW_REQUIRED"
}

nonisolated struct HostedReviewConflict: Hashable, Sendable {
    let baseRef: String
    let baseCommit: String
    let commitsBehind: Int
    let files: [String]
    let localMergeState: String?

    var mergeabilityRefreshCommands: String? {
        guard localMergeState == "clean" else { return nil }
        return [
            "git fetch origin",
            "git commit --allow-empty --only -m \"chore: refresh PR mergeability\"",
            "git push",
        ].joined(separator: "\n")
    }
}

nonisolated struct HostedReviewMergeMethodSettings: Hashable, Sendable {
    let defaultMethod: String
    let allowedMethods: [String: Bool]

    var preferredMethod: String {
        if allowedMethods[defaultMethod] != false { return defaultMethod }
        return ["merge", "squash", "rebase"].first { allowedMethods[$0] == true }
            ?? defaultMethod
    }
}

nonisolated struct HostedReview: Hashable, Sendable {
    let provider: HostedReviewProvider
    let number: Int
    let title: String
    let state: HostedReviewState
    let url: URL?
    let checksStatus: HostedReviewCheckStatus
    let mergeable: HostedReviewMergeable
    let reviewDecision: HostedReviewDecision?
    let autoMergeEnabled: Bool
    let autoMergeAllowed: Bool?
    let mergeQueueRequired: Bool?
    let mergeMethodSettings: HostedReviewMergeMethodSettings?
    let mergeStateStatus: String?
    let headSHA: String?
    let baseRefName: String?
    let conflict: HostedReviewConflict?

    var preferredMergeMethod: String { mergeMethodSettings?.preferredMethod ?? "squash" }
}

nonisolated enum HostedReviewBlockedReason: String, Hashable, Sendable {
    case dirty
    case detachedHead = "detached_head"
    case defaultBranch = "default_branch"
    case noUpstream = "no_upstream"
    case needsPush = "needs_push"
    case needsSync = "needs_sync"
    case authRequired = "auth_required"
    case forkHeadUnsupported = "fork_head_unsupported"
    case unsupportedProvider = "unsupported_provider"
    case existingReview = "existing_review"
    case baseNotOnRemote = "base_not_on_remote"
}

nonisolated struct HostedReviewEligibility: Hashable, Sendable {
    let provider: HostedReviewProvider
    let canCreate: Bool
    let blockedReason: HostedReviewBlockedReason?
    let existingReviewURL: URL?
    let defaultBaseRef: String?
    let head: String?
    let suggestedTitle: String?
    let suggestedBody: String?
}

nonisolated enum HostedReviewNextAction: String, Hashable, Sendable {
    case commit
    case publish
    case push
    case sync
    case authenticate
    case openExistingReview = "open_existing_review"
}

nonisolated struct HostedReviewDraft: Hashable, Sendable {
    let provider: HostedReviewProvider
    let base: String
    let head: String?
    let title: String
    let body: String
    let isDraft: Bool
    let useTemplate: Bool
}

nonisolated struct HostedReviewCreation: Hashable, Sendable {
    let number: Int?
    let url: URL?
    let isExisting: Bool
}

nonisolated struct HostedReviewRepoIdentity: Hashable, Sendable {
    let owner: String
    let repo: String
}

nonisolated struct HostedReviewUser: Identifiable, Hashable, Sendable {
    let login: String
    let name: String?
    let avatarURL: URL?

    var id: String { login.lowercased() }
}

nonisolated struct HostedReviewReviewer: Identifiable, Hashable, Sendable {
    let login: String
    let name: String?
    let avatarURL: URL?
    let status: String

    var id: String { login.lowercased() }
}

nonisolated struct HostedReviewReaction: Hashable, Sendable {
    let content: String
    let count: Int
}

nonisolated struct HostedReviewComment: Identifiable, Hashable, Sendable {
    let id: Int
    let author: String
    let authorAvatarURL: URL?
    let body: String
    let createdAt: Date?
    let url: URL?
    let reactions: [HostedReviewReaction]
    let path: String?
    let threadID: String?
    let isResolved: Bool
    let isOutdated: Bool
    let line: Int?
    let startLine: Int?
    let isBot: Bool
}

nonisolated enum HostedReviewCheckRunStatus: String, Hashable, Sendable {
    case queued
    case inProgress = "in_progress"
    case completed
}

nonisolated struct HostedReviewCheck: Identifiable, Hashable, Sendable {
    let name: String
    let status: HostedReviewCheckRunStatus
    let conclusion: String?
    let url: URL?
    let checkRunID: Int?
    let workflowRunID: Int?

    var id: String {
        if let checkRunID { return "run:\(checkRunID)" }
        if let workflowRunID { return "workflow:\(workflowRunID)" }
        return "name:\(name)"
    }

    var outcome: HostedReviewCheckStatus {
        guard status == .completed else { return .pending }
        switch conclusion {
        case "success": return .success
        case "failure", "cancelled", "timed_out": return .failure
        case nil, "pending": return .pending
        default: return .neutral
        }
    }
}

nonisolated struct HostedReviewCheckAnnotation: Identifiable, Hashable, Sendable {
    let path: String?
    let startLine: Int?
    let endLine: Int?
    let level: String?
    let title: String?
    let message: String
    let rawDetails: String?

    var id: String {
        "\(path ?? ""):\(startLine ?? 0):\(endLine ?? 0):\(title ?? ""):\(message)"
    }
}

nonisolated struct HostedReviewCheckStep: Identifiable, Hashable, Sendable {
    let name: String
    let status: String?
    let conclusion: String?

    var id: String { "\(name):\(status ?? ""):\(conclusion ?? "")" }
}

nonisolated struct HostedReviewCheckJob: Hashable, Sendable {
    let id: Int?
    let name: String
    let status: String?
    let conclusion: String?
    let url: URL?
    let logTail: String?
    let steps: [HostedReviewCheckStep]

    var stableID: String { id.map { "job:\($0)" } ?? "job:\(name)" }
}

nonisolated struct HostedReviewCheckRunDetails: Hashable, Sendable {
    let name: String
    let status: String?
    let conclusion: String?
    let url: URL?
    let detailsURL: URL?
    let title: String?
    let summary: String?
    let text: String?
    let annotations: [HostedReviewCheckAnnotation]
    let jobs: [HostedReviewCheckJob]
}

nonisolated struct HostedReviewFile: Identifiable, Hashable, Sendable {
    let path: String
    let oldPath: String?
    let status: String
    let additions: Int
    let deletions: Int
    let isBinary: Bool

    var id: String { path }
}

nonisolated struct HostedReviewDetails: Hashable, Sendable {
    let title: String
    let author: String?
    let branchName: String?
    let baseRefName: String?
    let body: String
    let comments: [HostedReviewComment]
    let checks: [HostedReviewCheck]
    let files: [HostedReviewFile]
    let reviewers: [HostedReviewReviewer]
    let repoIdentity: HostedReviewRepoIdentity?
    let headSHA: String?
}

nonisolated enum HostedReviewMutation: Hashable, Sendable {
    case update(title: String?, body: String?)
    case merge(method: String)
    case setAutoMerge(enabled: Bool, method: String)
    case updateState(HostedReviewState)
    case requestReviewer(String)
    case removeReviewer(String)
    case addComment(String)
    case reply(comment: HostedReviewComment, body: String)
    case rerunFailedChecks
    case resolveThread(id: String, resolve: Bool)
}

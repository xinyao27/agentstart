import Foundation
import YiruProtocol

nonisolated func hostedReviewRepoSelector(_ repoID: String) -> String {
    "id:\(repoID)"
}

nonisolated func hostedReviewWorktreeSelector(_ worktreeID: String) -> String {
    "id:\(worktreeID)"
}

nonisolated func hostedReviewProvider(_ value: Yiru_Runtime_V1_GitHubHostedReviewProvider)
    -> HostedReviewProvider
{
    switch value {
    case .github: .github
    case .unsupported, .unspecified, .UNRECOGNIZED: .unsupported
    }
}

nonisolated func hostedReviewProviderValue(_ provider: HostedReviewProvider)
    -> Yiru_Runtime_V1_GitHubHostedReviewProvider
{
    provider == .github ? .github : .unsupported
}

nonisolated func hostedReviewBlockedReason(
    _ value: Yiru_Runtime_V1_GitHubHostedReviewBlockedReason
) -> HostedReviewBlockedReason? {
    switch value {
    case .dirty: .dirty
    case .detachedHead: .detachedHead
    case .defaultBranch: .defaultBranch
    case .noUpstream: .noUpstream
    case .needsPush: .needsPush
    case .needsSync: .needsSync
    case .authRequired: .authRequired
    case .unsupportedProvider: .unsupportedProvider
    case .existingReview: .existingReview
    case .unspecified, .UNRECOGNIZED: nil
    }
}

// Why: the branch lookup returns a condensed PR summary with provider implied by
// the GitHubService surface, so only the projection below differs from the
// workbench's githubPrInfo mapping.
nonisolated func hostedReviewSummary(_ pr: Yiru_Runtime_V1_GitHubPrSummary) -> HostedReview {
    HostedReview(
        provider: .github,
        number: Int(pr.number),
        title: pr.title,
        state: hostedReviewState(pr.state),
        url: URL(string: pr.url),
        checksStatus: hostedReviewChecksStatus(pr.checksStatus),
        mergeable: hostedReviewMergeable(pr.mergeable),
        reviewDecision: hostedReviewDecision(pr.reviewDecision),
        autoMergeEnabled: pr.hasAutoMergeEnabled ? pr.autoMergeEnabled : false,
        autoMergeAllowed: pr.hasAutoMergeAllowed ? pr.autoMergeAllowed : nil,
        mergeQueueRequired: pr.hasMergeQueueRequired ? pr.mergeQueueRequired : nil,
        mergeMethodSettings: pr.hasMergeMethodSettings
            ? hostedReviewMergeMethodSettings(pr.mergeMethodSettings) : nil,
        mergeStateStatus: pr.hasMergeStateStatus ? pr.mergeStateStatus : nil,
        headSHA: pr.hasHeadSha ? pr.headSha : nil,
        baseRefName: pr.hasBaseRefName ? pr.baseRefName : nil,
        conflict: pr.hasConflictSummary
            ? hostedReviewConflict(pr.conflictSummary) : nil
    )
}

nonisolated private func hostedReviewState(_ value: Yiru_Runtime_V1_GitHubPrState)
    -> HostedReviewState
{
    switch value {
    case .closed: .closed
    case .merged: .merged
    case .draft: .draft
    case .open, .unspecified, .UNRECOGNIZED: .open
    }
}

nonisolated private func hostedReviewChecksStatus(_ value: Yiru_Runtime_V1_GitHubChecksState)
    -> HostedReviewCheckStatus
{
    switch value {
    case .success: .success
    case .failure: .failure
    case .none, .pending, .unspecified, .UNRECOGNIZED: .pending
    }
}

nonisolated private func hostedReviewMergeable(_ value: Yiru_Runtime_V1_GitHubPrMergeable)
    -> HostedReviewMergeable
{
    switch value {
    case .mergeable: .mergeable
    case .conflicting: .conflicting
    case .unknown, .unspecified, .UNRECOGNIZED: .unknown
    }
}

nonisolated private func hostedReviewDecision(_ value: Yiru_Runtime_V1_GitHubReviewDecision)
    -> HostedReviewDecision?
{
    switch value {
    case .approved: .approved
    case .changesRequested: .changesRequested
    case .reviewRequired: .reviewRequired
    case .unspecified, .UNRECOGNIZED: nil
    }
}

nonisolated private func hostedReviewMergeMethodSettings(
    _ value: Yiru_Runtime_V1_GitHubMergeMethodSettings
) -> HostedReviewMergeMethodSettings {
    HostedReviewMergeMethodSettings(
        defaultMethod: value.defaultMethod.isEmpty ? "squash" : value.defaultMethod,
        allowedMethods: [
            "merge": value.mergeAllowed,
            "squash": value.squashAllowed,
            "rebase": value.rebaseAllowed,
        ]
    )
}

nonisolated private func hostedReviewConflict(_ value: Yiru_Runtime_V1_GitHubConflictSummary)
    -> HostedReviewConflict
{
    HostedReviewConflict(
        baseRef: value.baseRef,
        baseCommit: value.baseCommit,
        commitsBehind: Int(value.commitsBehind),
        files: value.files,
        localMergeState: value.mergeClean == true ? "clean" : nil
    )
}

nonisolated func mapHostedReviewDetails(
    _ details: Yiru_Runtime_V1_GitHubWorkItemDetails,
    botAuthors: Set<String>
)
    -> HostedReviewDetails
{
    let item = details.item
    let requested = Dictionary(
        uniqueKeysWithValues: item.reviewRequests.map {
            ($0.login.lowercased(), $0)
        })
    let reviewed = Dictionary(
        uniqueKeysWithValues: item.latestReviews.map {
            ($0.login.lowercased(), $0)
        })
    let identities = Set(requested.keys).union(reviewed.keys)
    let reviewers = identities.sorted().map { key -> HostedReviewReviewer in
        let user = requested[key]
        let review = reviewed[key]
        return HostedReviewReviewer(
            login: user?.login ?? review?.login ?? key,
            name: user.flatMap { $0.hasName ? $0.name : nil },
            avatarURL: URL(string: user?.avatarURL ?? review?.avatarURL ?? ""),
            status: hostedReviewStatus(
                requested: user != nil,
                state: review.flatMap { $0.hasReviewState ? $0.reviewState : nil }
            )
        )
    }
    return HostedReviewDetails(
        title: item.title,
        author: item.hasAuthor ? item.author : nil,
        branchName: item.branchName,
        baseRefName: item.baseRefName,
        body: details.body,
        comments: details.comments.map { hostedReviewComment($0, botAuthors: botAuthors) },
        checks: details.checks.map(hostedReviewCheck),
        files: details.files.map(hostedReviewFile),
        reviewers: reviewers,
        repoIdentity: item.hasPrRepo
            ? HostedReviewRepoIdentity(owner: item.prRepo.owner, repo: item.prRepo.repo) : nil,
        headSHA: details.hasHeadSha
            ? details.headSha : (item.hasHeadSha ? item.headSha : nil)
    )
}

nonisolated func hostedReviewStatus(requested: Bool, state: String?) -> String {
    switch state {
    case "APPROVED": String(localized: "Approved")
    case "CHANGES_REQUESTED": String(localized: "Changes requested")
    case "COMMENTED": String(localized: "Commented")
    case "DISMISSED": String(localized: "Dismissed")
    case "PENDING": String(localized: "Pending")
    default: requested ? String(localized: "Requested") : String(localized: "Reviewed")
    }
}

nonisolated func hostedReviewComment(
    _ comment: Yiru_Runtime_V1_GitHubComment,
    botAuthors: Set<String>
)
    -> HostedReviewComment
{
    HostedReviewComment(
        id: Int(comment.id),
        author: comment.author,
        authorAvatarURL: URL(string: comment.authorAvatarURL),
        body: comment.body,
        createdAt: ISODateParser.date(comment.createdAt),
        url: URL(string: comment.url),
        reactions: comment.reactions.compactMap {
            hostedReviewReaction(content: $0.content, count: $0.count)
        },
        path: comment.hasPath ? comment.path : nil,
        threadID: comment.hasThreadID ? comment.threadID : nil,
        isResolved: comment.hasIsResolved ? comment.isResolved : false,
        isOutdated: comment.hasIsOutdated ? comment.isOutdated : false,
        line: comment.hasLine ? Int(comment.line) : nil,
        startLine: comment.hasStartLine ? Int(comment.startLine) : nil,
        isBot: comment.isBot || isHostedReviewBotAuthor(comment.author, overrides: botAuthors)
    )
}

nonisolated func hostedReviewReaction(
    content: Yiru_Runtime_V1_GitHubReactionContent,
    count: UInt64
) -> HostedReviewReaction? {
    let rawValue: String?
    switch content {
    case .thumbsUp: rawValue = "+1"
    case .thumbsDown: rawValue = "-1"
    case .laugh: rawValue = "laugh"
    case .confused: rawValue = "confused"
    case .heart: rawValue = "heart"
    case .hooray: rawValue = "hooray"
    case .rocket: rawValue = "rocket"
    case .eyes: rawValue = "eyes"
    case .unspecified, .UNRECOGNIZED: rawValue = nil
    }
    return rawValue.map { HostedReviewReaction(content: $0, count: Int(count)) }
}

nonisolated func hostedReviewBotAuthorSet(_ values: [String]) -> Set<String> {
    Set(
        values.prefix(500).compactMap { value in
            let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return normalized.isEmpty || normalized.count > 255 ? nil : normalized
        })
}

nonisolated func isHostedReviewBotAuthor(
    _ author: String,
    overrides: Set<String>
) -> Bool {
    let normalized = author.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !normalized.isEmpty, normalized.count <= 255 else { return false }
    if overrides.contains(normalized) || normalized.hasSuffix("[bot]") { return true }
    let automationFragments = [
        "chatgpt-codex-connector", "codex-connector", "qodo", "coderabbit", "codium",
        "sonarcloud", "sonarqube", "sourcery-ai", "deepsource", "snyk", "codecov",
        "greptile", "ellipsis", "graphite-app", "reviewer-gpt", "-reviewer", "automation",
        "actions", "renovate", "dependabot",
    ]
    if automationFragments.contains(where: normalized.contains) { return true }
    if normalized.hasSuffix("bot") { return true }
    return normalized.range(of: #"\bbot\b"#, options: .regularExpression) != nil
}

nonisolated func hostedReviewCheck(_ entry: Yiru_Runtime_V1_GitHubCheckEntry) -> HostedReviewCheck {
    HostedReviewCheck(
        name: entry.name,
        status: hostedReviewCheckRunStatus(entry.status),
        conclusion: hostedReviewCheckConclusion(entry.conclusion),
        url: entry.hasURL ? URL(string: entry.url) : nil,
        checkRunID: entry.hasCheckRunID ? Int(entry.checkRunID) : nil,
        workflowRunID: entry.hasWorkflowRunID ? Int(entry.workflowRunID) : nil
    )
}

nonisolated func hostedReviewCheckRunStatus(
    _ status: Yiru_Runtime_V1_GitHubCheckRunStatus
) -> HostedReviewCheckRunStatus {
    switch status {
    case .queued: .queued
    case .inProgress: .inProgress
    case .completed: .completed
    case .unspecified, .UNRECOGNIZED: .queued
    }
}

nonisolated func hostedReviewCheckConclusion(
    _ conclusion: Yiru_Runtime_V1_GitHubCheckConclusion
) -> String? {
    switch conclusion {
    case .success: "success"
    case .failure: "failure"
    case .cancelled: "cancelled"
    case .timedOut: "timed_out"
    case .neutral: "neutral"
    case .skipped: "skipped"
    case .pending: "pending"
    case .actionRequired: "action_required"
    case .unspecified, .UNRECOGNIZED: nil
    }
}

nonisolated func hostedReviewFile(_ entry: Yiru_Runtime_V1_GitHubFileEntry) -> HostedReviewFile {
    HostedReviewFile(
        path: entry.path,
        oldPath: entry.hasOldPath ? entry.oldPath : nil,
        status: hostedReviewFileStatus(entry.status),
        additions: Int(entry.additions),
        deletions: Int(entry.deletions),
        isBinary: entry.isBinary
    )
}

nonisolated func hostedReviewFileStatus(_ status: Yiru_Runtime_V1_GitHubFileStatus) -> String {
    switch status {
    case .added: "added"
    case .removed: "removed"
    case .modified: "modified"
    case .renamed: "renamed"
    case .copied: "copied"
    case .changed: "changed"
    case .unchanged: "unchanged"
    case .unspecified, .UNRECOGNIZED: "modified"
    }
}

nonisolated func hostedReviewCheckRunDetails(_ details: Yiru_Runtime_V1_GitHubCheckDetails)
    -> HostedReviewCheckRunDetails
{
    HostedReviewCheckRunDetails(
        name: details.name,
        status: details.hasStatus ? details.status : nil,
        conclusion: details.hasConclusion ? details.conclusion : nil,
        url: details.hasURL ? URL(string: details.url) : nil,
        detailsURL: details.hasDetailsURL ? URL(string: details.detailsURL) : nil,
        title: details.hasTitle ? details.title : nil,
        summary: details.hasSummary ? details.summary : nil,
        text: details.hasText ? details.text : nil,
        annotations: details.annotations.map {
            HostedReviewCheckAnnotation(
                path: $0.hasPath ? $0.path : nil,
                startLine: $0.hasStartLine ? Int($0.startLine) : nil,
                endLine: $0.hasEndLine ? Int($0.endLine) : nil,
                level: $0.hasAnnotationLevel ? $0.annotationLevel : nil,
                title: $0.hasTitle ? $0.title : nil,
                message: $0.message,
                rawDetails: $0.hasRawDetails ? $0.rawDetails : nil
            )
        },
        jobs: details.jobs.map {
            HostedReviewCheckJob(
                id: $0.hasID ? Int($0.id) : nil,
                name: $0.name,
                status: $0.hasStatus ? $0.status : nil,
                conclusion: $0.hasConclusion ? $0.conclusion : nil,
                url: $0.hasURL ? URL(string: $0.url) : nil,
                logTail: $0.hasLogTail ? $0.logTail : nil,
                steps: $0.steps.map {
                    HostedReviewCheckStep(
                        name: $0.name,
                        status: $0.hasStatus ? $0.status : nil,
                        conclusion: $0.hasConclusion ? $0.conclusion : nil
                    )
                }
            )
        }
    )
}

nonisolated func hostedReviewRepoRef(_ identity: HostedReviewRepoIdentity)
    -> Yiru_Runtime_V1_GitHubRepoRef
{
    Yiru_Runtime_V1_GitHubRepoRef.with {
        $0.owner = identity.owner
        $0.repo = identity.repo
    }
}

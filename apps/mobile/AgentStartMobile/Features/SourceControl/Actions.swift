import Foundation

nonisolated enum SourceControlActionKind: String, Hashable, Sendable {
    case commit
    case commitPush = "commit-push"
    case commitSync = "commit-sync"
    case push
    case createReview = "create-pr"
    case pushAndCreateReview = "push-create-pr"
    case pull
    case sync
    case fetch
    case publish
    case fastForward = "fast-forward"
    case rebase
    case switchBranch = "checkout"
    case commits = "history"
}

nonisolated struct SourceControlAction: Identifiable, Hashable, Sendable {
    let kind: SourceControlActionKind
    let label: String
    let iconName: AgentStartIconID
    let isDisabled: Bool
    let hint: String?
    let isLoading: Bool

    var id: SourceControlActionKind { kind }
}

nonisolated enum SourceControlActions {
    static func build(
        snapshot: SourceStatusSnapshot?,
        commitMessage: String,
        busyAction: String?,
        isHostedReviewAvailable: Bool,
        hostedReviewProvider: HostedReviewProvider?
    ) -> [SourceControlAction] {
        let stagedCount = snapshot?.staged.count ?? 0
        let upstream = snapshot?.upstream
        let upstreamKnown = upstream != nil
        let hasUpstream = upstream?.hasUpstream == true
        let ahead = upstream?.ahead ?? 0
        let behind = upstream?.behind ?? 0
        let busy = busyAction != nil
        let commitHint =
            stagedCount == 0
            ? "Stage at least one file"
            : commitMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? "Enter a commit message"
                : nil
        let remoteHint =
            !upstreamKnown
            ? "Checking branch status..."
            : hasUpstream ? nil : "Publish Branch first"
        let reviewHint =
            !upstreamKnown
            ? "Checking branch status..."
            : isHostedReviewAvailable
                ? nil
                : "\(hostedReviewProvider?.reviewTitle ?? "Pull Request")s are not available for this repo"
        let shortReviewTitle = hostedReviewProvider?.shortReviewTitle ?? "PR"

        return [
            action(
                .commit,
                "Commit",
                .check,
                busy || commitHint != nil,
                commitHint,
                busyAction
            ),
            action(
                .commitPush,
                "Commit & Push",
                .arrowUp,
                busy || commitHint != nil || !upstreamKnown || !hasUpstream,
                commitHint ?? remoteHint,
                busyAction
            ),
            action(
                .commitSync,
                "Commit & Sync",
                .refresh,
                busy || commitHint != nil || !upstreamKnown || !hasUpstream || behind == 0,
                commitHint ?? ((!upstreamKnown || !hasUpstream) ? remoteHint : "Nothing to pull"),
                busyAction
            ),
            action(
                .push,
                ahead > 0 ? "Push (\(ahead))" : "Push",
                .arrowUp,
                busy || !upstreamKnown || !hasUpstream || ahead == 0,
                !hasUpstream ? remoteHint : ahead == 0 ? "Nothing to push" : nil,
                busyAction
            ),
            action(
                .createReview,
                "Create \(shortReviewTitle)",
                .gitPullRequest,
                busy || !isHostedReviewAvailable,
                reviewHint,
                busyAction
            ),
            action(
                .pushAndCreateReview,
                "Push & Create \(shortReviewTitle)",
                .gitPullRequest,
                busy || !upstreamKnown || !hasUpstream || ahead == 0
                    || !isHostedReviewAvailable,
                reviewHint ?? (!hasUpstream ? remoteHint : nil),
                busyAction
            ),
            action(
                .pull,
                behind > 0 ? "Pull (\(behind))" : "Pull",
                .arrowDown,
                busy || !upstreamKnown || !hasUpstream || behind == 0,
                !hasUpstream ? remoteHint : behind == 0 ? "Nothing to pull" : nil,
                busyAction
            ),
            action(
                .sync,
                ahead > 0 || behind > 0 ? "Sync (↓\(behind) ↑\(ahead))" : "Sync",
                .refresh,
                busy || !upstreamKnown || !hasUpstream || ahead == 0 && behind == 0,
                !upstreamKnown || !hasUpstream
                    ? remoteHint
                    : ahead == 0 && behind == 0 ? "Branch is up to date" : nil,
                busyAction
            ),
            action(.fetch, "Fetch", .refresh, busy, nil, busyAction),
            action(
                .publish,
                "Publish Branch",
                .upload,
                busy || !upstreamKnown || hasUpstream,
                !upstreamKnown
                    ? "Checking branch status..."
                    : hasUpstream ? "Branch is already published" : nil,
                busyAction
            ),
            action(
                .fastForward,
                behind > 0 ? "Fast-forward (\(behind))" : "Fast-forward",
                .download,
                busy || !upstreamKnown || !hasUpstream || behind == 0 || ahead > 0,
                !hasUpstream
                    ? remoteHint
                    : behind == 0
                        ? "Nothing to fast-forward"
                        : ahead > 0 ? "Local commits would be lost; pull instead" : nil,
                busyAction
            ),
            action(
                .rebase,
                "Rebase onto base",
                .gitBranch,
                busy,
                nil,
                busyAction
            ),
            action(
                .switchBranch,
                "Switch branch",
                .arrowRight,
                busy,
                nil,
                busyAction
            ),
            action(.commits, "Commits", .clock, busy, nil, busyAction),
        ]
    }

    private static func action(
        _ kind: SourceControlActionKind,
        _ label: String,
        _ iconName: AgentStartIconID,
        _ isDisabled: Bool,
        _ hint: String?,
        _ busyAction: String?
    ) -> SourceControlAction {
        SourceControlAction(
            kind: kind,
            label: label,
            iconName: iconName,
            isDisabled: isDisabled,
            hint: hint,
            isLoading: busyAction == kind.rawValue
        )
    }
}

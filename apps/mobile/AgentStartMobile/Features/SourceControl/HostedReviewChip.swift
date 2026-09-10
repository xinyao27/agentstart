import SwiftUI

// Glanceable pull request status shown on the branch card (Changes + Commits
// tabs). Four states — loading, none, unavailable, ready — built from the SAME
// HostedReviewModel that
// backs the Pull Request tab so the chip's rollup can never disagree with the
// checks list it links to.

nonisolated enum HostedReviewChipRollup: Hashable, Sendable {
    case conflict(String)
    case failing(String)
    case running(String)
    case passed(String)
    case none(String)

    var text: String {
        switch self {
        case .conflict(let text), .failing(let text), .running(let text), .passed(let text),
            .none(let text):
            text
        }
    }
}

nonisolated enum HostedReviewChipSummary: Hashable, Sendable {
    case loading
    case none
    case unavailable(String)
    case ready(
        number: Int,
        state: HostedReviewState,
        rollup: HostedReviewChipRollup,
        commentCount: Int?
    )
}

// Precedence: a merge conflict outranks every check outcome (checks may be green
// while the PR still can't merge), then failing > running > passed > no checks.
nonisolated func buildHostedReviewChipRollup(
    review: HostedReview,
    checks: [HostedReviewCheck]
) -> HostedReviewChipRollup {
    if review.mergeable == .conflicting {
        return .conflict(String(localized: "Conflicts"))
    }
    let failing = checks.filter { $0.outcome == .failure }.count
    if failing > 0 {
        return .failing("\(failing) failing")
    }
    let running = checks.filter { $0.outcome == .pending }.count
    if running > 0 {
        return .running("\(running) running")
    }
    let passed = checks.filter { $0.outcome == .success }.count
    if passed > 0 {
        return .passed("\(passed)/\(checks.count)")
    }
    return .none(String(localized: "No checks"))
}

nonisolated func buildHostedReviewChipSummary(
    phase: HostedReviewPhase,
    commentCount: Int?
) -> HostedReviewChipSummary {
    switch phase {
    case .loading, .waiting:
        .loading
    case .empty:
        .none
    case .failed(let message):
        .unavailable(message)
    case .ready(let review, _, let checks):
        .ready(
            number: review.number,
            state: review.state,
            rollup: buildHostedReviewChipRollup(review: review, checks: checks),
            // Unresolved-comment counting only applies to the GitHub-backed details
            // payload (ensureDetails() never populates it for other providers).
            commentCount: review.provider == .github ? commentCount : nil
        )
    }
}

// Unresolved review threads (the chip's "n" comment count). Counts each inline
// thread once by threadID when it is not resolved; top-level conversation
// comments (no threadID) are not review threads and don't count. nil while
// phase-2 details haven't loaded yet.
nonisolated func countHostedReviewUnresolvedComments(_ comments: [HostedReviewComment]?) -> Int? {
    guard let comments else { return nil }
    var unresolved = Set<String>()
    for comment in comments {
        if let threadID = comment.threadID, !comment.isResolved {
            unresolved.insert(threadID)
        }
    }
    return unresolved.count
}

struct HostedReviewChip: View {
    let summary: HostedReviewChipSummary
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: Theme.Spacing.small) {
                AgentStartIcon(.gitPullRequest, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
                    .frame(width: Theme.Spacing.large)
                content
                Spacer(minLength: Theme.Spacing.small)
                AgentStartIcon(.chevronRight, size: Theme.Control.inlineIcon)
                    .foregroundStyle(Theme.Colors.mutedForeground)
            }
            .frame(minHeight: Theme.Size.minimumHitTarget)
            .contentShape(.rect)
        }
        .buttonStyle(.appPlain)
        .accessibilityLabel(accessibilityLabel)
    }

    @ViewBuilder
    private var content: some View {
        switch summary {
        case .loading:
            ProgressView()
                .controlSize(.small)
            Text("Loading pull request…")
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineLimit(1)
        case .none:
            Text("Create pull request")
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.primary)
        case .unavailable(let message):
            Text(verbatim: message)
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.mutedForeground)
                .lineLimit(1)
        case .ready(let number, let state, let rollup, let commentCount):
            Text(verbatim: "#\(number)")
                .font(.system(size: Theme.Typography.supporting))
                .foregroundStyle(Theme.Colors.foreground)
            Text(state.title)
                .font(.system(size: Theme.Typography.metadata))
                .foregroundStyle(state.color)
                .padding(.horizontal, Theme.Spacing.small)
                .padding(.vertical, Theme.Spacing.extraSmall)
                .background(
                    state.color.opacity(Theme.Opacity.statusFill),
                    in: .rect(cornerRadius: Theme.Radius.control)
                )
            HStack(spacing: Theme.Spacing.extraSmall) {
                rollupIcon(rollup)
                Text(verbatim: rollup.text)
                    .font(.system(size: Theme.Typography.metadata))
            }
            .foregroundStyle(rollupColor(rollup))
            if let commentCount, commentCount > 0 {
                HStack(spacing: Theme.Spacing.extraSmall) {
                    AgentStartIcon(.chat, size: Theme.Typography.metadata)
                    Text(verbatim: "\(commentCount)")
                        .font(.system(size: Theme.Typography.metadata))
                }
                .foregroundStyle(Theme.Colors.mutedForeground)
            }
        }
    }

    @ViewBuilder
    private func rollupIcon(_ rollup: HostedReviewChipRollup) -> some View {
        switch rollup {
        case .conflict: AgentStartIcon(.warning, size: Theme.Typography.metadata)
        case .failing: AgentStartIcon(.x, size: Theme.Typography.metadata)
        case .running: AgentStartIcon(.circle, size: Theme.Typography.metadata)
        case .passed: AgentStartIcon(.check, size: Theme.Typography.metadata)
        case .none: EmptyView()
        }
    }

    private func rollupColor(_ rollup: HostedReviewChipRollup) -> Color {
        switch rollup {
        case .conflict, .running: Theme.Colors.unread
        case .failing: Theme.Colors.attention
        case .passed: Theme.Colors.success
        case .none: Theme.Colors.mutedForeground
        }
    }

    private var accessibilityLabel: String {
        switch summary {
        case .loading:
            String(localized: "Loading pull request")
        case .none:
            String(localized: "Create pull request")
        case .unavailable(let message):
            String(localized: "Pull request unavailable: \(message)")
        case .ready(let number, let state, let rollup, let commentCount):
            readyAccessibilityLabel(
                number: number,
                state: state,
                rollup: rollup,
                commentCount: commentCount
            )
        }
    }

    private func readyAccessibilityLabel(
        number: Int,
        state: HostedReviewState,
        rollup: HostedReviewChipRollup,
        commentCount: Int?
    ) -> String {
        let stateText = String(localized: state.title)
        let comments =
            (commentCount ?? 0) > 0
            ? String(localized: ", \(commentCount ?? 0) unresolved comments") : ""
        return String(
            localized:
                "Pull request #\(number), \(stateText), \(rollup.text)\(comments). Open pull request."
        )
    }
}

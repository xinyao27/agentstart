import Foundation
import Observation
import UIKit

nonisolated enum SourceControlPhase: Sendable {
    case loading
    case waiting
    case ready
    case failed(String)
}

nonisolated struct SourceControlUnavailableError: LocalizedError, Sendable {
    var errorDescription: String? { "Waiting for daemon…" }
}

@Observable
@MainActor
final class SourceControlModel {
    var phase = SourceControlPhase.loading
    var isConnected = false
    var snapshot: SourceStatusSnapshot?
    var isRefreshing = false
    var busyAction: String?
    var errorMessage: String?
    var baseRef: String?
    var branchComparison: SourceBranchComparison?
    var branchComparisonError: String?
    var isLoadingBranchComparison = false
    var localBranches: SourceLocalBranches?
    var isGeneratingCommitMessage = false
    var commitFailure: SourceCommitFailure?
    var commitFailureLaunchError: String?
    var reviewCreateProgress: SourceHostedReviewCreateProgress?
    var createdReviewURL: URL?
    var createdReviewWarning: String?
    var createdReviewProvider: HostedReviewProvider?
    var hostedReviewEligibility: HostedReviewEligibility?
    // Why: owned here (not inside HostedReviewView) so one instance persists across
    // Changes/Pull Request/Commits tab switches and can feed the branch-card chip
    // even while the Pull Request tab isn't the active segment. Lazily created on
    // the first successful status refresh (needs an initial SourceStatusSnapshot).
    var hostedReviewModel: HostedReviewModel?
    var commitMessage = ""
    // Why: refreshed on every (re)connect so a rename made elsewhere is reflected here,
    // unlike the WorkspaceSummary snapshot handed to this screen at navigation time
    // (see workspaceLabel).
    var liveWorktreeDisplayName: String?

    @ObservationIgnored let hostID: String
    @ObservationIgnored let workspace: WorkspaceSummary
    @ObservationIgnored let repository: any SourceControlRepository
    @ObservationIgnored let hostedReviewRepository: (any HostedReviewRepository)?
    @ObservationIgnored let connectionRuntime: any HostConnectionRuntime
    @ObservationIgnored var refreshRevision = 0
    // Why: `observe()`'s reconnect guard (`becameConnected || snapshot == nil`) has
    // no notion of "a fetch is already running" — a reconnect stream that emits
    // more than once while the first status fetch is still in flight (or slow)
    // would otherwise fire a second, third, ... overlapping refresh(), each
    // issuing its own git.status call with nothing to de-duplicate them. Gating
    // refresh(initial:) itself protects every caller — observe, load, retry, manual
    // refresh, pull-to-refresh — rather than one call site.
    @ObservationIgnored var isFetchInFlight = false
    // Why: paired with autoRefreshCooldownSeconds (ScreenModelRefresh.swift) —
    // set whenever a status fetch fails, cleared on success, so observe()'s
    // automatic reconnect-triggered retry backs off instead of hammering a
    // connection that a prior failure may itself have just destabilized.
    @ObservationIgnored var lastAutoRefreshFailureAt: Date?

    init(
        hostID: String,
        workspace: WorkspaceSummary,
        repository: any SourceControlRepository,
        hostedReviewRepository: (any HostedReviewRepository)?,
        connectionRuntime: any HostConnectionRuntime
    ) {
        self.hostID = hostID
        self.workspace = workspace
        self.repository = repository
        self.hostedReviewRepository = hostedReviewRepository
        self.connectionRuntime = connectionRuntime
    }

    var worktreeID: String { workspace.id }
    var repoID: String { workspace.repoID }

    // Why: prefer the live name over the WorkspaceSummary snapshot handed to this
    // screen at navigation time — see liveWorktreeDisplayName's doc comment.
    var workspaceLabel: String {
        if let liveWorktreeDisplayName, !liveWorktreeDisplayName.isEmpty {
            return liveWorktreeDisplayName
        }
        return workspace.name.isEmpty ? workspace.repoName : workspace.name
    }

    var sections: [SourceStatusSection] {
        snapshot.map(SourceStatusProjection.sections) ?? []
    }

    var actions: [SourceControlAction] {
        SourceControlActions.build(
            snapshot: snapshot,
            commitMessage: commitMessage,
            busyAction: busyAction,
            isHostedReviewAvailable: hostedReviewRepository != nil && snapshot?.upstream != nil,
            hostedReviewProvider: hostedReviewEligibility?.provider
        )
    }

    var hostedReviewEntry: SourceHostedReviewEntry? {
        guard
            snapshot?.branch != nil,
            let eligibility = hostedReviewEligibility,
            eligibility.provider.supportsCreation
        else { return nil }
        let label = "Create \(eligibility.provider.reviewTitle)"
        let isBusy = busyAction != nil
        if eligibility.canCreate || eligibility.blockedReason == .needsPush {
            return SourceHostedReviewEntry(
                label: label,
                isEnabled: !isBusy,
                hint: nil,
                isLoading: busyAction == "create-pr" || busyAction == "push-create-pr",
                action: eligibility.blockedReason == .needsPush
                    ? .pushAndCreateReview : .createReview
            )
        }
        switch eligibility.blockedReason {
        case .detachedHead, .existingReview, .unsupportedProvider, nil:
            return nil
        default:
            return SourceHostedReviewEntry(
                label: label,
                isEnabled: false,
                hint: eligibility.blockedReason.map(SourceHostedReviewCreator.blockMessage),
                isLoading: false,
                action: .createReview
            )
        }
    }

    // The chip hides unless the repo is hosted and a PR branch is known. There is no
    // separate fast "is this a GitHub repo" probe, so this reuses
    // hostedReviewEligibility.provider — already fetched on every status refresh for the
    // create-PR entry above — as the hosted-repo signal: `.unsupported` means no recognized
    // remote, so the chip stays hidden.
    var hostedReviewChipSummary: HostedReviewChipSummary? {
        guard
            snapshot?.branch != nil,
            let provider = hostedReviewEligibility?.provider,
            provider != .unsupported
        else { return nil }
        guard let hostedReviewModel else { return .loading }
        let commentCount = countHostedReviewUnresolvedComments(hostedReviewModel.details?.comments)
        return buildHostedReviewChipSummary(
            phase: hostedReviewModel.phase,
            commentCount: commentCount
        )
    }

    var primaryAction: SourcePrimaryAction {
        guard let snapshot else { return .current }
        if snapshot.unresolvedCount > 0 { return .commit(enabled: false) }
        if !snapshot.staged.isEmpty {
            return .commit(
                enabled: !commitMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    && snapshot.unresolvedCount == 0
            )
        }
        if !snapshot.stageable.isEmpty { return .stageAll }
        guard let upstream = snapshot.upstream else { return .commit(enabled: false) }
        if !upstream.hasUpstream, snapshot.branch != nil { return .publish }
        if upstream.ahead > 0, upstream.behind > 0 {
            return upstream.behindCommitsArePatchEquivalent
                ? .push(forceWithLease: true)
                : .sync
        }
        if upstream.behind > 0 { return .pull }
        if upstream.ahead > 0 { return .push(forceWithLease: false) }
        return .current
    }

}

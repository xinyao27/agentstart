import Foundation

private let sourceStatusRetryCount = 3
private let sourceStatusRetryDelayMilliseconds = 250
// Why: observe()'s reconnect guard fires on every `becameConnected` transition
// (needed so a real reconnect retries a load that never succeeded). Measured
// live: a status fetch that keeps failing can itself keep the connection from
// settling — each attempt's failure/timeout raced the
// session into treating it as a transport failure and reconnecting, which
// immediately re-armed `becameConnected` and fired another doomed attempt.
// Confirmed by instrumentation: ONE model instance, 4,450+ becameConnected
// transitions, 8,000+ resulting refresh() calls, snapshot never once set —
// a self-sustaining request/reconnect storm, not per-render model churn.
// Cap how often the *automatic* (reconnect-driven) path may retry; user
// actions (retry(), the toolbar refresh, pull-to-refresh) are never gated by
// this, only observe()'s own auto-retrigger.
private let autoRefreshCooldownSeconds: TimeInterval = 5

extension SourceControlModel {
    func load() async {
        guard isConnected else {
            if snapshot == nil { phase = .waiting }
            return
        }
        await refresh(initial: snapshot == nil)
    }

    func observe() async {
        let updates = await connectionRuntime.connectionSnapshots(forHostIDs: [hostID])
        for await update in updates {
            guard !Task.isCancelled else { return }
            let connected = update[hostID]?.phase == .connected
            let becameConnected = connected && !isConnected
            isConnected = connected
            if !connected {
                if snapshot == nil { phase = .waiting }
                continue
            }
            guard becameConnected || snapshot == nil else { continue }
            // Why: see autoRefreshCooldownSeconds' doc comment above — without
            // this, a status fetch that never succeeds retries on every single
            // reconnect-stream emission, and if failures themselves provoke more
            // reconnects, the loop feeds itself indefinitely with no backoff.
            if let lastAutoRefreshFailureAt,
                Date().timeIntervalSince(lastAutoRefreshFailureAt) < autoRefreshCooldownSeconds
            {
                continue
            }
            await refresh(initial: snapshot == nil)
        }
    }

    func retry() async {
        guard !isConnected else {
            await refresh(initial: snapshot == nil)
            return
        }
        await connectionRuntime.reconnect(hostID: hostID)
    }

    func refresh() async {
        await refresh(initial: false)
    }

    func refresh(initial: Bool) async {
        guard isConnected else {
            if snapshot == nil { phase = .waiting }
            return
        }
        // Why: see isFetchInFlight's doc comment (ScreenModel.swift) — without
        // this, a reconnect stream (or any other caller) firing while a fetch is
        // already running stacks another full status/eligibility/branch-compare
        // cycle on top of it instead of waiting for the one in flight to finish.
        guard !isFetchInFlight else { return }
        isFetchInFlight = true
        defer { isFetchInFlight = false }
        refreshRevision += 1
        let revision = refreshRevision
        if initial { phase = .loading } else { isRefreshing = true }
        // Why: independent of the status fetch below — a slow/failed status retry
        // must not hold up the header catching a rename made elsewhere, so the live name
        // refresh is its own request rather than part of git.status.
        Task {
            guard
                let name = await repository.liveWorktreeDisplayName(
                    for: hostID,
                    worktreeID: worktreeID
                )
            else { return }
            guard refreshRevision == revision, !Task.isCancelled else { return }
            liveWorktreeDisplayName = name
        }
        do {
            let next = try await sourceStatusWithTransientRetry()
            guard refreshRevision == revision, !Task.isCancelled else { return }
            snapshot = next
            phase = .ready
            // Why: clear the action error once the authoritative status request succeeds.
            // Keeping the old alert makes a recovered source-control screen look failed until
            // the user dismisses it by hand.
            errorMessage = nil
            isRefreshing = false
            lastAutoRefreshFailureAt = nil
            // Why: eligibility must resolve first — syncHostedReviewSummary gates on
            // it as the "is this a hosted repo" signal (see its own doc comment).
            await refreshHostedReviewEligibility(next, revision: revision)
            syncHostedReviewSummary(next)
            await refreshBranchComparison(revision: revision)
        } catch is CancellationError {
            if refreshRevision == revision {
                isRefreshing = false
            }
            return
        } catch {
            guard refreshRevision == revision else { return }
            isRefreshing = false
            lastAutoRefreshFailureAt = Date()
            if snapshot == nil {
                phase = .failed(error.localizedDescription)
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func sourceStatusWithTransientRetry() async throws -> SourceStatusSnapshot {
        var lastError: Error?
        // Why: a mutating Desktop operation gets three recovery retries after the initial
        // status request — four attempts total, with a delay — so a brief
        // selector/request-aborted race does not flash a Source Control failure that is
        // already resolved.
        for attempt in 0...sourceStatusRetryCount {
            do {
                return try await repository.sourceStatus(
                    for: hostID,
                    worktreeID: worktreeID
                )
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                lastError = error
                guard attempt < sourceStatusRetryCount,
                    isTransientSourceRefreshError(error)
                else { throw error }
                try await Task.sleep(for: .milliseconds(sourceStatusRetryDelayMilliseconds))
            }
        }
        throw lastError ?? SourceControlUnavailableError()
    }

    func resolveBaseRef() async throws -> String {
        guard isConnected else { throw SourceControlUnavailableError() }
        if let baseRef, !baseRef.isEmpty { return baseRef }
        let resolved = try await repository.sourceDefaultBaseRef(
            for: hostID,
            worktreeID: worktreeID,
            repoID: repoID
        )
        baseRef = resolved
        return resolved
    }

    func refreshBranchComparison(revision: Int? = nil) async {
        let revision = revision ?? refreshRevision
        guard isConnected else {
            isLoadingBranchComparison = false
            return
        }
        isLoadingBranchComparison = true
        branchComparisonError = nil
        do {
            let resolvedBaseRef = try await resolveBaseRef()
            guard refreshRevision == revision, !Task.isCancelled else { return }
            branchComparison = try await repository.sourceBranchCompare(
                for: hostID,
                worktreeID: worktreeID,
                baseRef: resolvedBaseRef
            )
            guard refreshRevision == revision, !Task.isCancelled else { return }
            branchComparisonError = nil
        } catch is CancellationError {
            guard refreshRevision == revision else { return }
            isLoadingBranchComparison = false
            return
        } catch {
            guard refreshRevision == revision else { return }
            if branchComparison == nil {
                branchComparisonError = SourceBranchComparisonMessage.describe(error)
            }
        }
        guard refreshRevision == revision else { return }
        isLoadingBranchComparison = false
    }

    // Lazily creates the shared HostedReviewModel on the first ready status, then
    // keeps it fed with phase-1 (review + checks) refreshes on every subsequent
    // status refresh — whichever hub tab is active. Phase 2 (comments/body) is
    // driven separately, only while the Pull Request tab is actually open (see
    // HostedReviewView's own `.task { await model.ensureDetails() }`).
    //
    // Must not fire until a hosted-review call is actually meaningful: a resolved
    // branch (not the "No branch" detached-HEAD fallback label) on a repo already
    // confirmed hosted (hostedReviewEligibility resolved and is not
    // `.unsupported`) — the same two conditions hostedReviewChipSummary itself
    // gates on: a PR branch and a hosted repo must both be known before the sidebar is
    // ever fetched. Calling
    // this before eligibility resolved raced the desktop's own repo/session
    // bootstrap right after connecting and came back as an undecodable response.
    func syncHostedReviewSummary(_ status: SourceStatusSnapshot) {
        guard let hostedReviewRepository else { return }
        guard status.branch != nil else { return }
        guard let provider = hostedReviewEligibility?.provider, provider != .unsupported else {
            return
        }
        let reviewModel: HostedReviewModel
        if let existing = hostedReviewModel {
            reviewModel = existing
        } else {
            reviewModel = HostedReviewModel(
                hostID: hostID,
                workspace: workspace,
                status: status,
                repository: hostedReviewRepository,
                sourceRepository: repository,
                connectionRuntime: connectionRuntime
            )
            hostedReviewModel = reviewModel
            // Why: starts the model's own reconnect listener once, here, rather
            // than relying solely on HostedReviewView's `.task { await
            // model.observe() }` — that only runs while the Pull Request tab is
            // mounted, which would leave the branch-card chip unable to retry
            // phase 1 after a transient disconnect while sitting on Changes/Commits.
            Task { await reviewModel.observe() }
        }
        reviewModel.isConnected = isConnected
        Task { await reviewModel.synchronizeSummary(status) }
    }

    func refreshHostedReviewEligibility(_ status: SourceStatusSnapshot, revision: Int? = nil) async
    {
        let revision = revision ?? refreshRevision
        guard isConnected else {
            if refreshRevision == revision { hostedReviewEligibility = nil }
            return
        }
        guard let hostedReviewRepository else {
            if refreshRevision == revision { hostedReviewEligibility = nil }
            return
        }
        let eligibility = try? await hostedReviewRepository.hostedReviewEligibility(
            for: hostID,
            workspace: workspace,
            status: status
        )
        guard refreshRevision == revision, !Task.isCancelled else { return }
        hostedReviewEligibility = eligibility
    }
}

nonisolated private func isTransientSourceRefreshError(_ error: Error) -> Bool {
    let code = (error as? RuntimeServiceError)?.serverCode?.lowercased()
    let message = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
    return code == "selector_not_found"
        || code == "request_aborted"
        || message == "selector_not_found"
        || message == "request_aborted"
        || message == "aborting"
}

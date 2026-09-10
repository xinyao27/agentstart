import Observation

// Load/refresh side of HostedReviewModel, split out of HostedReviewModel.swift
// (which owns state + mutations) to keep each file at one responsibility.
extension HostedReviewModel {
    func synchronize(_ nextStatus: SourceStatusSnapshot) async {
        let changed = identityChanged(for: nextStatus)
        status = nextStatus
        if changed || review == nil { await load() }
    }

    // Phase-1-only counterpart of synchronize(_:), used by the Source Control
    // screen model to keep the branch-card chip current on every git.status
    // refresh without pulling the heavy comments/body payload (that stays gated
    // behind ensureDetails(), fired only once the Pull Request tab is open).
    func synchronizeSummary(_ nextStatus: SourceStatusSnapshot) async {
        let changed = identityChanged(for: nextStatus)
        status = nextStatus
        if changed || review == nil { await loadSummary() }
    }

    func identityChanged(for nextStatus: SourceStatusSnapshot) -> Bool {
        status.branchLabel != nextStatus.branchLabel || status.head != nextStatus.head
    }

    // Why: guarded so a caller can safely (re-)request observation without
    // spawning a second concurrent reconnect loop — the model is now owned by
    // SourceControlModel (ScreenModelRefresh.swift starts this once, at
    // creation) and no longer solely by HostedReviewView's own `.task`, since a
    // reconnect must retry phase 1 for the branch-card chip even while the Pull
    // Request tab isn't mounted to run its own `.task { await model.observe() }`.
    func observe() async {
        guard !isObserving else { return }
        isObserving = true
        let updates = await connectionRuntime.connectionSnapshots(forHostIDs: [hostID])
        for await update in updates {
            guard !Task.isCancelled else { break }
            let connected = update[hostID]?.phase == .connected
            let becameConnected = connected && !isConnected
            isConnected = connected
            if !connected {
                if review == nil { phase = .waiting }
                continue
            }
            guard becameConnected || review == nil else { continue }
            await load()
        }
        isObserving = false
    }

    // Full load: phase 1 (review + checks) followed by phase 2 (details/comments).
    // Used for the Pull Request tab's own open/retry/pull-to-refresh — it wants the
    // whole payload right away. The branch-card chip drives loadSummary() alone.
    func load() async {
        await loadSummary()
        await ensureDetails()
    }

    // Phase 1: review + checks only (fast, no comments/body). Cheap enough to run
    // whenever Changes/Commits is open so the chip stays current. Preserves an
    // already-loaded details payload across a refresh of the SAME PR so a chip-only
    // reload never blanks the Pull Request tab's comment tree mid-view.
    func loadSummary() async {
        guard isConnected else {
            if review == nil { phase = .waiting }
            return
        }
        loadRevision += 1
        let revision = loadRevision
        let priorReview = review
        let priorDetails = details
        if priorReview == nil { phase = .loading }
        do {
            guard
                let fetchedReview = try await repository.hostedReview(
                    for: hostID,
                    workspace: workspace,
                    status: status,
                    linkedProvider: linkedProvider,
                    linkedNumber: linkedNumber
                )
            else {
                let eligibility = try await repository.hostedReviewEligibility(
                    for: hostID,
                    workspace: workspace,
                    status: status
                )
                guard revision == loadRevision, !Task.isCancelled else { return }
                phase = .empty(eligibility)
                return
            }
            let keptDetails = priorReview?.number == fetchedReview.number ? priorDetails : nil
            let checks = try await repository.hostedReviewChecks(
                for: hostID,
                workspace: workspace,
                review: fetchedReview,
                details: keptDetails
            )
            guard revision == loadRevision, !Task.isCancelled else { return }
            phase = .ready(fetchedReview, keptDetails, checks)
        } catch is CancellationError {
            return
        } catch {
            guard revision == loadRevision else { return }
            phase = .failed(error.localizedDescription)
        }
    }

    // Phase 2: fetch the heavy comments/body payload, only when a ready PR is
    // missing it. GitHub-only — hostedReviewDetails always returns nil for other
    // providers by design (HostedReviewReadyContent never reads `details` for
    // those), so retrying there would just repeat a no-op forever.
    func ensureDetails() async {
        guard case .ready(let currentReview, let currentDetails, _) = phase,
            currentReview.provider == .github,
            currentDetails == nil
        else { return }
        detailsRevision += 1
        let revision = detailsRevision
        let summaryRevision = loadRevision
        do {
            let fetched = try await repository.hostedReviewDetails(
                for: hostID,
                workspace: workspace,
                review: currentReview
            )
            guard
                revision == detailsRevision,
                summaryRevision == loadRevision,
                !Task.isCancelled,
                case .ready(let latestReview, _, let latestChecks) = phase,
                latestReview.number == currentReview.number
            else { return }
            phase = .ready(latestReview, fetched, latestChecks)
        } catch {
            // Non-fatal (KTD7 parity): leave details nil so the Pull Request tab's
            // Description/Comments keep their loading affordance instead of the PR
            // itself erroring out; the tab reopening or a pull-to-refresh retries.
        }
    }
}

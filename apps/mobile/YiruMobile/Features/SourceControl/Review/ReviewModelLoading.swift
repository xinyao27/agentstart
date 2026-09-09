import UIKit

@MainActor
extension SourceReviewModel {
    func load() async {
        guard isConnected else {
            if snapshot == nil { phase = .waiting }
            return
        }
        loadRevision += 1
        let revision = loadRevision
        let selectedID = currentItem?.id
        if snapshot == nil { phase = .loading }
        branchComparisonError = nil
        // Why: independent of the status fetch below — a slow/failed live-name RPC must
        // not hold up the header, and failure keeps the last-known-good name in place
        // (mirrors SourceControlModel's ScreenModelRefresh.swift).
        Task {
            guard
                let name = await sourceRepository.liveWorktreeDisplayName(
                    for: hostID,
                    worktreeID: worktreeID
                )
            else { return }
            guard revision == loadRevision, !Task.isCancelled else { return }
            liveWorktreeDisplayName = name
        }
        do {
            let status = try await sourceRepository.sourceStatus(
                for: hostID,
                worktreeID: worktreeID
            )
            guard revision == loadRevision, !Task.isCancelled else { return }
            var metadata = SourceReviewMetadata(comments: [], state: .empty)
            applySnapshot(status: status, branch: nil, metadata: metadata)
            phase = .ready
            restorePosition(selectedID: selectedID)
            await loadCurrentDiff()

            // Why: Desktop metadata can be slow while it reads a large worktree. The
            // source status is still enough to render and operate the review screen, so
            // comments and review marks arrive as a follow-up without blocking changes.
            do {
                metadata = try await reviewRepository.sourceReviewMetadata(
                    for: hostID,
                    worktreeID: worktreeID
                )
                guard revision == loadRevision, !Task.isCancelled else { return }
                applySnapshot(status: status, branch: nil, metadata: metadata)
                restorePosition(selectedID: selectedID)
                await loadCurrentDiff()
            } catch is CancellationError {
                return
            } catch {
                guard revision == loadRevision else { return }
            }

            await loadBranchComparison(status: status, metadata: metadata, revision: revision)
        } catch is CancellationError {
            return
        } catch {
            guard revision == loadRevision else { return }
            phase = .failed(reviewLoadFailureMessage(error))
        }
    }

    // Why: an older Desktop rejects git.status for mobile clients entirely, and the raw
    // transport error tells the user nothing they can act on. Detect that case and name the
    // fix instead of surfacing a bare RPC code.
    private func reviewLoadFailureMessage(_ error: any Error) -> String {
        guard let serviceError = error as? RuntimeServiceError else {
            return error.localizedDescription
        }
        let outdatedHost =
            serviceError.serverCode == "forbidden"
            || serviceError.serverCode == "method_not_found"
            || serviceError.serverMessage?.localizedCaseInsensitiveContains(
                "not available to mobile")
                == true
        return outdatedHost
            ? String(localized: "Update the Yiru daemon to review changes on mobile.")
            : error.localizedDescription
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
            await load()
        }
    }

    func refresh() async { await load() }

    private func loadBranchComparison(
        status: SourceStatusSnapshot,
        metadata: SourceReviewMetadata,
        revision: Int
    ) async {
        do {
            let baseRef = try await sourceRepository.sourceDefaultBaseRef(
                for: hostID,
                worktreeID: worktreeID,
                repoID: repoID
            )
            let branch = try await sourceRepository.sourceBranchCompare(
                for: hostID,
                worktreeID: worktreeID,
                baseRef: baseRef
            )
            guard revision == loadRevision, !Task.isCancelled else { return }
            branchComparisonError = nil
            let selectedID = currentItem?.id
            applySnapshot(status: status, branch: branch, metadata: metadata)
            restorePosition(selectedID: selectedID)
            await loadCurrentDiff()
        } catch is CancellationError {
            return
        } catch {
            guard revision == loadRevision else { return }
            branchComparisonError = SourceBranchComparisonMessage.describe(error)
        }
    }

    private func applySnapshot(
        status: SourceStatusSnapshot,
        branch: SourceBranchComparison?,
        metadata: SourceReviewMetadata
    ) {
        let rawItems = SourceReviewProjection.items(
            worktreeID: worktreeID,
            status: status,
            branch: branch,
            comments: metadata.comments,
            state: metadata.state
        )
        let state = SourceReviewProjection.mergedState(
            metadata.state,
            items: rawItems,
            now: nowMilliseconds
        )
        let items = SourceReviewProjection.items(
            worktreeID: worktreeID,
            status: status,
            branch: branch,
            comments: metadata.comments,
            state: state
        )
        snapshot = SourceReviewSnapshot(
            status: status,
            branchComparison: branch,
            comments: metadata.comments,
            reviewState: state,
            items: items
        )
    }

    func selectFilter(_ value: SourceReviewFilter) async {
        filter = value
        currentIndex = 0
        await loadCurrentDiff()
    }

    func move(_ direction: Int) async {
        guard !visibleItems.isEmpty else { return }
        let count = visibleItems.count
        currentIndex = (currentIndex + direction + count) % count
        UISelectionFeedbackGenerator().selectionChanged()
        await loadCurrentDiff()
    }

    func loadCurrentDiff() async {
        guard isConnected else { return }
        diffRevision += 1
        let revision = diffRevision
        guard let item = currentItem, let snapshot else {
            diffPhase = .idle
            return
        }
        diffPhase = .loading(item.id)
        do {
            let diff = try await reviewRepository.sourceReviewDiff(
                for: hostID,
                worktreeID: worktreeID,
                item: item,
                branchComparison: snapshot.branchComparison
            )
            guard revision == diffRevision, currentItem?.id == item.id else { return }
            diffPhase = .ready(item.id, diff)
        } catch is CancellationError {
            return
        } catch {
            guard revision == diffRevision else { return }
            diffPhase = .failed(item.id, error.localizedDescription)
        }
    }
}

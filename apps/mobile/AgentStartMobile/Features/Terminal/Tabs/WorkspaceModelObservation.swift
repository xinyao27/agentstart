import Foundation

@MainActor
extension TerminalWorkspaceModel {
    func observe() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.consumeConnectionSnapshots() }
            group.addTask { await self.observeTabs() }
            group.addTask { await self.pollTabs() }
            group.addTask { await self.observeDisplayName() }
            await group.waitForAll()
        }
    }

    func consumeConnectionSnapshots() async {
        let updates = await connectionRuntime.connectionSnapshots(forHostIDs: [hostID])
        for await snapshots in updates {
            guard !Task.isCancelled else { return }
            let wasConnected = isConnected
            isConnected = snapshots[hostID]?.phase == .connected
            guard isConnected, !wasConnected else { continue }
            if hasReceivedInitialSnapshot {
                await refresh(shouldReplaceFailure: false)
            } else {
                await loadInitialSnapshot()
            }
            await refreshDisplayName()
        }
    }

    func observeTabs() async {
        while !Task.isCancelled {
            guard isConnected else {
                do {
                    try await Task.sleep(for: .seconds(2))
                } catch {
                    return
                }
                continue
            }
            do {
                let updates = try await repository.workspaceTabUpdates(
                    for: hostID,
                    worktreeID: worktreeID
                )
                for try await snapshot in updates {
                    let shouldCreateInitialTerminal = apply(snapshot)
                    if shouldCreateInitialTerminal {
                        await createTerminal()
                    } else {
                        await activatePendingSelectionIfNeeded()
                    }
                }
            } catch is CancellationError {
                return
            } catch {
                await refresh(shouldReplaceFailure: false)
            }
            do {
                try await Task.sleep(for: .seconds(2))
            } catch {
                return
            }
        }
    }

    func pollTabs() async {
        // Why: the host can recover a terminal handle without advancing an already-published
        // tab snapshot, so pending tabs need this fallback to become usable again.
        while !Task.isCancelled {
            do {
                try await Task.sleep(for: .seconds(2))
            } catch {
                return
            }
            guard isConnected else { continue }
            // Why: the subscription is authoritative in steady state. Polling exists only to
            // recover host-side handles for pending tabs, so healthy workspaces should issue no
            // fallback RPCs while the stream is live.
            guard tabs.contains(where: \.isPendingTerminal) || pendingActiveTabID != nil else {
                continue
            }
            await refresh(shouldReplaceFailure: false)
            await activatePendingSelectionIfNeeded()
        }
    }

    func observeDisplayName() async {
        while !Task.isCancelled {
            guard isConnected else {
                do {
                    try await Task.sleep(for: .seconds(2))
                } catch {
                    return
                }
                continue
            }
            do {
                let invalidations = try await repository.workspaceInvalidations(for: hostID)
                invalidationStream: for try await invalidation in invalidations {
                    switch invalidation {
                    case .ready:
                        continue
                    case .repositoriesChanged:
                        await refreshDisplayName()
                    case .worktreesChanged(let changedRepoID):
                        if changedRepoID == repoID { await refreshDisplayName() }
                    case .end:
                        // Why: treat an ended invalidation stream as lost and resubscribe
                        // immediately; consuming past end leaves the workspace display name
                        // stale after Desktop recovery.
                        break invalidationStream
                    }
                }
            } catch is CancellationError {
                return
            } catch {
                await refreshDisplayName()
            }
            do {
                try await Task.sleep(for: .seconds(3))
            } catch {
                return
            }
        }
    }

    func refreshDisplayName() async {
        guard isConnected else { return }
        guard
            let name = try? await repository.workspaceDisplayName(
                for: hostID,
                worktreeID: worktreeID
            ), !name.isEmpty
        else { return }
        displayName = name
    }

    func reconnectAndLoad() async {
        phase = .loading
        await repository.reconnectWorkspaceHost(hostID: hostID)
        await refresh(shouldReplaceFailure: true)
    }

    func refreshTabs() async {
        await refresh(shouldReplaceFailure: false)
    }

    func refresh(shouldReplaceFailure: Bool) async {
        guard isConnected else { return }
        do {
            let snapshot = try await repository.workspaceTabs(
                for: hostID,
                worktreeID: worktreeID
            )
            guard !Task.isCancelled else { return }
            apply(snapshot)
        } catch is CancellationError {
            return
        } catch TerminalWorkspaceRepositoryError.timeout {
            if shouldReplaceFailure {
                phase = .failed("The host did not respond. Check its connection and try again.")
            }
        } catch {
            if shouldReplaceFailure {
                phase = .failed("AgentStart could not load this workspace session.")
            }
        }
    }
}

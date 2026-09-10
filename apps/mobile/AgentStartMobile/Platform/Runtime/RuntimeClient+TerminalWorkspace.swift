import Foundation

extension RuntimeClient: TerminalWorkspaceRepository {
    func workspaceTabs(for hostID: String, worktreeID: String) async throws
        -> TerminalWorkspaceSnapshot
    {
        try await withThrowingTaskGroup(of: TerminalWorkspaceSnapshot.self) { group in
            group.addTask {
                try await self.fetchWorkspaceTabs(for: hostID, worktreeID: worktreeID)
            }
            group.addTask {
                try await Task.sleep(for: self.timeout)
                throw TerminalWorkspaceRepositoryError.timeout
            }
            guard let snapshot = try await group.next() else { throw CancellationError() }
            group.cancelAll()
            return snapshot
        }
    }

    func workspaceTabUpdates(for hostID: String, worktreeID: String) async throws
        -> AsyncThrowingStream<TerminalWorkspaceSnapshot, Error>
    {
        let source = try await sessionTabsEventUpdates(
            hostID: hostID,
            worktreeSelector: worktreeSelector(worktreeID)
        )
        let (stream, continuation) = AsyncThrowingStream.makeStream(
            of: TerminalWorkspaceSnapshot.self
        )
        let forwardingTask = Task {
            do {
                for try await event in source {
                    switch event {
                    case .snapshot(let wire), .updated(let wire):
                        continuation.yield(
                            await mapWorkspaceSnapshot(
                                wire,
                                hostID: hostID,
                                worktreeID: worktreeID
                            )
                        )
                    case .end:
                        continuation.finish()
                        return
                    }
                }
                continuation.finish()
            } catch is CancellationError {
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
        }
        continuation.onTermination = { _ in forwardingTask.cancel() }
        return stream
    }

    func workspaceDisplayName(for hostID: String, worktreeID: String) async throws -> String? {
        try await workspaces(for: hostID).workspaces.first { $0.id == worktreeID }?.name
    }

    func workspaceInvalidations(for hostID: String) async throws
        -> AsyncThrowingStream<TerminalWorkspaceInvalidation, Error>
    {
        let source = try await protocolClientEvents(hostID: hostID)
        let (stream, continuation) = AsyncThrowingStream.makeStream(
            of: TerminalWorkspaceInvalidation.self
        )
        let forwardingTask = Task {
            var subscriptionID: String?
            do {
                for try await event in source {
                    switch event.event {
                    case .ready(let ready):
                        subscriptionID = ready.subscriptionID
                        continuation.yield(.ready)
                    case .reposChanged:
                        continuation.yield(.repositoriesChanged)
                    case .worktreesChanged(let changed):
                        continuation.yield(.worktreesChanged(repoID: changed.repoID))
                    case .activateWorktree, .worktreeHeadIdentitiesChanged, nil:
                        continue
                    case .end:
                        continuation.yield(.end)
                        continuation.finish()
                        return
                    }
                }
                continuation.finish()
            } catch is CancellationError {
                continuation.finish()
            } catch {
                continuation.finish(throwing: error)
            }
            // Why: the stream ended without the daemon's end event (consumer stop or
            // transport loss), so tear the subscription down out of band — the keyed
            // Unsubscribe unary carries the ready envelope's id, then the source
            // cancel drops the flow-controlled call; after a daemon end event both
            // are already no-ops.
            Task {
                if let subscriptionID {
                    _ = try? await self.protocolClientEventsUnsubscribe(
                        hostID: hostID,
                        subscriptionID: subscriptionID
                    )
                }
                try? await source.cancel()
            }
        }
        continuation.onTermination = { _ in forwardingTask.cancel() }
        return stream
    }

    func activateWorkspaceTab(
        for hostID: String,
        worktreeID: String,
        tabID: String,
        leafID: String?
    ) async throws -> TerminalWorkspaceSnapshot {
        let wire: MobileSessionTabsWire = try await sessionTabsActivate(
            hostID: hostID,
            worktreeSelector: worktreeSelector(worktreeID),
            tabID: tabID,
            leafID: leafID,
            notifyClients: false
        )
        return await mapWorkspaceSnapshot(wire, hostID: hostID, worktreeID: worktreeID)
    }

    func createWorkspaceTerminal(
        for hostID: String,
        worktreeID: String,
        afterTabID: String?,
        agentID: String?
    ) async throws -> TerminalWorkspaceSnapshot {
        let current = try await fetchWorkspaceTabs(for: hostID, worktreeID: worktreeID)
        let created: MobileSessionCreateTerminalResultWire = try await sessionTabsCreateTerminal(
            hostID: hostID,
            request: MobileSessionCreateTerminalRequestWire(
                worktree: worktreeSelector(worktreeID),
                afterTabId: afterTabID,
                activate: true,
                clientMutationId: UUID().uuidString.lowercased(),
                agent: agentID,
                command: nil,
                env: nil,
                envToDelete: nil,
                launchConfig: nil,
                launchAgent: nil,
                startupCommandDelivery: nil,
                agentPrompt: nil
            )
        )
        let createdSnapshot = workspaceSnapshotAfterCreatingTerminal(
            current: current,
            created: created,
            worktreeID: worktreeID,
            afterTabID: afterTabID
        )
        guard let createdTab = createdSnapshot.tabs.first(where: { $0.id == created.tab.id }) else {
            return createdSnapshot
        }
        do {
            let activated = try await activateWorkspaceTab(
                for: hostID,
                worktreeID: worktreeID,
                tabID: createdTab.id,
                leafID: createdTab.leafID
            )
            // Why: the activation RPC can race the publication that adds the new tab. Do not
            // replace the authoritative create response with a stale snapshot that hides it.
            guard
                activated.tabs.contains(where: { $0.id == createdTab.id }),
                activated.activeTabID == createdTab.id
            else { return createdSnapshot }
            return activated
        } catch {
            // Why: creation already succeeded; keep the new tab locally selected if the
            // follow-up mobile-only activation response is lost instead of spawning a duplicate.
            return createdSnapshot
        }
    }

    func createWorkspaceBrowser(
        for hostID: String,
        worktreeID: String,
        url: String
    ) async throws -> TerminalWorkspaceSnapshot {
        let browserPageID = try await browserTabCreate(
            hostID: hostID,
            worktreeID: worktreeID,
            url: url
        )
        var latestSnapshot: TerminalWorkspaceSnapshot?
        for delay in [100, 300, 800, 1_200] {
            try await Task.sleep(for: .milliseconds(delay))
            let snapshot = try await fetchWorkspaceTabs(for: hostID, worktreeID: worktreeID)
            latestSnapshot = snapshot
            if snapshot.tabs.contains(where: { tab in
                guard case .browser(let browser) = tab.content else { return false }
                return browser.pageID == browserPageID
            }) {
                return snapshot
            }
        }
        // Why: Desktop publishes the tab before its browser page registration settles. Return
        // after tabCreate and let the normal tab subscription/poll promote the pending tab —
        // treating that short registration window as a mutation failure reports a successful
        // tab creation as an error and hides the recoverable pending surface.
        if let latestSnapshot { return latestSnapshot }
        throw TerminalWorkspaceRepositoryError.rejectedMutation
    }

    func closeWorkspaceTab(
        for hostID: String,
        worktreeID: String,
        tabID: String,
        leafID: String?
    ) async throws -> TerminalWorkspaceSnapshot {
        let closed = try await sessionTabsClose(
            hostID: hostID,
            worktreeSelector: worktreeSelector(worktreeID),
            tabID: tabID
        )
        guard closed else { throw TerminalWorkspaceRepositoryError.rejectedMutation }
        return try await fetchWorkspaceTabs(for: hostID, worktreeID: worktreeID)
    }

    func reconnectWorkspaceHost(hostID: String) async {
        await reconnect(hostID: hostID)
    }
}

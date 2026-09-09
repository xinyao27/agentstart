import Foundation

@MainActor
extension TerminalWorkspaceModel {
    func select(_ tab: TerminalWorkspaceTab) async {
        guard isConnected, tab.id != activeTabID, operation == nil else { return }
        cancelActivation()
        activeTabID = tab.id
        pendingActiveTabID = tab.id
        retainIfNeeded(tab)
        // Why: establish the PTY viewer before persisting selection so input has a live target.
        if tab.terminalTarget != nil { return }
        await activateSelection(tab)
    }

    func activateReadyTerminal(_ tabID: String) async {
        guard isConnected,
            operation == nil,
            pendingActiveTabID == tabID,
            activeTabID == tabID,
            let tab = tabs.first(where: { $0.id == tabID }),
            tab.terminalTarget != nil
        else { return }
        await activateSelection(tab)
    }

    func activateSelection(
        _ tab: TerminalWorkspaceTab,
        reportsFailure: Bool = true
    ) async {
        guard isConnected else { return }
        activationGeneration += 1
        let requestGeneration = activationGeneration
        activatingTabID = tab.id
        defer {
            if activationGeneration == requestGeneration {
                activatingTabID = nil
            }
        }
        mutationError = nil
        do {
            let snapshot = try await repository.activateWorkspaceTab(
                for: hostID,
                worktreeID: worktreeID,
                tabID: tab.id,
                leafID: tab.leafID
            )
            guard activationGeneration == requestGeneration else { return }
            apply(snapshot)
        } catch is CancellationError {
            return
        } catch {
            guard activationGeneration == requestGeneration else { return }
            await refresh(shouldReplaceFailure: false)
            guard reportsFailure else { return }
            pendingActiveTabID = nil
            mutationError = "Yiru could not activate this tab."
        }
    }

    func activatePendingSelectionIfNeeded() async {
        guard isConnected,
            operation == nil,
            activatingTabID == nil,
            let pendingActiveTabID,
            activeTabID == pendingActiveTabID,
            let tab = tabs.first(where: { $0.id == pendingActiveTabID }),
            tab.terminalTarget == nil,
            !tab.isSleepingTerminal
        else { return }
        // Why: activation materializes a pending leaf whose PTY is not yet available.
        await activateSelection(tab, reportsFailure: false)
    }

    func cancelActivation() {
        activationGeneration += 1
        activatingTabID = nil
    }

    func resumeWorkspace() async {
        guard isConnected, operation == nil else { return }
        operation = .resuming
        mutationError = nil
        defer { operation = nil }
        do {
            try await repository.activateWorkspace(hostID: hostID, workspaceID: worktreeID)
            apply(try await repository.workspaceTabs(for: hostID, worktreeID: worktreeID))
        } catch is CancellationError {
            return
        } catch {
            mutationError = "Yiru could not resume this workspace. Try again."
        }
    }

    func createTerminal(agentID: String? = nil) async {
        guard isConnected, operation == nil else { return }
        cancelActivation()
        operation = .creating
        defer { operation = nil }
        mutationError = nil
        do {
            let snapshot = try await repository.createWorkspaceTerminal(
                for: hostID,
                worktreeID: worktreeID,
                afterTabID: activeTabID,
                agentID: agentID
            )
            applyCreatedSnapshot(snapshot)
        } catch is CancellationError {
            return
        } catch {
            mutationError = "Yiru could not create a terminal."
        }
    }

    func createMarkdown() async {
        await createNonterminal(
            failureMessage: "Yiru could not create a markdown note."
        ) {
            try await repository.createWorkspaceMarkdown(
                for: hostID,
                worktreeID: worktreeID
            )
        }
    }

    func createBrowser(url: String) async {
        await createNonterminal(
            failureMessage: "Yiru could not create a browser tab."
        ) {
            try await repository.createWorkspaceBrowser(
                for: hostID,
                worktreeID: worktreeID,
                url: url
            )
        }
    }

    func reportBrowserUnavailable() {
        mutationError = "Browser streaming is not available on this host."
    }

    func launchQuickCommand(_ command: TerminalQuickCommand) async -> Bool {
        guard isConnected, operation == nil else { return false }
        cancelActivation()
        operation = .creating
        mutationError = nil
        defer { operation = nil }
        do {
            let snapshot = try await quickCommandRepository.launchQuickCommand(
                for: hostID,
                worktreeID: worktreeID,
                afterTabID: activeTabID,
                command: command
            )
            applyCreatedSnapshot(snapshot)
            return true
        } catch is CancellationError {
            return false
        } catch {
            mutationError = "Yiru could not run this quick command."
            return false
        }
    }

    // Why: surfaced by the pending-terminal timeout UI (see
    // isPendingTerminalTimedOut) instead of leaving "Starting terminal…" up
    // forever. The stuck tab's pty id is presumed dead — closing and starting
    // a fresh terminal is more likely to succeed than re-polling the same id.
    func retryPendingTerminal(_ tab: TerminalWorkspaceTab) async {
        pendingTerminalSince.removeValue(forKey: tab.id)
        await close(tab)
        await createTerminal()
    }

    func close(_ tab: TerminalWorkspaceTab) async {
        guard isConnected, operation == nil else { return }
        cancelActivation()
        operation = .closing(tab.id)
        defer { operation = nil }
        mutationError = nil
        // Why: a 10s tombstone TTL guards against a slow host-side close republishing the tab
        // before it confirms gone.
        closedTabTombstones[tab.id] = Date().addingTimeInterval(10)
        removeLocally(tab)
        do {
            let snapshot = try await repository.closeWorkspaceTab(
                for: hostID,
                worktreeID: worktreeID,
                tabID: tab.id,
                leafID: tab.leafID
            )
            apply(snapshot)
        } catch is CancellationError {
            return
        } catch {
            closedTabTombstones.removeValue(forKey: tab.id)
            mutationError = "Yiru could not close this tab."
            await refresh(shouldReplaceFailure: false)
        }
    }

    func dismissMutationError() {
        mutationError = nil
    }

    func createNonterminal(
        failureMessage: LocalizedStringResource,
        operation request: () async throws -> TerminalWorkspaceSnapshot
    ) async {
        guard isConnected, operation == nil else { return }
        cancelActivation()
        operation = .creating
        mutationError = nil
        do {
            applyCreatedSnapshot(try await request())
        } catch is CancellationError {
            self.operation = nil
            return
        } catch {
            mutationError = failureMessage
        }
        operation = nil
    }
}

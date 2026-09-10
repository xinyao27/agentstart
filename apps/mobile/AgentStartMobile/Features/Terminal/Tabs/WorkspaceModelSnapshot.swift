import Foundation

@MainActor
extension TerminalWorkspaceModel {
    func loadInitialSnapshot() async {
        guard isConnected, !hasReceivedInitialSnapshot else { return }
        await refresh(shouldReplaceFailure: true)
        guard hasReceivedInitialSnapshot, operation == nil else { return }
        if let pendingActiveTabID,
            let selected = tabs.first(where: { $0.id == pendingActiveTabID }),
            selected.terminalTarget == nil,
            !selected.isSleepingTerminal
        {
            await activateSelection(selected, reportsFailure: false)
            return
        }
        guard tabs.isEmpty else { return }
        await createTerminal()
    }

    @discardableResult
    func apply(_ snapshot: TerminalWorkspaceSnapshot) -> Bool {
        guard
            snapshotGate.accepts(
                epoch: snapshot.publicationEpoch,
                version: snapshot.snapshotVersion
            )
        else { return false }
        let isInitialSnapshot = !hasReceivedInitialSnapshot
        hasReceivedInitialSnapshot = true
        let incomingIDs = Set(snapshot.tabs.map(\.id))
        for id in Array(closedTabTombstones.keys) where !incomingIDs.contains(id) {
            closedTabTombstones.removeValue(forKey: id)
        }
        let now = Date()
        tabs = snapshot.tabs.filter { tab in
            guard let expiry = closedTabTombstones[tab.id] else { return true }
            if expiry <= now {
                closedTabTombstones.removeValue(forKey: tab.id)
                return true
            }
            return false
        }
        // Why: first-seen timestamp per still-pending tab, so a bounded wait
        // (see isPendingTerminalTimedOut) can eventually replace an infinite
        // "Starting terminal…" spinner with an actionable error.
        let stillPendingIDs = Set(tabs.filter(\.isPendingTerminal).map(\.id))
        for id in Array(pendingTerminalSince.keys) where !stillPendingIDs.contains(id) {
            pendingTerminalSince.removeValue(forKey: id)
        }
        for id in stillPendingIDs where pendingTerminalSince[id] == nil {
            pendingTerminalSince[id] = now
        }
        let snapshotActiveID = resolvedSnapshotActiveID(snapshot.activeTabID)
        let requestedInitialTabID =
            isInitialSnapshot
            ? initialTabID.flatMap { id in tabs.contains(where: { $0.id == id }) ? id : nil }
            : nil
        if let requestedInitialTabID {
            activeTabID = requestedInitialTabID
            pendingActiveTabID = activeTab?.isSleepingTerminal == true ? nil : requestedInitialTabID
        } else if let pendingActiveTabID,
            tabs.contains(where: { $0.id == pendingActiveTabID })
        {
            activeTabID = pendingActiveTabID
            if activeTab?.isSleepingTerminal == true
                || (snapshotActiveID == pendingActiveTabID
                    && confirmsWorkspaceSelection(publicationEpoch: snapshot.publicationEpoch))
            {
                self.pendingActiveTabID = nil
            }
        } else if let activeTabID, tabs.contains(where: { $0.id == activeTabID }) {
            // Why: another client's persisted selection must not move this client's focus.
            pendingActiveTabID = nil
        } else {
            pendingActiveTabID = nil
            activeTabID = snapshotActiveID
            if isInitialSnapshot, activeTab?.isPendingTerminal == true {
                pendingActiveTabID = activeTabID
            }
        }
        if let activeTab {
            retainIfNeeded(activeTab)
        }
        visitedTabIDs.formIntersection(incomingIDs)
        phase = .loaded
        return isInitialSnapshot && tabs.isEmpty
    }

    func resolvedSnapshotActiveID(_ snapshotActiveID: String?) -> String? {
        if let snapshotActiveID, tabs.contains(where: { $0.id == snapshotActiveID }) {
            return snapshotActiveID
        }
        return tabs.first(where: \.isActive)?.id ?? tabs.first?.id
    }

    func applyCreatedSnapshot(_ snapshot: TerminalWorkspaceSnapshot) {
        apply(snapshot)
        guard
            let createdActiveID = snapshot.activeTabID,
            let createdActiveTab = tabs.first(where: { $0.id == createdActiveID })
        else { return }
        activeTabID = createdActiveID
        pendingActiveTabID = createdActiveID
        retainIfNeeded(createdActiveTab)
    }

    func retainIfNeeded(_ tab: TerminalWorkspaceTab) {
        visitedTabIDs.insert(tab.id)
    }

    func removeLocally(_ tab: TerminalWorkspaceTab) {
        let closingIndex = tabs.firstIndex(where: { $0.id == tab.id })
        tabs.removeAll { $0.id == tab.id }
        visitedTabIDs.remove(tab.id)
        guard activeTabID == tab.id else { return }
        let fallbackIndex = min(closingIndex ?? 0, max(0, tabs.count - 1))
        activeTabID = tabs.isEmpty ? nil : tabs[fallbackIndex].id
        if let activeTab {
            retainIfNeeded(activeTab)
        }
    }
}

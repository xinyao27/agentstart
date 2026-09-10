import Foundation

extension RuntimeClient {
    func fetchWorkspaceTabs(for hostID: String, worktreeID: String) async throws
        -> TerminalWorkspaceSnapshot
    {
        let wire: MobileSessionTabsWire = try await sessionTabsSnapshot(
            hostID: hostID,
            worktreeSelector: worktreeSelector(worktreeID)
        )
        return await mapWorkspaceSnapshot(wire, hostID: hostID, worktreeID: worktreeID)
    }

    func mapWorkspaceSnapshot(
        _ wire: MobileSessionTabsWire,
        hostID: String,
        worktreeID: String
    ) async -> TerminalWorkspaceSnapshot {
        let terminals = try? await fetchTerminalSummaries(for: hostID, worktreeID: worktreeID)
        return TerminalWorkspaceSnapshot(
            worktree: wire.worktree,
            publicationEpoch: wire.publicationEpoch,
            snapshotVersion: wire.snapshotVersion,
            activeTabID: wire.activeTabId,
            tabs: wire.tabs.map {
                mapWorkspaceTab($0, terminals: terminals, worktreeID: worktreeID)
            }
        )
    }

    func workspaceSnapshotAfterCreatingTerminal(
        current: TerminalWorkspaceSnapshot,
        created: MobileSessionCreateTerminalResultWire,
        worktreeID: String,
        afterTabID: String?
    ) -> TerminalWorkspaceSnapshot {
        let createdTab = settingWorkspaceTabActive(
            mapWorkspaceTab(created.tab, terminals: [], worktreeID: worktreeID),
            isActive: true
        )
        var tabs = current.tabs
            .filter { $0.id != createdTab.id }
            .map { settingWorkspaceTabActive($0, isActive: false) }
        let insertionIndex =
            afterTabID.flatMap { anchorID in
                tabs.firstIndex(where: { $0.id == anchorID }).map { $0 + 1 }
            } ?? tabs.endIndex
        tabs.insert(createdTab, at: insertionIndex)
        return TerminalWorkspaceSnapshot(
            worktree: current.worktree,
            publicationEpoch: created.publicationEpoch,
            snapshotVersion: created.snapshotVersion,
            activeTabID: createdTab.id,
            tabs: tabs
        )
    }

    private func fetchTerminalSummaries(for hostID: String, worktreeID: String) async throws
        -> [TerminalSummary]
    {
        let response = try await protocolTerminalList(
            hostID: hostID,
            worktree: worktreeSelector(worktreeID),
            limit: 1_000,
            requireFreshPtyLiveness: true
        )
        return response.terminals.map(TerminalSummary.init(protocol:))
    }

    func mapWorkspaceTab(
        _ wire: MobileSessionTabWire,
        terminals: [TerminalSummary]?,
        worktreeID: String
    ) -> TerminalWorkspaceTab {
        let content: TerminalWorkspaceTabContent
        switch wire.type {
        case .terminal:
            if wire.status == .sleeping {
                content = .terminal(.sleeping)
            } else if let target = readyTerminalTarget(
                wire,
                terminals: terminals,
                worktreeID: worktreeID
            )
                ?? recoveredTerminalTarget(wire, terminals: terminals, worktreeID: worktreeID)
            {
                content = .terminal(.ready(target))
            } else if terminals == nil, let handle = wire.terminal, !handle.isEmpty {
                // Why: terminal listing is a secondary liveness probe. If that probe is
                // temporarily unavailable, the authoritative tab snapshot is still enough to
                // reopen the session. Falling back to its published handle keeps the page usable
                // while the next poll resolves a recovered PTY, instead of replacing a ready tab
                // with a transparent pending surface.
                content = .terminal(
                    .ready(
                        TerminalTarget(
                            id: handle,
                            title: wire.title,
                            isWritable: true
                        )
                    )
                )
            } else {
                content = .terminal(.pending)
            }
        case .markdown:
            content = .markdown(
                WorkspaceMarkdownTab(
                    relativePath: wire.relativePath ?? wire.filePath ?? "",
                    documentVersion: wire.documentVersion ?? "",
                    isHostDirty: wire.isDirty ?? false
                )
            )
        case .file:
            content = .file(
                WorkspaceFileTab(
                    relativePath: wire.relativePath ?? wire.filePath ?? "",
                    language: wire.language ?? "",
                    diffSource: wire.diffSource.flatMap(WorkspaceFileDiffSource.init(rawValue:))
                )
            )
        case .browser:
            content = .browser(
                WorkspaceBrowserTab(
                    workspaceID: wire.browserWorkspaceId ?? "",
                    pageID: wire.browserPageId,
                    url: wire.url ?? "",
                    isLoading: wire.loading ?? false,
                    canGoBack: wire.canGoBack ?? false,
                    canGoForward: wire.canGoForward ?? false
                )
            )
        }
        return TerminalWorkspaceTab(
            id: wire.id,
            title: wire.title,
            isActive: wire.isActive,
            isPinned: wire.isPinned ?? false,
            leafID: wire.leafId,
            content: content,
            launchAgent: wire.launchAgent,
            resolvedAgentType: wire.resolvedAgentType ?? wire.agentStatus?.agentType
        )
    }

    private func readyTerminalTarget(
        _ wire: MobileSessionTabWire,
        terminals: [TerminalSummary]?,
        worktreeID: String
    ) -> TerminalTarget? {
        guard wire.status == .ready, let handle = wire.terminal else { return nil }
        // Why: a session tab can remain ready while its published handle is a runtime mirror.
        // Prefer the fresh PTY recovered from ptyId so an existing tab does not open a blank
        // surface after Desktop has replaced the renderer-owned handle.
        if let recovered = recoveredTerminalTarget(
            wire,
            terminals: terminals,
            worktreeID: worktreeID
        ) {
            return recovered
        }
        // Why: a runtime mirror is not a usable PTY. If its replacement is temporarily absent
        // from the fresh terminal list, keep the tab pending instead of reopening the stale
        // mirror and presenting a blank terminal that cannot receive input.
        if runtimeTerminalHandle(from: wire.ptyId) != nil {
            return nil
        }
        guard let terminals else { return nil }
        guard let summary = terminals.first(where: { $0.id == handle }) else {
            return TerminalTarget(id: handle, title: wire.title, isWritable: true)
        }
        // Why: Desktop can publish a ready mirror whose `runtime:` PTY has already replaced its
        // disconnected handle. Let recovery resolve that live handle instead of reconnecting the
        // known-dead mirror forever.
        guard summary.isConnected else { return nil }
        return summary.target
    }

    private func recoveredTerminalTarget(
        _ wire: MobileSessionTabWire,
        terminals: [TerminalSummary]?,
        worktreeID: String
    ) -> TerminalTarget? {
        guard let terminals else { return nil }
        let summary: TerminalSummary?
        if let handle = runtimeTerminalHandle(from: wire.ptyId) {
            let recoveredByHandle = terminals.first {
                $0.id == handle && $0.isConnected && $0.worktreeID == worktreeID
            }
            // Why: after a Desktop renderer restart, the `runtime:` value can be the
            // controller PTY id while the public terminal handle has been re-adopted. Match
            // that live PTY as a fallback so an existing tab can recover instead of looping in
            // the pending “Starting terminal…” state.
            summary =
                recoveredByHandle
                ?? terminals.first {
                    $0.ptyID == wire.ptyId && $0.isConnected && $0.worktreeID == worktreeID
                }
        } else if let ptyID = wire.ptyId {
            summary = terminals.first {
                $0.ptyID == ptyID && $0.isConnected && $0.worktreeID == worktreeID
            }
        } else {
            summary = nil
        }
        guard let summary else { return nil }
        return TerminalTarget(
            id: summary.id,
            title: wire.title.isEmpty ? summary.displayTitle : wire.title,
            isWritable: summary.isWritable
        )
    }

    func settingWorkspaceTabActive(
        _ tab: TerminalWorkspaceTab,
        isActive: Bool
    ) -> TerminalWorkspaceTab {
        TerminalWorkspaceTab(
            id: tab.id,
            title: tab.title,
            isActive: isActive,
            isPinned: tab.isPinned,
            leafID: tab.leafID,
            content: tab.content,
            launchAgent: tab.launchAgent,
            resolvedAgentType: tab.resolvedAgentType
        )
    }

}

nonisolated private func runtimeTerminalHandle(from ptyID: String?) -> String? {
    guard let ptyID, ptyID.hasPrefix("runtime:") else { return nil }
    let encodedOwnerAndHandle = ptyID.dropFirst("runtime:".count)
    let encodedHandle =
        encodedOwnerAndHandle.range(of: "@@").map { encodedOwnerAndHandle[$0.upperBound...] }
        ?? encodedOwnerAndHandle[...]
    guard let handle = String(encodedHandle).removingPercentEncoding, !handle.isEmpty else {
        return nil
    }
    return handle
}

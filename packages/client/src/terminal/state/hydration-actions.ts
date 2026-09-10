import { isValidTerminalTabId } from '@agentstart/protocol/terminal/tab-identity'
import type { WorkspaceKey } from '@agentstart/protocol/workspace/identity'
import {
  folderWorkspaceKey,
  parseWorkspaceKey,
  worktreeWorkspaceKey
} from '@agentstart/protocol/workspace/identity'
import type { TerminalTab } from '@agentstart/protocol/workspace/tabs'
import { getRepoIdFromWorktreeId } from '@agentstart/protocol/worktree/identity'
import type { StateCreator } from 'zustand'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import {
  normalizeTerminalLayoutSnapshot,
  resolvePtyBoundActiveLeafId
} from '~renderer/terminal-pane/terminal-layout-leaf-ids'
import { sanitizeTerminalLayoutPaneTitles } from '~renderer/terminal-pane/title-sanitization'
import { addAdditionalValidWorkspaceKeys } from '~renderer/workspace/session-hydration-keys'

import type { AppState } from '../../store/types'
import { clearTransientTerminalState } from './layout-state'
import { buildTerminalSessionTabIndex } from './session-index'
import type { TerminalSlice } from './slice'
import { buildRuntimeSessionPlaceholders } from './tab-model'

export function createTerminalHydrationActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<TerminalSlice, 'hydrateWorkspaceSession'> {
  return {
    hydrateWorkspaceSession: (session, options) => {
      const catalogState = readProjectCatalogRuntimeState()
      set((s) => {
        const runtimeSessionPlaceholders = buildRuntimeSessionPlaceholders({
          repos: catalogState.repos,
          runtimeHostIdByWorkspaceSessionKey: options?.runtimeHostIdByWorkspaceSessionKey ?? {},
          worktreesByRepo: catalogState.worktreesByRepo
        })
        const placeholderWorktrees = Object.values(
          runtimeSessionPlaceholders.worktreesByRepo
        ).flat()
        const validWorktreeIds = new Set(placeholderWorktrees.map((worktree) => worktree.id))
        const knownRepoIds = new Set(runtimeSessionPlaceholders.repos.map((r) => r.id))
        const repoIdsWithLoadedWorktrees = new Set(
          Object.entries(runtimeSessionPlaceholders.worktreesByRepo)
            .filter(([, worktrees]) => worktrees.length > 0)
            .map(([repoId]) => repoId)
        )
        const repoIdsWithAuthoritativeDetectedWorktrees = new Set(
          Object.entries(catalogState.detectedWorktreesByRepo)
            .filter(([, detected]) => detected.authoritative)
            .map(([repoId]) => repoId)
        )
        for (const workspace of catalogState.folderWorkspaces) {
          validWorktreeIds.add(folderWorkspaceKey(workspace.id))
        }
        addAdditionalValidWorkspaceKeys(validWorktreeIds, options)
        for (const worktreeId of Object.keys(session.tabsByWorktree)) {
          const parsedWorkspaceKey = parseWorkspaceKey(worktreeId)
          if (parsedWorkspaceKey?.type === 'folder') {
            continue
          }
          if (!validWorktreeIds.has(worktreeId)) {
            const repoId = getRepoIdFromWorktreeId(worktreeId)
            // Why (#1158): an empty/missing list can mean degraded hydration; a
            // non-empty repo list is authoritative for deleted-worktree cleanup.
            if (
              knownRepoIds.has(repoId) &&
              !repoIdsWithLoadedWorktrees.has(repoId) &&
              !repoIdsWithAuthoritativeDetectedWorktrees.has(repoId)
            ) {
              validWorktreeIds.add(worktreeId)
            }
          }
        }
        // Why pendingActivationSpawn on hydrated tabs: when a worktree restored
        // from the previous session is mounted for the first time this session
        // (either because it's the restored activeWorktreeId, or because the
        // user clicks it), TerminalPane's connectPanePty fires — either
        // reattaching to the daemon/relay session or spawning fresh. Both call
        // updateTabPtyId, which would otherwise bump lastActivityAt and make
        // the worktree bounce to the top of Recent ~5 seconds later when an
        // unrelated event triggers a re-sort. Tagging at hydration covers the
        // restored-active worktree (which never goes through setActiveWorktree
        // again) and any other restored worktrees the user clicks later. The
        // tag is consumed on the first updateTabPtyId/clearTabPtyId per tab,
        // so subsequent legitimate events (codex restart, new pane) still bump.
        const tabsByWorktree: Record<string, TerminalTab[]> = Object.fromEntries(
          Object.entries(session.tabsByWorktree)
            .filter(([worktreeId]) => validWorktreeIds.has(worktreeId))
            .map(([worktreeId, tabs]) => {
              const quickCommandLabelByTerminalId = new Map(
                (session.unifiedTabs?.[worktreeId] ?? [])
                  .filter((tab) => tab.contentType === 'terminal' && tab.quickCommandLabel?.trim())
                  .map((tab) => [tab.entityId, tab.quickCommandLabel!.trim()])
              )
              return [
                worktreeId,
                [...tabs]
                  .filter((tab) => {
                    // Why: old web-client mirrors could persist host surface ids
                    // with "::"; makePaneKey reserves ":" as its separator.
                    return isValidTerminalTabId(tab.id)
                  })
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
                  .map((tab, index) => {
                    const quickCommandLabel =
                      tab.quickCommandLabel?.trim() || quickCommandLabelByTerminalId.get(tab.id)
                    return {
                      ...clearTransientTerminalState(tab, index),
                      ...(quickCommandLabel ? { quickCommandLabel } : {}),
                      sortOrder: index,
                      pendingActivationSpawn: true
                    }
                  })
              ]
            })
            .filter(([, tabs]) => tabs.length > 0)
        )

        const allTabs = Object.values(tabsByWorktree).flat()
        const tabById = buildTerminalSessionTabIndex(allTabs)
        const validTabIds = new Set(allTabs.map((tab) => tab.id))
        const sleepingAgentSessionsByPaneKey = Object.fromEntries(
          Object.entries(session.sleepingAgentSessionsByPaneKey ?? {}).filter(([, record]) =>
            validWorktreeIds.has(record.worktreeId)
          )
        )
        const fallbackActiveWorktreeId =
          !session.activeWorktreeId &&
          session.activeRepoId &&
          knownRepoIds.has(session.activeRepoId)
            ? (runtimeSessionPlaceholders.worktreesByRepo[session.activeRepoId]?.find(
                (worktree) => worktree.isMainWorktree
              )?.id ??
              runtimeSessionPlaceholders.worktreesByRepo[session.activeRepoId]?.[0]?.id ??
              null)
            : null
        const activeWorktreeId = (() => {
          if (session.activeWorktreeId && validWorktreeIds.has(session.activeWorktreeId)) {
            return session.activeWorktreeId
          }
          // Why: a workspace with no terminal tabs is still a valid workspace.
          // Falling back from the active repo prevents the blank landing screen
          // when session tabs were pruned or never created.
          return fallbackActiveWorktreeId
        })()
        const activeWorkspaceKey: WorkspaceKey | null =
          session.activeWorkspaceKey && validWorktreeIds.has(session.activeWorkspaceKey)
            ? session.activeWorkspaceKey
            : activeWorktreeId
              ? parseWorkspaceKey(activeWorktreeId)
                ? (activeWorktreeId as WorkspaceKey)
                : worktreeWorkspaceKey(activeWorktreeId)
              : null
        const activeTabId =
          session.activeTabId && validTabIds.has(session.activeTabId) ? session.activeTabId : null
        const activeRepoId =
          session.activeRepoId &&
          runtimeSessionPlaceholders.repos.some((repo) => repo.id === session.activeRepoId)
            ? session.activeRepoId
            : null

        // Why: workspaceSessionReady stays false here. It is set to true in
        // reconnectPersistedTerminals() after all eager PTY spawns complete.
        // This prevents TerminalPane from mounting and spawning duplicate PTYs
        // before the reconnect phase has set ptyId on each tab.
        // Why: match the pre-idle-runtime-optimization startup contract.
        // activeWorktreeIdsOnShutdown is authoritative when present; persisted
        // tab/layout PTY IDs are wake hints, not a broader active-workspace list.
        const shutdownIds =
          session.activeWorktreeIdsOnShutdown ??
          Object.entries(session.tabsByWorktree)
            .filter(([, tabs]) => tabs.some((t) => t.ptyId))
            .map(([wId]) => wId)
        const pendingReconnectWorktreeIds = shutdownIds.filter((id) => validWorktreeIds.has(id))

        // Why: capture which specific tabs had live PTYs per worktree from the
        // raw session data BEFORE clearTransientTerminalState nulled the ptyIds.
        // This ensures reconnectPersistedTerminals binds PTYs to the correct
        // tabs, not just tabs[0], which matters for multi-tab worktrees.
        // Also include tabs whose relay session IDs were preserved in
        // remoteSessionIdsByTabId — those tabs were disconnected before shutdown
        // (ptyId was null) but the relay still has their PTY alive.
        const remoteSessionIds = session.remoteSessionIdsByTabId ?? {}
        const pendingReconnectTabByWorktree: Record<string, string[]> = {}
        for (const worktreeId of pendingReconnectWorktreeIds) {
          const rawTabs = session.tabsByWorktree[worktreeId] ?? []
          const liveTabIds = rawTabs
            .filter((t) => (t.ptyId || remoteSessionIds[t.id]) && validTabIds.has(t.id))
            .map((t) => t.id)
          if (liveTabIds.length > 0) {
            pendingReconnectTabByWorktree[worktreeId] = liveTabIds
          }
        }

        // Why: preserve the previous session's ptyId for each tab so that
        // reconnectPersistedTerminals can pass it as sessionId to the daemon's
        // createOrAttach RPC, triggering reattach instead of a fresh spawn.
        const pendingReconnectPtyIdByTabId: Record<string, string> = {}
        for (const worktreeId of pendingReconnectWorktreeIds) {
          const rawTabs = session.tabsByWorktree[worktreeId] ?? []
          for (const tab of rawTabs) {
            if (tab.ptyId && validTabIds.has(tab.id)) {
              pendingReconnectPtyIdByTabId[tab.id] = tab.ptyId
            }
          }
        }

        // Why: remote PTY reattach uses the relay's pty.attach RPC, not the
        // local terminal daemon.
        for (const [tabId, sessionId] of Object.entries(remoteSessionIds)) {
          if (validTabIds.has(tabId)) {
            pendingReconnectPtyIdByTabId[tabId] = sessionId
          }
        }

        // Why: restore per-worktree active terminal tab from session.
        // If the session has the map, validate that each tab ID still exists.
        // Otherwise, derive it: the active worktree gets activeTabId, others
        // default to their first tab.
        let activeTabIdByWorktree: Record<string, string | null> = {}
        if (session.activeTabIdByWorktree) {
          for (const [wId, tabId] of Object.entries(session.activeTabIdByWorktree)) {
            if (validWorktreeIds.has(wId) && tabId && validTabIds.has(tabId)) {
              activeTabIdByWorktree[wId] = tabId
            }
          }
        } else {
          // Legacy sessions: best-effort derivation
          if (activeWorktreeId && activeTabId) {
            activeTabIdByWorktree[activeWorktreeId] = activeTabId
          }
          for (const [wId, tabs] of Object.entries(tabsByWorktree)) {
            if (!activeTabIdByWorktree[wId] && tabs.length > 0) {
              activeTabIdByWorktree[wId] = tabs[0].id
            }
          }
        }

        // Why: the restored-active worktree is set as activeWorktreeId here
        // without ever going through setActiveWorktree, so its first-activation
        // tagging needs to happen at hydration. Record it in
        // everActivatedWorktreeIds so a later re-click doesn't re-tag (which
        // would suppress real activity).
        const nextEverActivated = new Set(s.everActivatedWorktreeIds)
        if (activeWorktreeId) {
          nextEverActivated.add(activeWorktreeId)
        }
        return {
          activeRepoId,
          activeWorktreeId,
          activeWorkspaceKey,
          activeTabId,
          activeTabIdByWorktree,
          restoredRuntimeHostIdByWorkspaceSessionKey:
            options?.runtimeHostIdByWorkspaceSessionKey ?? {},
          tabsByWorktree,
          // Why: restore the per-worktree focus-recency map. Pruning of stale
          // entries happens later (application-shell.tsx calls pruneLastVisitedTimestamps
          // after hydration) — not here — because runtime-host placeholder worktrees
          // may still be appearing in worktreesByRepo at this moment.
          lastVisitedAtByWorktreeId: session.lastVisitedAtByWorktreeId ?? {},
          defaultTerminalTabsAppliedByWorktreeId:
            session.defaultTerminalTabsAppliedByWorktreeId ?? {},
          automaticAgentResumeClaimsByTabId: {},
          sleepingAgentSessionsByPaneKey,
          pendingReconnectWorktreeIds,
          pendingReconnectTabByWorktree,
          pendingReconnectPtyIdByTabId,
          everActivatedWorktreeIds: nextEverActivated,
          // Why: seed worktree nav history with the hydrated active worktree so
          // the first user-driven activation (e.g. a sidebar click to a different
          // worktree) has a prior entry to go Back to. Without this the restored
          // startup worktree is never recorded — recordWorktreeVisit only runs
          // inside activateAndRevealWorktree, which hydration bypasses — so Back
          // stays disabled until a second click produces the first-ever history
          // pair.
          worktreeNavHistory: activeWorktreeId ? [activeWorktreeId] : [],
          worktreeNavHistoryIndex: activeWorktreeId ? 0 : -1,
          ptyIdsByTabId: Object.fromEntries(allTabs.map((tab) => [tab.id, []] as const)),
          // Why: with the daemon backend, ptyIds are daemon session IDs that
          // survive app restart. Preserve ptyIdsByLeafId so that
          // reconnectPersistedTerminals can reattach each split-pane leaf
          // to its specific daemon session (not just the tab-level ptyId).
          terminalLayoutsByTabId: Object.fromEntries(
            Object.entries(session.terminalLayoutsByTabId)
              .filter(([tabId]) => validTabIds.has(tabId))
              .map(([tabId, layout]) => {
                // Why: old sessions can contain renderer-local pane:1-style leaf
                // ids. Normalize during hydration before runtime/mobile surfaces read them.
                const normalized = normalizeTerminalLayoutSnapshot(layout).snapshot
                const tab = tabById.get(tabId)
                const sanitized = tab
                  ? sanitizeTerminalLayoutPaneTitles(normalized, tab)
                  : normalized
                const activeLeafId = sanitized.root
                  ? resolvePtyBoundActiveLeafId({
                      root: sanitized.root,
                      activeLeafId: sanitized.activeLeafId,
                      ptyIdsByLeafId: sanitized.ptyIdsByLeafId
                    })
                  : sanitized.activeLeafId
                return [tabId, { ...sanitized, activeLeafId }]
              })
          )
        }
      })
    }
  }
}

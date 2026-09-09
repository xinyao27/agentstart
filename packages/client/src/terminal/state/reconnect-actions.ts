import type { TerminalTab } from '@yiru/protocol/workspace/tabs'
import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import type { TerminalSlice } from './slice'

export function createTerminalReconnectActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<TerminalSlice, 'reconnectPersistedTerminals'> {
  return {
    reconnectPersistedTerminals: async (signal) => {
      const {
        pendingReconnectWorktreeIds,
        pendingReconnectTabByWorktree,
        pendingReconnectPtyIdByTabId,
        terminalLayoutsByTabId,
        tabsByWorktree,
        ptyIdsByTabId
      } = get()
      if (signal?.aborted) {
        return
      }
      const ids = pendingReconnectWorktreeIds ?? []

      if (ids.length === 0) {
        {
          set({
            workspaceSessionReady: true,
            pendingReconnectWorktreeIds: [],
            pendingReconnectTabByWorktree: {},
            pendingReconnectPtyIdByTabId: {}
          })
        }
        return
      }

      // Why: instead of eagerly spawning PTYs at default 80×24 (which fills
      // eager buffers with content at wrong dimensions that gets garbled on
      // flush), we defer the actual daemon createOrAttach call to connectPanePty
      // where fitAddon provides real dims.
      //
      // This loop just records the daemon session IDs each leaf/tab needs so
      // connectPanePty can pass them as sessionId to pty.spawn at mount time.
      // The layout's ptyIdsByLeafId (preserved from shutdown) already has per-leaf
      // mappings. For single-pane tabs without leaf mappings, store the tab-level
      // ptyId as a sentinel so connectPanePty knows to reattach.
      let reconnectedTabsByWorktree: Record<string, TerminalTab[]> | null = null
      let reconnectedPtyIdsByTabId: Record<string, string[]> | null = null
      for (const worktreeId of ids) {
        const tabs = tabsByWorktree[worktreeId] ?? []
        const targetTabIds = pendingReconnectTabByWorktree[worktreeId] ?? []
        const tabsToReconnect: TerminalTab[] =
          targetTabIds.length > 0
            ? targetTabIds
                .map((id) => tabs.find((t) => t.id === id))
                .filter((t): t is TerminalTab => t != null)
            : tabs.slice(0, 1)
        if (tabsToReconnect.length === 0) {
          continue
        }

        for (const tab of tabsToReconnect) {
          const tabId = tab.id
          const layout = terminalLayoutsByTabId[tabId]
          const leafPtyMap = layout?.ptyIdsByLeafId ?? {}
          const pendingPtyId = pendingReconnectPtyIdByTabId[tabId]
          const tabLevelPtyId = pendingPtyId
          const hasLeafMappings = Object.keys(leafPtyMap).length > 0

          // Why: populate the wake-hint and the live-pty map so the worktree
          // dot lights up green even before the terminal pane mounts. tab.ptyId
          // carries the wake-hint sessionId (consumed by pty-connection.ts on
          // remount); ptyIdsByTabId is the source of truth getWorktreeStatus
          // reads for liveness. The actual PTY reattach is handled later by
          // pty-connection.ts when the terminal pane mounts; this block only
          // sets the visual state.
          if (tabLevelPtyId) {
            reconnectedTabsByWorktree ??= { ...tabsByWorktree }
            const nextTabs = reconnectedTabsByWorktree[worktreeId]
            if (!nextTabs) {
              continue
            }

            // Why: populate ptyIdsByTabId so the sessions status segment
            // can map daemon session IDs back to tabs (for bound/orphan
            // detection and click-to-navigate). Without this, all sessions
            // appear as orphans until the terminal pane mounts.
            const allPtyIds = hasLeafMappings
              ? (Object.values(leafPtyMap).filter(Boolean) as string[])
              : [tabLevelPtyId]
            reconnectedTabsByWorktree[worktreeId] = nextTabs.map((t) =>
              t.id === tabId ? { ...t, ptyId: tabLevelPtyId } : t
            )
            // Why: hide-sleeping uses ptyIdsByTabId as the liveness source.
            // Restored daemon sessions are still running even before their
            // pane remounts, so background workspaces must advertise them.
            reconnectedPtyIdsByTabId ??= { ...ptyIdsByTabId }
            reconnectedPtyIdsByTabId[tabId] = allPtyIds
          }
        }
      }

      if (signal?.aborted) {
        return
      }
      const remainingReconnectWorktreeIds: string[] = []
      const remainingReconnectTabByWorktree = {}
      const remainingReconnectPtyIdByTabId = {}

      set({
        ...(reconnectedTabsByWorktree ? { tabsByWorktree: reconnectedTabsByWorktree } : {}),
        ...(reconnectedPtyIdsByTabId ? { ptyIdsByTabId: reconnectedPtyIdsByTabId } : {}),
        workspaceSessionReady: true,
        pendingReconnectWorktreeIds: remainingReconnectWorktreeIds,
        pendingReconnectTabByWorktree: remainingReconnectTabByWorktree,
        pendingReconnectPtyIdByTabId: remainingReconnectPtyIdByTabId
      })
    }
  }
}

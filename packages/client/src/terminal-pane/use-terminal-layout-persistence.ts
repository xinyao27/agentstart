import { isRuntimePtyId } from '@yiru/protocol/terminal-identity'

import { useEventCallback } from '../react/use-event-callback'
import {
  clearRemoteRuntimeTerminalBuffer,
  updateRemoteRuntimePaneLayout
} from '../runtime/remote-runtime-session'
import { clearRuntimeTerminalBuffer } from '../runtime/terminal-inspection'
import { useAppStore } from '../store/state'
import { serializeTerminalLayout } from './layout-serialization'
import { mergeCapturedLeafState } from './merge-captured-leaf-state'
import type { ManagedPane, PaneManager } from './pane-manager/pane-manager'
import { clearTerminalScrollbackAndFollowOutput } from './pane-manager/terminal-scrollback-clear'
import type { PtyTransport } from './pty/transport-types'
import { resolveTerminalLayoutActiveLeafId } from './terminal-layout-leaf-ids'

type TerminalLayoutPersistenceInput = {
  clearedScrollbackLeafIdsRef: React.RefObject<Set<string>>
  containerRef: React.RefObject<HTMLDivElement | null>
  expandedPaneIdRef: React.RefObject<number | null>
  managerRef: React.RefObject<PaneManager | null>
  paneTitlesRef: React.RefObject<Record<number, string>>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  removedTitleLeafIdsRef: React.RefObject<Set<string>>
  setPaneTitles: React.Dispatch<React.SetStateAction<Record<number, string>>>
  tabId: string
  worktreeId: string
}

export function useTerminalLayoutPersistence({
  clearedScrollbackLeafIdsRef,
  containerRef,
  expandedPaneIdRef,
  managerRef,
  paneTitlesRef,
  paneTransportsRef,
  removedTitleLeafIdsRef,
  setPaneTitles,
  tabId,
  worktreeId
}: TerminalLayoutPersistenceInput): {
  clearPaneScrollback: (pane: ManagedPane) => void
  handleClearPaneTitleShortcut: (paneId: number) => void
  persistLayoutSnapshot: () => void
  removePaneTitle: (paneId: number) => void
} {
  const persistLayoutSnapshot = useEventCallback((): void => {
    const manager = managerRef.current
    const container = containerRef.current
    if (!manager || !container) {
      return
    }
    const activePaneId = manager.getActivePane()?.id ?? manager.getPanes()[0]?.id ?? null
    const layout = serializeTerminalLayout(
      container,
      activePaneId,
      expandedPaneIdRef.current,
      manager.getLeafIdMap()
    )
    const state = useAppStore.getState()
    const existing = state.terminalLayoutsByTabId[tabId]
    const currentPanes = manager.getPanes()
    const currentLeafIds = new Set(currentPanes.map((pane) => pane.leafId))
    const clearedScrollbackLeafIds = clearedScrollbackLeafIdsRef.current
    const preservedScrollbackLeafIds = new Set(
      [...currentLeafIds].filter((leafId) => !clearedScrollbackLeafIds.has(leafId))
    )
    const mergedBuffers = mergeCapturedLeafState({
      prior: existing?.buffersByLeafId,
      fresh: {},
      currentLeafIds: preservedScrollbackLeafIds
    })
    if (Object.keys(mergedBuffers).length > 0) {
      layout.buffersByLeafId = mergedBuffers
    }
    const mergedScrollbackRefs = mergeCapturedLeafState({
      prior: existing?.scrollbackRefsByLeafId,
      fresh: {},
      currentLeafIds: preservedScrollbackLeafIds
    })
    if (Object.keys(mergedScrollbackRefs).length > 0) {
      layout.scrollbackRefsByLeafId = mergedScrollbackRefs
    }
    const livePtyEntries = currentPanes
      .map(
        (pane) => [pane.leafId, paneTransportsRef.current.get(pane.id)?.getPtyId() ?? null] as const
      )
      .filter(
        (entry): entry is readonly [(typeof currentPanes)[number]['leafId'], string] =>
          entry[1] !== null
      )
    const mergedPtyIds = mergeCapturedLeafState({
      prior: existing?.ptyIdsByLeafId,
      fresh: Object.fromEntries(livePtyEntries),
      currentLeafIds
    })
    if (Object.keys(mergedPtyIds).length > 0) {
      layout.ptyIdsByLeafId = mergedPtyIds
    }
    layout.activeLeafId = resolveTerminalLayoutActiveLeafId({
      root: layout.root,
      activeLeafId: layout.activeLeafId,
      ptyIdsByLeafId: mergedPtyIds
    })

    const titlesByLeafId: Record<string, string> = {}
    const removedTitleLeafIds = removedTitleLeafIdsRef.current
    for (const pane of currentPanes) {
      const existingTitle = existing?.titlesByLeafId?.[pane.leafId]
      if (existingTitle && !removedTitleLeafIds.has(pane.leafId)) {
        titlesByLeafId[pane.leafId] = existingTitle
      }
      const title = paneTitlesRef.current[pane.id]
      if (title) {
        titlesByLeafId[pane.leafId] = title
        removedTitleLeafIds.delete(pane.leafId)
      }
    }
    if (Object.keys(titlesByLeafId).length > 0) {
      layout.titlesByLeafId = titlesByLeafId
    }
    state.setTabLayout(tabId, layout)
    if (Object.values(mergedPtyIds).some((ptyId) => isRuntimePtyId(ptyId))) {
      void updateRemoteRuntimePaneLayout({
        worktreeId,
        tabId,
        root: layout.root,
        expandedLeafId: layout.expandedLeafId,
        ...(layout.titlesByLeafId ? { titlesByLeafId: layout.titlesByLeafId } : {})
      })
    }
    for (const leafId of currentLeafIds) {
      clearedScrollbackLeafIds.delete(leafId)
    }
  })

  const clearPaneScrollback = (pane: ManagedPane): void => {
    clearedScrollbackLeafIdsRef.current.add(pane.leafId)
    clearTerminalScrollbackAndFollowOutput(pane.terminal)
    const ptyId = paneTransportsRef.current.get(pane.id)?.getPtyId() ?? null
    if (!clearRemoteRuntimeTerminalBuffer(ptyId) && ptyId) {
      void clearRuntimeTerminalBuffer(ptyId)
    }
    persistLayoutSnapshot()
  }
  const removePaneTitle = (paneId: number): void => {
    setPaneTitles((current) => {
      if (!(paneId in current)) {
        return current
      }
      const next = { ...current }
      delete next[paneId]
      return next
    })
    if (paneId in paneTitlesRef.current) {
      const next = { ...paneTitlesRef.current }
      delete next[paneId]
      paneTitlesRef.current = next
    }
    const leafId = managerRef.current?.getPanes().find((pane) => pane.id === paneId)?.leafId
    if (leafId) {
      removedTitleLeafIdsRef.current.add(leafId)
    }
    persistLayoutSnapshot()
  }

  return {
    clearPaneScrollback,
    handleClearPaneTitleShortcut: (paneId) => {
      if (paneTitlesRef.current[paneId]) {
        removePaneTitle(paneId)
      }
    },
    persistLayoutSnapshot,
    removePaneTitle
  }
}

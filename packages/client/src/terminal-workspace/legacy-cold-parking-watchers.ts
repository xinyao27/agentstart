import type { TabGroupLayoutNode } from '@yiru/protocol/workspace/tabs'
import { useEffect, type RefObject } from 'react'
import { useAppStore } from '~renderer/store/state'

import { selectEvictionExemptTerminalTabIds } from '../terminal-pane/eviction-exempt-tabs'
import {
  canWatcherCoverParkedTerminalTab,
  disposeAllParkedTerminalWatchers,
  pruneParkedTerminalWatchers,
  syncParkedTerminalTabWatchers
} from '../terminal-pane/terminal-parked-tab-watchers'

type LegacyColdParkingWatchersArgs = {
  workspaceSurfaces: readonly { id: string }[]
  mountedWorktreeIdsRef: RefObject<Set<string>>
  measurableBackgroundWorktreeIdsRef: RefObject<Set<string>>
  activationDeferredMountTabIdsByWorktreeRef: RefObject<Map<string, ReadonlySet<string>>>
  backgroundMountRevision: number
  anyMountedWorktreeHasLayout: boolean
  getEffectiveLayoutForWorktree: (worktreeId: string) => TabGroupLayoutNode | undefined
  parkedTerminalWorktreeIds: ReadonlySet<string>
  forceParkedTerminalWorktreeIds: ReadonlySet<string>
}

export function useLegacyColdParkingWatchers({
  workspaceSurfaces,
  mountedWorktreeIdsRef,
  measurableBackgroundWorktreeIdsRef,
  activationDeferredMountTabIdsByWorktreeRef,
  backgroundMountRevision,
  anyMountedWorktreeHasLayout,
  getEffectiveLayoutForWorktree,
  parkedTerminalWorktreeIds,
  forceParkedTerminalWorktreeIds
}: LegacyColdParkingWatchersArgs): void {
  const activeTabId = useAppStore((state) => state.activeTabId)
  const activeView = useAppStore((state) => state.activeView)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeTabIdByWorktree = useAppStore((state) => state.activeTabIdByWorktree)
  const groupsByWorktree = useAppStore((state) => state.groupsByWorktree)
  const pendingStartupByTabId = useAppStore((state) => state.pendingStartupByTabId)
  const tabsByWorktree = useAppStore((state) => state.tabsByWorktree)
  const terminalParkingEnabled = useAppStore(
    (state) => state.settings?.terminalHiddenViewParking !== false
  )
  const workspaceSessionReady = useAppStore((state) => state.workspaceSessionReady)

  // Why: split-mode overlays own their watchers, so this reconciles only worktrees without one.
  useEffect(() => {
    pruneParkedTerminalWatchers(new Set(workspaceSurfaces.map((workspace) => workspace.id)))
    for (const workspace of workspaceSurfaces) {
      if (
        anyMountedWorktreeHasLayout &&
        mountedWorktreeIdsRef.current.has(workspace.id) &&
        getEffectiveLayoutForWorktree(workspace.id)
      ) {
        continue
      }
      const tabs = tabsByWorktree[workspace.id] ?? []
      const parkedTabIds = new Set<string>()
      let deferredTabIds: ReadonlySet<string> | null = null
      if (!anyMountedWorktreeHasLayout && mountedWorktreeIdsRef.current.has(workspace.id)) {
        const isVisible = activeView === 'terminal' && workspace.id === activeWorktreeId
        const shouldMeasureHiddenWorktree =
          !isVisible && measurableBackgroundWorktreeIdsRef.current.has(workspace.id)
        const parked =
          !isVisible && !shouldMeasureHiddenWorktree && parkedTerminalWorktreeIds.has(workspace.id)
        const evictionExemptTabIds = forceParkedTerminalWorktreeIds.has(workspace.id)
          ? selectEvictionExemptTerminalTabIds(workspace.id, tabs)
          : null
        if (parked) {
          for (const tab of tabs) {
            if (!evictionExemptTabIds?.has(tab.id)) {
              parkedTabIds.add(tab.id)
            }
          }
        }
        // Why: activation-deferred tabs have no mounted pane to own their side effects.
        deferredTabIds =
          activationDeferredMountTabIdsByWorktreeRef.current.get(workspace.id) ?? null
        for (const tab of tabs) {
          if (
            deferredTabIds?.has(tab.id) &&
            !parkedTabIds.has(tab.id) &&
            canWatcherCoverParkedTerminalTab(workspace.id, tab)
          ) {
            parkedTabIds.add(tab.id)
          }
        }
      }
      syncParkedTerminalTabWatchers({
        worktreeId: workspace.id,
        tabs,
        parkedTabIds
      })
    }
  }, [
    activeTabId,
    activeView,
    activeWorktreeId,
    activationDeferredMountTabIdsByWorktreeRef,
    activeTabIdByWorktree,
    anyMountedWorktreeHasLayout,
    backgroundMountRevision,
    getEffectiveLayoutForWorktree,
    forceParkedTerminalWorktreeIds,
    groupsByWorktree,
    measurableBackgroundWorktreeIdsRef,
    mountedWorktreeIdsRef,
    parkedTerminalWorktreeIds,
    pendingStartupByTabId,
    tabsByWorktree,
    terminalParkingEnabled,
    workspaceSessionReady,
    workspaceSurfaces
  ])

  useEffect(() => () => disposeAllParkedTerminalWatchers(), [])
}

import type { ExecutionHostId } from '@yiru/protocol/host/identity'
import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'
import { hasRegisteredRuntimeTerminalTab } from '~renderer/runtime/sync-runtime-graph'
import type { AppState } from '~renderer/store/state'

import { canWatcherCoverParkedTerminalTab } from '../terminal-pane/terminal-parked-tab-watchers'
import {
  canDeferColdActivationTabsForHost,
  planColdActivationTabDeferral,
  pruneClosedBackgroundMountTabs,
  revealActivationDeferredTabs
} from '../terminal/background-terminal-worktree-mount'
import { terminalProviderHasAuthoritativeSnapshot } from './provider-snapshot-capability'

type WorkspaceSurface = { id: string; path: string }

type TerminalWorktreeActivationArgs = Pick<
  AppState,
  | 'activeGroupIdByWorktree'
  | 'activeTabId'
  | 'activeTabIdByWorktree'
  | 'activeWorktreeId'
  | 'groupsByWorktree'
  | 'pendingStartupByTabId'
  | 'tabsByWorktree'
  | 'unifiedTabsByWorktree'
  | 'workspaceSessionReady'
> & {
  activationDeferredMountTabIdsByWorktreeRef: RefObject<Map<string, ReadonlySet<string>>>
  activeWorktreeDeferralHostId: ExecutionHostId | null
  backgroundMountTabIdsByWorktreeRef: RefObject<Map<string, ReadonlySet<string>>>
  lastActivationWorktreeIdRef: RefObject<string | null>
  mountedWorktreeIdsRef: RefObject<Set<string>>
  notifyMountRevision: () => void
  terminalParkingEnabled: boolean
  workspaceSurfaces: WorkspaceSurface[]
}

export function useTerminalWorktreeActivation(args: TerminalWorktreeActivationArgs): void {
  const {
    activationDeferredMountTabIdsByWorktreeRef,
    activeGroupIdByWorktree,
    activeTabId,
    activeTabIdByWorktree,
    activeWorktreeDeferralHostId,
    activeWorktreeId,
    backgroundMountTabIdsByWorktreeRef,
    groupsByWorktree,
    lastActivationWorktreeIdRef,
    mountedWorktreeIdsRef,
    notifyMountRevision,
    pendingStartupByTabId,
    tabsByWorktree,
    terminalParkingEnabled,
    unifiedTabsByWorktree,
    workspaceSessionReady,
    workspaceSurfaces
  } = args
  useLayoutEffect(() => {
    // Why: waiting for session restoration prevents an eager TerminalPane from
    // spawning a duplicate PTY before persisted terminals reconnect.
    if (activeWorktreeId && workspaceSessionReady) {
      const worktreeTabs = tabsByWorktree[activeWorktreeId] ?? []
      const immediateTabIds = new Set<string>()
      if (activeTabId) {
        immediateTabIds.add(activeTabId)
      }
      const rememberedActiveTabId = activeTabIdByWorktree[activeWorktreeId]
      if (rememberedActiveTabId) {
        immediateTabIds.add(rememberedActiveTabId)
      }
      const unifiedTabById = new Map(
        (unifiedTabsByWorktree[activeWorktreeId] ?? []).map((unifiedTab) => [
          unifiedTab.id,
          unifiedTab
        ])
      )
      for (const group of groupsByWorktree[activeWorktreeId] ?? []) {
        if (!group.activeTabId) {
          continue
        }
        immediateTabIds.add(group.activeTabId)
        const activeUnifiedTab = unifiedTabById.get(group.activeTabId)
        if (activeUnifiedTab?.contentType === 'terminal') {
          immediateTabIds.add(activeUnifiedTab.entityId)
        }
      }
      for (const tab of worktreeTabs) {
        if (pendingStartupByTabId[tab.id] !== undefined) {
          immediateTabIds.add(tab.id)
        }
      }

      const activationHostSupportsDeferral = canDeferColdActivationTabsForHost({
        executionHostId: activeWorktreeDeferralHostId
      })
      if (lastActivationWorktreeIdRef.current !== activeWorktreeId) {
        lastActivationWorktreeIdRef.current = activeWorktreeId
        const tabById = new Map(worktreeTabs.map((tab) => [tab.id, tab]))
        planColdActivationTabDeferral({
          restrictions: backgroundMountTabIdsByWorktreeRef.current,
          deferredMountTabIdsByWorktree: activationDeferredMountTabIdsByWorktreeRef.current,
          worktreeId: activeWorktreeId,
          allTabIds: worktreeTabs.map((tab) => tab.id),
          isTabLive: hasRegisteredRuntimeTerminalTab,
          // Why: unmounted tabs need byte-watcher coverage; remote or unresolved
          // ownership mounts eagerly because only a confirmed local daemon snapshots them.
          isTabDeferrable: (tabId) => {
            const tab = tabById.get(tabId)
            return (
              terminalParkingEnabled &&
              activationHostSupportsDeferral &&
              tab !== undefined &&
              canWatcherCoverParkedTerminalTab(
                activeWorktreeId,
                tab,
                terminalProviderHasAuthoritativeSnapshot
              )
            )
          },
          immediateTabIds
        })
      } else if (!terminalParkingEnabled || !activationHostSupportsDeferral) {
        backgroundMountTabIdsByWorktreeRef.current.delete(activeWorktreeId)
        activationDeferredMountTabIdsByWorktreeRef.current.delete(activeWorktreeId)
      } else {
        for (const tab of worktreeTabs) {
          if (
            !canWatcherCoverParkedTerminalTab(
              activeWorktreeId,
              tab,
              terminalProviderHasAuthoritativeSnapshot
            )
          ) {
            immediateTabIds.add(tab.id)
          }
        }
        revealActivationDeferredTabs({
          restrictions: backgroundMountTabIdsByWorktreeRef.current,
          deferredMountTabIdsByWorktree: activationDeferredMountTabIdsByWorktreeRef.current,
          worktreeId: activeWorktreeId,
          allTabIds: worktreeTabs.map((tab) => tab.id),
          immediateTabIds
        })
      }
      mountedWorktreeIdsRef.current.add(activeWorktreeId)
    } else {
      lastActivationWorktreeIdRef.current = null
    }

    pruneClosedBackgroundMountTabs(
      backgroundMountTabIdsByWorktreeRef.current,
      mountedWorktreeIdsRef.current,
      tabsByWorktree,
      activationDeferredMountTabIdsByWorktreeRef.current
    )
    const allWorktreeIds = new Set(workspaceSurfaces.map((workspace) => workspace.id))
    for (const id of mountedWorktreeIdsRef.current) {
      if (!allWorktreeIds.has(id)) {
        mountedWorktreeIdsRef.current.delete(id)
        backgroundMountTabIdsByWorktreeRef.current.delete(id)
        activationDeferredMountTabIdsByWorktreeRef.current.delete(id)
      }
    }
    notifyMountRevision()
  }, [
    activationDeferredMountTabIdsByWorktreeRef,
    activeGroupIdByWorktree,
    activeTabId,
    activeTabIdByWorktree,
    activeWorktreeDeferralHostId,
    activeWorktreeId,
    backgroundMountTabIdsByWorktreeRef,
    groupsByWorktree,
    lastActivationWorktreeIdRef,
    mountedWorktreeIdsRef,
    notifyMountRevision,
    pendingStartupByTabId,
    tabsByWorktree,
    terminalParkingEnabled,
    unifiedTabsByWorktree,
    workspaceSessionReady,
    workspaceSurfaces
  ])
}

import type { TabGroup } from '@yiru/protocol/workspace/tabs'

import { buildMirroredHostGroups } from './group-mirror'
import type { resolveRemoteSessionSnapshotSelection } from './selection-reconciliation'
import type { RuntimeMobileSessionTabsResult } from './session-model'
import { pushRecentTabId, sanitizeRecentTabIds } from './store-equality'
import type { buildRemoteSessionSurfaceMirror } from './surface-reconciliation'
import type { RemoteSessionTabsSyncState } from './tabs-state'

export function buildRemoteSessionGroupReconciliation(input: {
  state: RemoteSessionTabsSyncState
  snapshot: RuntimeMobileSessionTabsResult
  worktreeId: string
  now: number
  surfaceMirror: ReturnType<typeof buildRemoteSessionSurfaceMirror>
  selection: ReturnType<typeof resolveRemoteSessionSnapshotSelection>
}) {
  const { state, snapshot, worktreeId, now, surfaceMirror, selection } = input
  const { targetGroupId, retainedUnifiedTabs, mirroredUnifiedTabs, nextUnifiedTabs } = surfaceMirror
  const { validUnifiedTabIds, nextActiveUnifiedTabId, mirroredUnifiedIds, hostToLocalTabId } =
    selection
  const currentGroups = state.groupsByWorktree[worktreeId] ?? []
  const nextGroups = (() => {
    if (!nextUnifiedTabs || nextUnifiedTabs.length === 0) {
      return null
    }
    if (snapshot.tabGroups && snapshot.tabGroups.length > 0) {
      return buildMirroredHostGroups({
        currentGroups,
        hostGroups: snapshot.tabGroups,
        hostToLocalTabId,
        mirroredUnifiedIds,
        nextActiveUnifiedTabId,
        now,
        validUnifiedTabIds,
        worktreeId
      })
    }
    const strippedGroups = currentGroups.map((group) => ({
      ...group,
      tabOrder: group.tabOrder.filter(
        (tabId) => validUnifiedTabIds.has(tabId) && !mirroredUnifiedIds.has(tabId)
      ),
      recentTabIds: sanitizeRecentTabIds(
        group.recentTabIds,
        group.tabOrder.filter(
          (tabId) => validUnifiedTabIds.has(tabId) && !mirroredUnifiedIds.has(tabId)
        )
      )
    }))
    const target = strippedGroups.find((group) => group.id === targetGroupId) ?? {
      id: targetGroupId,
      worktreeId,
      activeTabId: null,
      tabOrder: [],
      recentTabIds: []
    }
    const targetOrder = [
      ...target.tabOrder.filter((tabId) => validUnifiedTabIds.has(tabId)),
      ...mirroredUnifiedTabs.map((tab) => tab.id)
    ]
    const targetActiveTabId =
      nextActiveUnifiedTabId && targetOrder.includes(nextActiveUnifiedTabId)
        ? nextActiveUnifiedTabId
        : target.activeTabId && targetOrder.includes(target.activeTabId)
          ? target.activeTabId
          : (targetOrder[0] ?? null)
    const updatedTarget: TabGroup = {
      ...target,
      worktreeId,
      tabOrder: targetOrder,
      activeTabId: targetActiveTabId,
      recentTabIds: targetActiveTabId
        ? pushRecentTabId(sanitizeRecentTabIds(target.recentTabIds, targetOrder), targetActiveTabId)
        : []
    }
    const merged = strippedGroups.some((group) => group.id === targetGroupId)
      ? strippedGroups.map((group) => (group.id === targetGroupId ? updatedTarget : group))
      : [...strippedGroups, updatedTarget]
    return merged.filter((group) => group.id === targetGroupId || group.tabOrder.length > 0)
  })()
  const nextTabBarOrder = (() => {
    const current = state.tabBarOrderByWorktree[worktreeId] ?? []
    const validTabBarIds = new Set([
      ...retainedUnifiedTabs.map((tab) => tab.id),
      ...mirroredUnifiedTabs.map((tab) => tab.id)
    ])
    const hostTabBarOrder =
      snapshot.tabGroups?.flatMap((group) =>
        group.tabOrder
          .map((tabId) => hostToLocalTabId.get(tabId))
          .filter((tabId): tabId is string => tabId !== undefined && validTabBarIds.has(tabId))
      ) ?? []
    const next: string[] = []
    const push = (tabId: string): void => {
      if (validTabBarIds.has(tabId) && !next.includes(tabId)) {
        next.push(tabId)
      }
    }
    // Why: remote snapshots can arrive after the client staged local browser
    // tabs. Preserve the user's visible mixed order and only append new host
    // tabs; otherwise terminal-browser-terminal can collapse to browser-terminal-terminal.
    for (const tabId of current) {
      push(tabId)
    }
    const hostOrMirroredOrder =
      hostTabBarOrder.length > 0 ? hostTabBarOrder : mirroredUnifiedTabs.map((tab) => tab.id)
    for (const tabId of hostOrMirroredOrder) {
      push(tabId)
    }
    return next
  })()
  return {
    currentGroups,
    nextGroups,
    nextTabBarOrder
  }
}

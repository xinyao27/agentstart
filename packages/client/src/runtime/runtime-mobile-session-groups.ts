import type { Tab, TabGroup, TabGroupLayoutNode } from '@agentstart/protocol/workspace/tabs'
import type { AppState } from '~renderer/store/types'

import {
  getActiveTabNavOrder,
  getGroupVisibleTabOrder,
  type VisibleTabRef
} from '../tab-bar/group-tab-order'
import type { RuntimeMobileSessionTabGroup } from './remote-session/session-model'

function isEditorSurfaceTab(tab: Pick<Tab, 'contentType'>): boolean {
  // Why: mobile file snapshots can faithfully mirror ordinary edit/diff files;
  // conflict review and check-details tabs require metadata this contract lacks.
  return tab.contentType === 'editor' || tab.contentType === 'diff'
}

export function getEditorUnifiedTabsForWorktree(
  state: Pick<AppState, 'unifiedTabsByWorktree'>,
  worktreeId: string
): Tab[] {
  return (state.unifiedTabsByWorktree[worktreeId] ?? []).filter(isEditorSurfaceTab)
}

function applyUnifiedEditorTabIdsToLegacyOrder(
  order: readonly VisibleTabRef[],
  state: Pick<AppState, 'unifiedTabsByWorktree'>,
  worktreeId: string
): VisibleTabRef[] {
  const unifiedEditorTabs = getEditorUnifiedTabsForWorktree(state, worktreeId)
  if (unifiedEditorTabs.length === 0) {
    return [...order]
  }
  const firstUnifiedTabByFileId = new Map<string, string>()
  for (const tab of unifiedEditorTabs) {
    if (!firstUnifiedTabByFileId.has(tab.entityId)) {
      firstUnifiedTabByFileId.set(tab.entityId, tab.id)
    }
  }
  return order.map((item) => {
    if (item.type !== 'editor' || item.tabId) {
      return item
    }
    const tabId = firstUnifiedTabByFileId.get(item.id)
    return tabId ? { ...item, tabId } : item
  })
}

function collectTabGroupLayoutIds(layout: TabGroupLayoutNode | undefined): string[] {
  const result: string[] = []
  const visit = (node: TabGroupLayoutNode | undefined): void => {
    if (!node) {
      return
    }
    if (node.type === 'leaf') {
      result.push(node.groupId)
      return
    }
    visit(node.first)
    visit(node.second)
  }
  visit(layout)
  return result
}

export function pruneTabGroupLayout(
  layout: TabGroupLayoutNode | undefined,
  validGroupIds: ReadonlySet<string>
): TabGroupLayoutNode | null {
  if (!layout) {
    return null
  }
  if (layout.type === 'leaf') {
    return validGroupIds.has(layout.groupId) ? layout : null
  }
  const first = pruneTabGroupLayout(layout.first, validGroupIds)
  const second = pruneTabGroupLayout(layout.second, validGroupIds)
  if (first && second) {
    return { ...layout, first, second }
  }
  return first ?? second
}

function getOrderedTabGroups(
  groups: readonly TabGroup[],
  layout: TabGroupLayoutNode | undefined
): TabGroup[] {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const seen = new Set<string>()
  const ordered: TabGroup[] = []
  for (const groupId of collectTabGroupLayoutIds(layout)) {
    const group = byId.get(groupId)
    if (!group || seen.has(group.id)) {
      continue
    }
    seen.add(group.id)
    ordered.push(group)
  }
  for (const group of groups) {
    if (!seen.has(group.id)) {
      ordered.push(group)
    }
  }
  return ordered
}

export function buildMobileSessionGroupProjection(
  state: AppState,
  worktreeId: string,
  ids: {
    terminalIds: string[]
    editorIds: string[]
    browserIds: string[]
  }
): {
  order: VisibleTabRef[]
  tabGroups?: RuntimeMobileSessionTabGroup[]
  tabGroupLayout?: TabGroupLayoutNode | null
} {
  const groups = state.groupsByWorktree[worktreeId] ?? []
  if (groups.length === 0) {
    return {
      order: applyUnifiedEditorTabIdsToLegacyOrder(
        getActiveTabNavOrder(state, worktreeId, {
          editorIds: ids.editorIds
        }),
        state,
        worktreeId
      )
    }
  }

  const terminalIds = new Set(ids.terminalIds)
  const editorIds = new Set(ids.editorIds)
  const browserIds = new Set(ids.browserIds)
  const tabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  const order: VisibleTabRef[] = []
  const tabGroups: RuntimeMobileSessionTabGroup[] = []

  const layoutByWorktree = state.layoutByWorktree ?? {}
  for (const group of getOrderedTabGroups(groups, layoutByWorktree[worktreeId])) {
    const groupTabs = tabs.filter((tab) => tab.groupId === group.id)
    const visibleOrder = getGroupVisibleTabOrder(
      group,
      groupTabs,
      terminalIds,
      editorIds,
      browserIds
    )
    if (visibleOrder.length === 0) {
      continue
    }
    const tabOrder = visibleOrder.map((item) => item.tabId ?? item.id)
    const tabOrderSet = new Set(tabOrder)
    // Why: persisted split groups can contain very large tab orders; append
    // iteratively so mobile sync does not hit V8's argument-list limit.
    for (const item of visibleOrder) {
      order.push(item)
    }
    tabGroups.push({
      id: group.id,
      activeTabId:
        group.activeTabId && tabOrderSet.has(group.activeTabId) ? group.activeTabId : null,
      tabOrder,
      recentTabIds: group.recentTabIds?.filter((tabId) => tabOrderSet.has(tabId)) ?? []
    })
  }

  appendUngroupedBrowserTabs({
    activeBrowserId: state.activeBrowserTabIdByWorktree[worktreeId] ?? null,
    activeGroupId: state.activeGroupIdByWorktree[worktreeId] ?? null,
    browserIds: ids.browserIds,
    groups,
    order,
    tabGroups
  })
  const validGroupIds = new Set(tabGroups.map((group) => group.id))
  return {
    order,
    tabGroups,
    tabGroupLayout: pruneTabGroupLayout(layoutByWorktree[worktreeId], validGroupIds)
  }
}

function appendUngroupedBrowserTabs(input: {
  activeBrowserId: string | null
  activeGroupId: string | null
  browserIds: readonly string[]
  groups: readonly TabGroup[]
  order: VisibleTabRef[]
  tabGroups: RuntimeMobileSessionTabGroup[]
}): void {
  const emittedIds = new Set(
    input.order.filter((item) => item.type === 'browser').map((item) => item.id)
  )
  const missingIds = input.browserIds.filter((browserId) => !emittedIds.has(browserId))
  if (missingIds.length === 0) {
    return
  }
  const sourceGroup =
    input.groups.find((group) => group.id === input.activeGroupId) ?? input.groups[0]
  if (!sourceGroup) {
    for (const browserId of missingIds) {
      input.order.push({ type: 'browser', id: browserId })
    }
    return
  }
  const groupIndex = input.tabGroups.findIndex((group) => group.id === sourceGroup.id)
  const projectedGroup: RuntimeMobileSessionTabGroup =
    groupIndex >= 0
      ? input.tabGroups[groupIndex]!
      : {
          id: sourceGroup.id,
          activeTabId: null,
          tabOrder: [],
          recentTabIds: []
        }
  const activeBrowserId = missingIds.includes(input.activeBrowserId ?? '')
    ? input.activeBrowserId
    : null
  const nextGroup = {
    ...projectedGroup,
    activeTabId: activeBrowserId ?? projectedGroup.activeTabId,
    tabOrder: [...projectedGroup.tabOrder, ...missingIds],
    recentTabIds:
      activeBrowserId && !projectedGroup.recentTabIds?.includes(activeBrowserId)
        ? [...(projectedGroup.recentTabIds ?? []), activeBrowserId]
        : projectedGroup.recentTabIds
  }
  if (groupIndex >= 0) {
    input.tabGroups[groupIndex] = nextGroup
  } else {
    input.tabGroups.push(nextGroup)
  }
  for (const browserId of missingIds) {
    input.order.push({ type: 'browser', id: browserId })
  }
}

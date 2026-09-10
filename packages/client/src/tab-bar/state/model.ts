import type { Tab, TabGroupLayoutNode, TerminalTab } from '@agentstart/protocol/workspace/tabs'
import { setRemoteSessionTabPropsCommand } from '~renderer/runtime/remote-session/commands'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import type { AppState } from '../../store/types'
import { dedupeTabOrder, findTabAndWorktree } from './group-state'

// Why: keep the TerminalTab (tabsByWorktree) pin in sync with the unified-tab
// pin so reconcile's `existing.isPinned` fallback stays authoritative locally.
// Returns an empty patch when the tab isn't a persisted TerminalTab.
export function patchTerminalTabPinned(
  tabsByWorktree: Record<string, TerminalTab[]>,
  worktreeId: string,
  tabId: string,
  isPinned: boolean
): Partial<Pick<AppState, 'tabsByWorktree'>> {
  const tabs = tabsByWorktree[worktreeId]
  if (!tabs?.some((tab) => tab.id === tabId)) {
    return {}
  }
  return {
    tabsByWorktree: {
      ...tabsByWorktree,
      [worktreeId]: tabs.map((tab) => (tab.id === tabId ? { ...tab, isPinned } : tab))
    }
  }
}

// Why: pin is host-authoritative for remote-server tabs, so mirror it to the
// host (like setTabColor) or it's lost on reconnect/restart/other clients.
// Dynamic import keeps this store slice off the runtime layer.
export function mirrorTabPinnedToHost(state: AppState, tabId: string, isPinned: boolean): void {
  const found = findTabAndWorktree(state.unifiedTabsByWorktree, tabId)
  // Why: only terminal tab pins are persisted host-side today (browser/editor
  // tracked in #5729), so skip the RPC for other types instead of a no-op round
  // trip.
  const environmentId = found && getRuntimeEnvironmentIdForWorktree(state, found.worktreeId)
  if (!found || found.tab.contentType !== 'terminal' || !environmentId) {
    return
  }
  setRemoteSessionTabPropsCommand({
    environmentId,
    worktreeId: found.worktreeId,
    tabId,
    isPinned
  })
}

export function buildSplitNode(
  existingGroupId: string,
  newGroupId: string,
  direction: 'horizontal' | 'vertical',
  position: 'first' | 'second'
): TabGroupLayoutNode {
  const existingLeaf: TabGroupLayoutNode = { type: 'leaf', groupId: existingGroupId }
  const newLeaf: TabGroupLayoutNode = { type: 'leaf', groupId: newGroupId }
  return {
    type: 'split',
    direction,
    first: position === 'first' ? newLeaf : existingLeaf,
    second: position === 'second' ? newLeaf : existingLeaf,
    ratio: 0.5
  }
}

export function replaceLeaf(
  root: TabGroupLayoutNode,
  targetGroupId: string,
  replacement: TabGroupLayoutNode
): TabGroupLayoutNode {
  if (root.type === 'leaf') {
    return root.groupId === targetGroupId ? replacement : root
  }
  return {
    ...root,
    first: replaceLeaf(root.first, targetGroupId, replacement),
    second: replaceLeaf(root.second, targetGroupId, replacement)
  }
}

export function updateSplitRatio(
  root: TabGroupLayoutNode,
  path: string[],
  ratio: number
): TabGroupLayoutNode {
  if (path.length === 0) {
    return root.type === 'split' ? { ...root, ratio } : root
  }
  if (root.type !== 'split') {
    return root
  }
  const [segment, ...rest] = path
  if (segment === 'first') {
    return { ...root, first: updateSplitRatio(root.first, rest, ratio) }
  }
  if (segment === 'second') {
    return { ...root, second: updateSplitRatio(root.second, rest, ratio) }
  }
  return root
}

function findFirstLeaf(root: TabGroupLayoutNode): string {
  return root.type === 'leaf' ? root.groupId : findFirstLeaf(root.first)
}

export function partitionPinnedTabOrder(
  tabOrder: string[],
  tabs: Tab[],
  movingTabId: string
): string[] {
  const tabById = new Map(tabs.map((tab) => [tab.id, tab]))
  const withoutMoving = dedupeTabOrder(tabOrder).filter((id) => id !== movingTabId)
  const pinnedIds = withoutMoving.filter((id) => tabById.get(id)?.isPinned)
  const unpinnedIds = withoutMoving.filter((id) => !tabById.get(id)?.isPinned)
  return [...pinnedIds, movingTabId, ...unpinnedIds]
}

export function applyTabOrderSortValues(tabs: Tab[], tabOrder: string[]): Tab[] {
  const orderMap = new Map(tabOrder.map((id, index) => [id, index]))
  return tabs.map((tab) => {
    const sortOrder = orderMap.get(tab.id)
    return sortOrder === undefined ? tab : { ...tab, sortOrder }
  })
}

function isReplaceablePreviewContentType(contentType: Tab['contentType']): boolean {
  return (
    contentType === 'editor' ||
    contentType === 'diff' ||
    contentType === 'conflict-review' ||
    contentType === 'check-details'
  )
}

export function canReplacePreviewContentType(
  incomingContentType: Tab['contentType'],
  existingContentType: Tab['contentType']
): boolean {
  if (isReplaceablePreviewContentType(incomingContentType)) {
    return isReplaceablePreviewContentType(existingContentType)
  }
  return existingContentType === incomingContentType
}

export function findSiblingGroupId(root: TabGroupLayoutNode, targetGroupId: string): string | null {
  if (root.type === 'leaf') {
    return null
  }
  if (root.first.type === 'leaf' && root.first.groupId === targetGroupId) {
    return root.second.type === 'leaf' ? root.second.groupId : findFirstLeaf(root.second)
  }
  if (root.second.type === 'leaf' && root.second.groupId === targetGroupId) {
    return root.first.type === 'leaf' ? root.first.groupId : findFirstLeaf(root.first)
  }
  return (
    findSiblingGroupId(root.first, targetGroupId) ?? findSiblingGroupId(root.second, targetGroupId)
  )
}

function removeLeaf(root: TabGroupLayoutNode, targetGroupId: string): TabGroupLayoutNode | null {
  if (root.type === 'leaf') {
    return root.groupId === targetGroupId ? null : root
  }
  if (root.first.type === 'leaf' && root.first.groupId === targetGroupId) {
    return root.second
  }
  if (root.second.type === 'leaf' && root.second.groupId === targetGroupId) {
    return root.first
  }
  const first = removeLeaf(root.first, targetGroupId)
  const second = removeLeaf(root.second, targetGroupId)
  if (first === null) {
    return second
  }
  if (second === null) {
    return first
  }
  return { ...root, first, second }
}

export function collapseGroupLayout(
  layoutByWorktree: Record<string, TabGroupLayoutNode>,
  activeGroupIdByWorktree: Record<string, string>,
  worktreeId: string,
  groupId: string,
  fallbackGroupId?: string | null
): {
  layoutByWorktree: Record<string, TabGroupLayoutNode>
  activeGroupIdByWorktree: Record<string, string>
} {
  const currentLayout = layoutByWorktree[worktreeId]
  if (!currentLayout) {
    return { layoutByWorktree, activeGroupIdByWorktree }
  }
  const siblingId = findSiblingGroupId(currentLayout, groupId)
  const collapsed = removeLeaf(currentLayout, groupId)
  const nextLayoutByWorktree = { ...layoutByWorktree }
  if (collapsed) {
    nextLayoutByWorktree[worktreeId] = collapsed
  } else {
    delete nextLayoutByWorktree[worktreeId]
  }
  return {
    layoutByWorktree: nextLayoutByWorktree,
    activeGroupIdByWorktree: {
      ...activeGroupIdByWorktree,
      [worktreeId]: siblingId ?? fallbackGroupId ?? activeGroupIdByWorktree[worktreeId]
    }
  }
}

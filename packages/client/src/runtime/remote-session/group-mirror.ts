import type { TabGroup, TabGroupLayoutNode, TerminalTab } from '@yiru/protocol/workspace/tabs'

import { toRemoteTerminalSurfaceTabId } from '../remote-terminal-surface-id'
import { resolveRemoteSessionReorderedOrder } from './reorder-intent'
import type { RuntimeMobileSessionTabsResult, RuntimeMobileSessionTabGroup } from './session-model'
import { pushRecentTabId, sanitizeRecentTabIds } from './store-equality'
import type {
  MirroredBrowserTab,
  MirroredEditorTab,
  TerminalSurface,
  RemoteSessionTabsSyncState
} from './tabs-state'
import {
  hostSessionTabIdByLocalKey,
  hostSessionTabMappingKey,
  WEB_SESSION_GROUP_PREFIX
} from './tabs-tracking'

export function chooseTargetGroupId(
  state: RemoteSessionTabsSyncState,
  snapshot: RuntimeMobileSessionTabsResult
): string {
  const groups = state.groupsByWorktree[snapshot.worktree] ?? []
  const layoutGroupIds = collectLayoutGroupIds(state.layoutByWorktree[snapshot.worktree])
  const inRenderedLayout = (groupId: string | null | undefined): boolean =>
    Boolean(groupId && (layoutGroupIds.size === 0 || layoutGroupIds.has(groupId)))
  const preferred =
    groups.find((group) => group.id === snapshot.activeGroupId && inRenderedLayout(group.id)) ??
    groups.find(
      (group) =>
        group.id === state.activeGroupIdByWorktree[snapshot.worktree] && inRenderedLayout(group.id)
    ) ??
    groups.find((group) => inRenderedLayout(group.id))
  // Why: host snapshots can reference desktop-only group ids. The web layout's
  // rendered group is the only safe CSS anchor target for mirrored panes.
  const firstRenderedLayoutGroupId = layoutGroupIds.values().next().value as string | undefined
  return (
    preferred?.id ??
    firstRenderedLayoutGroupId ??
    snapshot.activeGroupId ??
    `${WEB_SESSION_GROUP_PREFIX}${snapshot.worktree}`
  )
}

export function collectLayoutGroupIds(layout: TabGroupLayoutNode | undefined): Set<string> {
  const result = new Set<string>()
  const visit = (node: TabGroupLayoutNode | undefined): void => {
    if (!node) {
      return
    }
    if (node.type === 'leaf') {
      result.add(node.groupId)
      return
    }
    visit(node.first)
    visit(node.second)
  }
  visit(layout)
  return result
}

export function buildHostGroupIdByTabId(
  hostGroups: readonly RuntimeMobileSessionTabGroup[] | undefined
): Map<string, string> {
  const result = new Map<string, string>()
  for (const group of hostGroups ?? []) {
    for (const tabId of group.tabOrder) {
      result.set(tabId, group.id)
    }
    if (group.activeTabId) {
      result.set(group.activeTabId, group.id)
    }
  }
  return result
}

export function pruneTabGroupLayout(
  layout: TabGroupLayoutNode | null | undefined,
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

export function appendTabGroupLayout(
  first: TabGroupLayoutNode | null,
  second: TabGroupLayoutNode | null
): TabGroupLayoutNode | null {
  if (!first) {
    return second
  }
  if (!second) {
    return first
  }
  return {
    type: 'split',
    direction: 'horizontal',
    first,
    second
  }
}

export function tabGroupLayoutEqual(
  a: TabGroupLayoutNode | null | undefined,
  b: TabGroupLayoutNode | null | undefined
): boolean {
  if (!a || !b) {
    return !a && !b
  }
  if (a.type !== b.type) {
    return false
  }
  if (a.type === 'leaf') {
    return b.type === 'leaf' && a.groupId === b.groupId
  }
  return (
    b.type === 'split' &&
    a.direction === b.direction &&
    a.ratio === b.ratio &&
    tabGroupLayoutEqual(a.first, b.first) &&
    tabGroupLayoutEqual(a.second, b.second)
  )
}

function mapHostRecentTabIds(
  recentTabIds: readonly string[] | undefined,
  hostToLocalTabId: ReadonlyMap<string, string>,
  tabOrder: readonly string[]
): string[] {
  if (!recentTabIds || recentTabIds.length === 0) {
    return []
  }
  const valid = new Set(tabOrder)
  return sanitizeRecentTabIds(
    recentTabIds.map((tabId) => hostToLocalTabId.get(tabId) ?? '').filter(Boolean),
    [...valid]
  )
}

export function buildHostToLocalTabIdMap({
  terminalSurfaces,
  terminalTabs,
  browserTabs,
  editorTabs
}: {
  terminalSurfaces: readonly TerminalSurface[]
  terminalTabs: readonly TerminalTab[]
  browserTabs: readonly MirroredBrowserTab[]
  editorTabs: readonly MirroredEditorTab[]
}): Map<string, string> {
  const hostToLocal = new Map<string, string>()
  const terminalIds = new Set(terminalTabs.map((tab) => tab.id))
  for (const surface of terminalSurfaces) {
    const localId = toRemoteTerminalSurfaceTabId(surface.parentTabId)
    if (terminalIds.has(localId)) {
      hostToLocal.set(surface.parentTabId, localId)
      hostToLocal.set(surface.id, localId)
    }
  }
  for (const entry of browserTabs) {
    hostToLocal.set(entry.hostTabId, entry.unifiedTab.id)
    hostToLocal.set(entry.unifiedTab.id, entry.unifiedTab.id)
  }
  for (const entry of editorTabs) {
    hostToLocal.set(entry.hostTabId, entry.unifiedTab.id)
  }
  return hostToLocal
}

export function updateHostSessionTabIdMappings(args: {
  environmentId: string
  worktreeId: string
  terminalSurfaces: readonly TerminalSurface[]
  terminalTabs: readonly TerminalTab[]
  browserTabs: readonly MirroredBrowserTab[]
  editorTabs: readonly MirroredEditorTab[]
}): void {
  const keyPrefix = `${args.environmentId}:${args.worktreeId}:`
  for (const key of hostSessionTabIdByLocalKey.keys()) {
    if (key.startsWith(keyPrefix)) {
      hostSessionTabIdByLocalKey.delete(key)
    }
  }

  const mirroredTerminalIds = new Set(args.terminalTabs.map((tab) => tab.id))
  for (const surface of args.terminalSurfaces) {
    const localId = toRemoteTerminalSurfaceTabId(surface.parentTabId)
    if (mirroredTerminalIds.has(localId)) {
      hostSessionTabIdByLocalKey.set(
        hostSessionTabMappingKey({ ...args, tabId: localId }),
        surface.parentTabId
      )
    }
  }
  for (const entry of args.browserTabs) {
    hostSessionTabIdByLocalKey.set(
      hostSessionTabMappingKey({ ...args, tabId: entry.unifiedTab.id }),
      entry.hostTabId
    )
  }
  for (const entry of args.editorTabs) {
    hostSessionTabIdByLocalKey.set(
      hostSessionTabMappingKey({ ...args, tabId: entry.unifiedTab.id }),
      entry.hostTabId
    )
  }
}

export function buildMirroredHostGroups({
  currentGroups,
  hostGroups,
  hostToLocalTabId,
  mirroredUnifiedIds,
  nextActiveUnifiedTabId,
  now,
  validUnifiedTabIds,
  worktreeId
}: {
  currentGroups: readonly TabGroup[]
  hostGroups: readonly RuntimeMobileSessionTabGroup[]
  hostToLocalTabId: ReadonlyMap<string, string>
  mirroredUnifiedIds: ReadonlySet<string>
  nextActiveUnifiedTabId: string | null
  now: number
  validUnifiedTabIds: ReadonlySet<string>
  worktreeId: string
}): TabGroup[] | null {
  const strippedGroups = currentGroups.map((group) => {
    const tabOrder = group.tabOrder.filter(
      (tabId) => validUnifiedTabIds.has(tabId) && !mirroredUnifiedIds.has(tabId)
    )
    return {
      ...group,
      tabOrder,
      recentTabIds: sanitizeRecentTabIds(group.recentTabIds, tabOrder)
    }
  })
  const groupsById = new Map(strippedGroups.map((group) => [group.id, group]))
  const orderedGroups: TabGroup[] = []
  const seen = new Set<string>()

  for (const hostGroup of hostGroups) {
    const existing = groupsById.get(hostGroup.id)
    const localHostOrder = hostGroup.tabOrder
      .map((tabId) => hostToLocalTabId.get(tabId))
      .filter((tabId): tabId is string => tabId !== undefined && validUnifiedTabIds.has(tabId))
    const hostTabOrder = [
      ...(existing?.tabOrder.filter((tabId) => !localHostOrder.includes(tabId)) ?? []),
      ...localHostOrder
    ]
    // Why: a pending client reorder for this group wins over a stale pre-move
    // host order until the host echoes the move (or membership changes).
    const tabOrder = resolveRemoteSessionReorderedOrder(worktreeId, hostGroup.id, hostTabOrder, now)
    if (tabOrder.length === 0) {
      continue
    }
    const activeFromHost =
      hostGroup.activeTabId !== null ? (hostToLocalTabId.get(hostGroup.activeTabId) ?? null) : null
    const activeTabId =
      nextActiveUnifiedTabId && tabOrder.includes(nextActiveUnifiedTabId)
        ? nextActiveUnifiedTabId
        : activeFromHost && tabOrder.includes(activeFromHost)
          ? activeFromHost
          : existing?.activeTabId && tabOrder.includes(existing.activeTabId)
            ? existing.activeTabId
            : (tabOrder[0] ?? null)
    orderedGroups.push({
      id: hostGroup.id,
      worktreeId,
      tabOrder,
      activeTabId,
      recentTabIds: activeTabId
        ? pushRecentTabId(
            mapHostRecentTabIds(hostGroup.recentTabIds, hostToLocalTabId, tabOrder),
            activeTabId
          )
        : []
    })
    seen.add(hostGroup.id)
  }

  for (const group of strippedGroups) {
    if (!seen.has(group.id) && group.tabOrder.length > 0) {
      orderedGroups.push(group)
    }
  }

  return orderedGroups.length > 0 ? orderedGroups : null
}

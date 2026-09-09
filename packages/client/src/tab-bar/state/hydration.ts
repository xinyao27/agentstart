import { isValidTerminalTabId } from '@yiru/protocol/terminal/tab-identity'
import type { WorkspaceSessionState } from '@yiru/protocol/workspace/session'
import type { Tab, TabGroup, TabGroupLayoutNode } from '@yiru/protocol/workspace/tabs'
import { createBrowserUuid } from '~renderer/browser/uuid'

import {
  dedupeTabOrder,
  getPersistedEditFileIdsByWorktree,
  isTransientEditorContentType,
  sanitizeRecentTabIds,
  selectHydratedActiveGroupId
} from './group-state'
import { hydrateLegacyTabFormat } from './legacy-hydration'

export type HydratedTabState = {
  unifiedTabsByWorktree: Record<string, Tab[]>
  groupsByWorktree: Record<string, TabGroup[]>
  activeGroupIdByWorktree: Record<string, string>
  layoutByWorktree: Record<string, TabGroupLayoutNode>
}

type PromotedEditorTab = {
  groupId: string
  replacedTabId: string
  tabId: string
}

export function pruneTabGroupLayoutForGroups(
  root: TabGroupLayoutNode,
  validGroupIds: Set<string>
): TabGroupLayoutNode | null {
  if (root.type === 'leaf') {
    return validGroupIds.has(root.groupId) ? root : null
  }

  const first = pruneTabGroupLayoutForGroups(root.first, validGroupIds)
  const second = pruneTabGroupLayoutForGroups(root.second, validGroupIds)

  if (first === null) {
    return second
  }
  if (second === null) {
    return first
  }
  if (first === root.first && second === root.second) {
    return root
  }

  return { ...root, first, second }
}

function hydrateUnifiedFormat(
  session: WorkspaceSessionState,
  validWorktreeIds: Set<string>
): HydratedTabState {
  const tabsByWorktree: Record<string, Tab[]> = {}
  const groupsByWorktree: Record<string, TabGroup[]> = {}
  const activeGroupIdByWorktree: Record<string, string> = {}
  const layoutByWorktree: Record<string, TabGroupLayoutNode> = {}
  const promotedEditorTabByWorktree: Record<string, PromotedEditorTab> = {}
  const persistedEditFileIdsByWorktree = getPersistedEditFileIdsByWorktree(session)

  for (const [worktreeId, tabs] of Object.entries(session.unifiedTabs!)) {
    if (!validWorktreeIds.has(worktreeId)) {
      continue
    }
    const persistedEditFileIds = persistedEditFileIdsByWorktree[worktreeId] ?? new Set<string>()
    const persistedGroups = session.tabGroups?.[worktreeId] ?? []
    const preferredGroupId = session.activeGroupIdByWorktree?.[worktreeId]
    const persistedActiveFileId = session.activeFileIdByWorktree?.[worktreeId]
    const persistedActiveTabType = session.activeTabTypeByWorktree?.[worktreeId]
    const restoredActiveFile = persistedActiveFileId
      ? (session.openFilesByWorktree?.[worktreeId] ?? []).find(
          (file) => file.filePath === persistedActiveFileId
        )
      : undefined
    if (tabs.length === 0 && (!restoredActiveFile || persistedGroups.length === 0)) {
      continue
    }
    const generatedTitleByTerminalId = new Map(
      (session.tabsByWorktree[worktreeId] ?? [])
        .filter((tab) => tab.generatedTitle?.trim())
        .map((tab) => [tab.id, tab.generatedTitle!.trim()])
    )
    const quickCommandLabelByTerminalId = new Map(
      (session.tabsByWorktree[worktreeId] ?? [])
        .filter((tab) => tab.quickCommandLabel?.trim())
        .map((tab) => [tab.id, tab.quickCommandLabel!.trim()])
    )
    const hydratedTabs = [...tabs]
      .map((tab) => ({
        ...tab,
        entityId: tab.entityId ?? tab.id
      }))
      .map((tab) => {
        if (tab.contentType !== 'terminal') {
          return tab
        }
        const quickCommandLabel = tab.quickCommandLabel?.trim()
          ? tab.quickCommandLabel.trim()
          : quickCommandLabelByTerminalId.get(tab.entityId)
        const generatedLabel = generatedTitleByTerminalId.get(tab.entityId)
        return {
          ...tab,
          ...(quickCommandLabel ? { quickCommandLabel } : {}),
          ...(!tab.generatedLabel?.trim() && generatedLabel ? { generatedLabel } : {})
        }
      })
      .filter((tab) => {
        if (tab.contentType === 'terminal') {
          // Why: old web-client sessions could persist host surface ids
          // containing "::"; those are invalid pane-key tab ids.
          return isValidTerminalTabId(tab.id) && isValidTerminalTabId(tab.entityId)
        }
        if (!isTransientEditorContentType(tab.contentType)) {
          return true
        }
        // Why: restore skips backing editor state for transient diff/conflict
        // items. Hydration must drop their tab chrome too or the split group
        // comes back pointing at a document that no longer exists.
        return persistedEditFileIds.has(tab.entityId)
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt)
    const preferredGroup =
      persistedGroups.find((group) => group.id === preferredGroupId) ?? persistedGroups[0]
    const replacedTabId = preferredGroup?.activeTabId
    const hasRestoredActiveFileTab = hydratedTabs.some(
      (tab) => tab.contentType === 'editor' && tab.entityId === restoredActiveFile?.filePath
    )
    if (
      restoredActiveFile &&
      persistedActiveTabType === 'editor' &&
      preferredGroup &&
      replacedTabId &&
      !hydratedTabs.some((tab) => tab.id === replacedTabId) &&
      !hasRestoredActiveFileTab
    ) {
      const tabId = createBrowserUuid()
      // Why: session parsing removes retired Explorer/Changes tabs before
      // hydration. If one owned the active file, promote that file into the
      // same group as a real editor tab instead of losing the visible surface.
      hydratedTabs.push({
        id: tabId,
        entityId: restoredActiveFile.filePath,
        groupId: preferredGroup.id,
        worktreeId,
        contentType: 'editor',
        label: restoredActiveFile.relativePath,
        customLabel: null,
        color: null,
        sortOrder: hydratedTabs.length,
        createdAt: Date.now(),
        isPreview: restoredActiveFile.isPreview,
        isPinned: false
      })
      promotedEditorTabByWorktree[worktreeId] = {
        groupId: preferredGroup.id,
        replacedTabId,
        tabId
      }
    }
    tabsByWorktree[worktreeId] = hydratedTabs
  }

  for (const [worktreeId, groups] of Object.entries(session.tabGroups!)) {
    if (!validWorktreeIds.has(worktreeId)) {
      continue
    }
    if (groups.length === 0) {
      continue
    }

    const validTabIds = new Set((tabsByWorktree[worktreeId] ?? []).map((t) => t.id))
    const promotedEditorTab = promotedEditorTabByWorktree[worktreeId]
    const validatedGroups = groups.map((g) => {
      // Why: persisted tabOrder can contain duplicates from older buggy
      // writes. Deduping during hydration restores the store invariant before
      // later group operations branch on tab counts or neighbors.
      const restoredTabOrder =
        promotedEditorTab?.groupId === g.id
          ? g.tabOrder.map((tabId) =>
              tabId === promotedEditorTab.replacedTabId ? promotedEditorTab.tabId : tabId
            )
          : g.tabOrder
      const tabOrder = dedupeTabOrder(restoredTabOrder.filter((tid) => validTabIds.has(tid)))
      const restoredActiveTabId =
        promotedEditorTab?.groupId === g.id && g.activeTabId === promotedEditorTab.replacedTabId
          ? promotedEditorTab.tabId
          : g.activeTabId
      const activeTabId =
        restoredActiveTabId && validTabIds.has(restoredActiveTabId) ? restoredActiveTabId : null
      // Why: persisted MRU may reference tabs that no longer exist. Sanitize
      // against the live tabOrder, then ensure the current active tab sits at
      // the tail so the first close after restore jumps back to the previous
      // tab rather than falling through to neighbor selection.
      const sanitizedRecent = sanitizeRecentTabIds(g.recentTabIds, tabOrder)
      const recentTabIds =
        activeTabId && sanitizedRecent.at(-1) !== activeTabId
          ? [...sanitizedRecent.filter((id) => id !== activeTabId), activeTabId]
          : sanitizedRecent
      return {
        ...g,
        tabOrder,
        activeTabId,
        recentTabIds
      }
    })
    const hydratedGroups = validatedGroups.filter((group, index) => {
      const hadTabsBeforeHydration = groups[index]?.tabOrder.length > 0
      if (group.tabOrder.length > 0) {
        return true
      }
      if (hadTabsBeforeHydration) {
        return false
      }
      return validatedGroups.every((candidate) => candidate.tabOrder.length === 0)
    })
    if (hydratedGroups.length === 0) {
      if ((tabsByWorktree[worktreeId] ?? []).length === 0) {
        delete tabsByWorktree[worktreeId]
      }
      continue
    }

    groupsByWorktree[worktreeId] = hydratedGroups
    const activeGroupId = selectHydratedActiveGroupId(
      hydratedGroups,
      session.activeGroupIdByWorktree?.[worktreeId]
    )
    if (activeGroupId) {
      activeGroupIdByWorktree[worktreeId] = activeGroupId
    }
    const hydratedGroupIds = new Set(hydratedGroups.map((group) => group.id))
    const hydratedLayout = session.tabGroupLayouts?.[worktreeId]
      ? pruneTabGroupLayoutForGroups(session.tabGroupLayouts[worktreeId], hydratedGroupIds)
      : null
    layoutByWorktree[worktreeId] = hydratedLayout ?? {
      type: 'leaf',
      // Why: if transient-only groups were removed during hydration, the
      // persisted split tree can collapse to a single surviving group. The
      // fallback leaf keeps restore aligned with the remaining real tabs.
      groupId: hydratedGroups[0].id
    }
  }

  return {
    unifiedTabsByWorktree: tabsByWorktree,
    groupsByWorktree,
    activeGroupIdByWorktree,
    layoutByWorktree
  }
}

export function buildHydratedTabState(
  session: WorkspaceSessionState,
  validWorktreeIds: Set<string>
): HydratedTabState {
  if (session.unifiedTabs && session.tabGroups) {
    return hydrateUnifiedFormat(session, validWorktreeIds)
  }
  return hydrateLegacyTabFormat(session, validWorktreeIds)
}

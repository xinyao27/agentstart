import type { Tab, TabGroup, WorkspaceVisibleTabType } from '@agentstart/protocol/workspace/tabs'
import type { StoreApi } from 'zustand'
import type { AppState } from '~renderer/store/types'

import type { WorkspacePanelEditorOpenOptions } from './file-model'
import type { EditorSlice } from './store-contract'

export function openWorkspaceEditorItem(
  state: AppState,
  fileId: string,
  worktreeId: string,
  label: string,
  contentType: 'editor' | 'diff' | 'conflict-review' | 'check-details',
  isPreview?: boolean,
  targetGroupId?: string
): string {
  const resolvedGroupId = resolveEditorOpenTargetGroupId(state, worktreeId, targetGroupId)
  if (resolvedGroupId) {
    const existing = state.findTabForEntityInGroup?.(
      worktreeId,
      resolvedGroupId,
      fileId,
      contentType
    )
    if (existing) {
      // Why: sidebar preview reopens should focus the tab without making it
      // permanent; explicit tab activation still promotes previews by default.
      state.activateTab?.(existing.id, { preservePreview: isPreview })
      return existing.id
    }
  }
  const created = state.createUnifiedTab?.(worktreeId, contentType, {
    entityId: fileId,
    label,
    isPreview,
    ...(resolvedGroupId ? { targetGroupId: resolvedGroupId } : {})
  })
  return created?.id ?? fileId
}

export function setWorkspacePanelEditorTarget(
  set: StoreApi<AppState>['setState'],
  panelTabId: string | undefined,
  fileId: string
): boolean {
  if (!panelTabId) {
    return false
  }
  set((state) => ({
    workspacePanelEditorFileIdByTab: {
      ...state.workspacePanelEditorFileIdByTab,
      [panelTabId]: fileId
    }
  }))
  return true
}

export function resolveSourceControlWorkspacePanelTabId(
  requestedTarget?: WorkspacePanelEditorOpenOptions
): string | undefined {
  return requestedTarget?.workspacePanelTabId
}

export function isEditorTabContentType(contentType: Tab['contentType']): boolean {
  return (
    contentType === 'editor' ||
    contentType === 'diff' ||
    contentType === 'conflict-review' ||
    contentType === 'check-details'
  )
}

function getGroupActiveTab(group: TabGroup, tabsById: Map<string, Tab>): Tab | null {
  return group.activeTabId ? (tabsById.get(group.activeTabId) ?? null) : null
}

function getMostRecentEditorTabForGroup(group: TabGroup, tabsById: Map<string, Tab>): Tab | null {
  const seen = new Set<string>()
  const candidateIdLists = [group.recentTabIds ?? [], group.tabOrder]
  for (const candidateIds of candidateIdLists) {
    for (let index = candidateIds.length - 1; index >= 0; index -= 1) {
      const tabId = candidateIds[index]
      if (!tabId || seen.has(tabId)) {
        continue
      }
      seen.add(tabId)
      const tab = tabsById.get(tabId)
      if (tab?.groupId === group.id && isEditorTabContentType(tab.contentType)) {
        return tab
      }
    }
  }
  return null
}

export function resolveEditorOpenTargetGroupId(
  state: Pick<AppState, 'activeGroupIdByWorktree' | 'groupsByWorktree' | 'unifiedTabsByWorktree'>,
  worktreeId: string,
  explicitTargetGroupId?: string
): string | undefined {
  if (explicitTargetGroupId) {
    return explicitTargetGroupId
  }

  const groups = state.groupsByWorktree?.[worktreeId] ?? []
  if (groups.length === 0) {
    return undefined
  }

  const fallbackGroup = groups[0]
  if (!fallbackGroup) {
    return undefined
  }
  const tabsById = new Map(
    (state.unifiedTabsByWorktree?.[worktreeId] ?? []).map((tab) => [tab.id, tab])
  )
  const activeGroup =
    groups.find((group) => group.id === state.activeGroupIdByWorktree?.[worktreeId]) ??
    fallbackGroup
  const activeTab = getGroupActiveTab(activeGroup, tabsById)
  if (!activeTab || isEditorTabContentType(activeTab.contentType)) {
    return activeGroup.id
  }

  // Why: file explorer opens should reuse an existing editor pane when the
  // focused pane is an agent terminal, instead of turning that terminal pane
  // into an editor tab.
  const visibleEditorGroup = groups.find((group) => {
    if (group.id === activeGroup.id) {
      return false
    }
    const groupActiveTab = getGroupActiveTab(group, tabsById)
    return groupActiveTab ? isEditorTabContentType(groupActiveTab.contentType) : false
  })
  if (visibleEditorGroup) {
    return visibleEditorGroup.id
  }

  const recentEditorGroup = groups.find(
    (group) => group.id !== activeGroup.id && getMostRecentEditorTabForGroup(group, tabsById)
  )
  return recentEditorGroup?.id ?? activeGroup.id
}

export function buildEditorActiveResult(
  state: Pick<EditorSlice, 'activeFileIdByWorktree' | 'activeTabTypeByWorktree'>,
  worktreeId: string,
  fileId: string
): {
  activeFileId?: string
  activeTabType?: 'editor'
  activeFileIdByWorktree: Record<string, string | null>
  activeTabTypeByWorktree: Record<string, WorkspaceVisibleTabType>
} {
  return {
    activeFileId: fileId,
    activeTabType: 'editor' as const,
    activeFileIdByWorktree: { ...state.activeFileIdByWorktree, [worktreeId]: fileId },
    activeTabTypeByWorktree: { ...state.activeTabTypeByWorktree, [worktreeId]: 'editor' }
  }
}

import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import { buildActiveSurfacePatch } from './active-surface'
import {
  dedupeTabOrder,
  findGroupForTab,
  findTabAndWorktree,
  patchTab,
  pickNextActiveTab,
  sanitizeRecentTabIds,
  updateGroup
} from './group-state'
import { collapseGroupLayout } from './model'
import type { TabsSlice } from './slice'

export function createTabLifecycleActions(
  set: Parameters<StateCreator<AppState, [], [], TabsSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TabsSlice>>[1]
): Pick<
  TabsSlice,
  | 'closeUnifiedTab'
  | 'reorderUnifiedTabs'
  | 'setTabLabel'
  | 'setRenamingTabId'
  | 'setTabCustomLabel'
  | 'setUnifiedTabColor'
> {
  return {
    closeUnifiedTab: (tabId, opts) => {
      const state = get()
      const found = findTabAndWorktree(state.unifiedTabsByWorktree, tabId)
      if (!found) {
        return null
      }
      const { tab, worktreeId } = found
      const group = findGroupForTab(state.groupsByWorktree, worktreeId, tab.groupId)
      if (!group) {
        return null
      }

      if (tab.contentType === 'terminal' && !opts?.terminalRetirementHandled) {
        const dedupedGroupOrder = dedupeTabOrder(group.tabOrder)
        const wasLastTab =
          dedupeTabOrder(dedupedGroupOrder.filter((id) => id !== tabId)).length === 0
        // Why: unified-only hydrated tabs still own provider sessions even when
        // their legacy terminal row is missing, so every terminal close retires by entity id.
        get().closeTab(tab.entityId, { recordInteraction: opts?.recordInteraction })
        return { closedTabId: tabId, wasLastTab, worktreeId }
      }

      const dedupedGroupOrder = dedupeTabOrder(group.tabOrder)
      const remainingOrder = dedupeTabOrder(dedupedGroupOrder.filter((id) => id !== tabId))
      const wasLastTab = remainingOrder.length === 0
      // Why: when closing the active tab, walk the group's MRU stack back to the
      // previously-active tab instead of the visual neighbor. `pickNextActiveTab`
      // falls back to pickNeighbor when the MRU is empty (hydrated sessions,
      // never-visited siblings) so behavior degrades gracefully.
      const nextActiveTabId =
        group.activeTabId === tabId
          ? wasLastTab
            ? null
            : pickNextActiveTab(dedupedGroupOrder, group.recentTabIds, tabId)
          : group.activeTabId
      const nextRecentTabIds = sanitizeRecentTabIds(
        (group.recentTabIds ?? []).filter((id) => id !== tabId),
        remainingOrder
      )
      const terminalEntityId = tab.contentType === 'terminal' ? tab.entityId : null

      set((current) => {
        const nextTabs = (current.unifiedTabsByWorktree[worktreeId] ?? []).filter(
          (item) => item.id !== tabId
        )
        // Why: closeUnifiedTab can be invoked without going through terminals.closeTab
        // (e.g., close-to-right / close-others gestures via closeOtherTabs and
        // closeTabsToRight). The unread-flag map is keyed by terminal entityId and
        // would otherwise leak a stale dot for a tab that no longer renders.
        let nextUnreadTerminalTabs = current.unreadTerminalTabs
        if (terminalEntityId && current.unreadTerminalTabs[terminalEntityId]) {
          nextUnreadTerminalTabs = { ...current.unreadTerminalTabs }
          delete nextUnreadTerminalTabs[terminalEntityId]
        }
        let nextGroups = (current.groupsByWorktree[worktreeId] ?? []).map((candidate) =>
          candidate.id === group.id
            ? {
                ...candidate,
                activeTabId: nextActiveTabId,
                tabOrder: remainingOrder,
                recentTabIds: nextRecentTabIds
              }
            : candidate
        )
        let nextLayoutByWorktree = current.layoutByWorktree
        let nextActiveGroupIdByWorktree = current.activeGroupIdByWorktree
        if (wasLastTab && current.layoutByWorktree[worktreeId] && nextGroups.length > 1) {
          nextGroups = nextGroups.filter((candidate) => candidate.id !== group.id)
          const collapsedState = collapseGroupLayout(
            current.layoutByWorktree,
            current.activeGroupIdByWorktree,
            worktreeId,
            group.id,
            nextGroups[0]?.id ?? null
          )
          nextLayoutByWorktree = collapsedState.layoutByWorktree
          nextActiveGroupIdByWorktree = collapsedState.activeGroupIdByWorktree
        }
        const shouldDeactivateWorktree =
          current.activeWorktreeId === worktreeId &&
          nextTabs.length === 0 &&
          (current.tabsByWorktree[worktreeId] ?? []).length === 0 &&
          (current.browserTabsByWorktree[worktreeId] ?? []).length === 0 &&
          !current.openFiles.some((file) => file.worktreeId === worktreeId)
        return {
          unifiedTabsByWorktree: { ...current.unifiedTabsByWorktree, [worktreeId]: nextTabs },
          groupsByWorktree: {
            ...current.groupsByWorktree,
            [worktreeId]: nextGroups
          },
          layoutByWorktree: nextLayoutByWorktree,
          activeGroupIdByWorktree: nextActiveGroupIdByWorktree,
          // Why: skip writing unreadTerminalTabs when the reference is unchanged —
          // avoids a no-op top-level state allocation that would force re-evaluation
          // of full-state selectors. Mirrors focusGroup / reconcileWorktreeTabModel.
          ...(nextUnreadTerminalTabs !== current.unreadTerminalTabs
            ? { unreadTerminalTabs: nextUnreadTerminalTabs }
            : {}),
          // Why: the split-group model can legally derive "terminal with no
          // active tab" after the final unified tab closes. That leaves the
          // worktree selected but render-empty, so the workspace shows a blank
          // pane instead of AgentStart's landing screen. When that happens, write the
          // landing-state fallback directly instead of recomputing active-surface
          // fields from a worktree that is no longer active.
          ...(shouldDeactivateWorktree
            ? {
                activeWorktreeId: null,
                activeWorkspaceKey: null,
                activeTabId: null,
                activeBrowserTabId: null,
                activeFileId: null,
                activeTabType: 'terminal' as const,
                activeTabIdByWorktree: {
                  ...current.activeTabIdByWorktree,
                  [worktreeId]: null
                },
                activeBrowserTabIdByWorktree: {
                  ...current.activeBrowserTabIdByWorktree,
                  [worktreeId]: null
                },
                activeFileIdByWorktree: {
                  ...current.activeFileIdByWorktree,
                  [worktreeId]: null
                },
                activeTabTypeByWorktree: {
                  ...current.activeTabTypeByWorktree,
                  [worktreeId]: 'terminal'
                }
              }
            : {}),
          ...(!shouldDeactivateWorktree && current.activeWorktreeId === worktreeId
            ? buildActiveSurfacePatch(
                {
                  ...current,
                  unifiedTabsByWorktree: {
                    ...current.unifiedTabsByWorktree,
                    [worktreeId]: nextTabs
                  },
                  groupsByWorktree: {
                    ...current.groupsByWorktree,
                    [worktreeId]: nextGroups
                  },
                  layoutByWorktree: nextLayoutByWorktree,
                  activeGroupIdByWorktree: nextActiveGroupIdByWorktree
                },
                worktreeId,
                nextActiveGroupIdByWorktree[worktreeId] ?? null
              )
            : {})
        }
      })

      if (opts?.recordInteraction !== false) {
        get().recordFeatureInteraction?.('terminal-tabs')
      }
      return { closedTabId: tabId, wasLastTab, worktreeId }
    },
    reorderUnifiedTabs: (groupId, tabIds, opts) => {
      let reordered = false
      set((state) => {
        for (const [worktreeId, groups] of Object.entries(state.groupsByWorktree)) {
          const group = groups.find((candidate) => candidate.id === groupId)
          if (!group) {
            continue
          }
          // Why: drag-and-drop should preserve a single canonical position for
          // each tab. Sanitizing here restores the invariant at the store
          // boundary so later group operations do not branch on duplicate ids.
          const nextTabOrder = dedupeTabOrder(tabIds)
          reordered = true
          const orderMap = new Map(nextTabOrder.map((id, index) => [id, index]))
          return {
            groupsByWorktree: {
              ...state.groupsByWorktree,
              [worktreeId]: updateGroup(groups, { ...group, tabOrder: nextTabOrder })
            },
            unifiedTabsByWorktree: {
              ...state.unifiedTabsByWorktree,
              [worktreeId]: (state.unifiedTabsByWorktree[worktreeId] ?? []).map((tab) => {
                const sortOrder = orderMap.get(tab.id)
                return sortOrder === undefined ? tab : { ...tab, sortOrder }
              })
            }
          }
        }
        return {}
      })
      if (reordered && opts?.recordInteraction !== false) {
        get().recordFeatureInteraction?.('terminal-tabs')
      }
    },
    setTabLabel: (tabId, label) => {
      set((state) => patchTab(state.unifiedTabsByWorktree, tabId, { label }) ?? {})
    },
    setRenamingTabId: (tabId) => {
      set({ renamingTabId: tabId })
    },
    setTabCustomLabel: (tabId, label, opts) => {
      const exists = get().getTab(tabId) !== null
      set((state) => patchTab(state.unifiedTabsByWorktree, tabId, { customLabel: label }) ?? {})
      if (exists && opts?.recordInteraction !== false) {
        get().recordFeatureInteraction?.('terminal-tabs')
      }
    },
    setUnifiedTabColor: (tabId, color) => {
      const exists = get().getTab(tabId) !== null
      set((state) => patchTab(state.unifiedTabsByWorktree, tabId, { color }) ?? {})
      if (exists) {
        get().recordFeatureInteraction?.('terminal-tabs')
      }
    }
  }
}

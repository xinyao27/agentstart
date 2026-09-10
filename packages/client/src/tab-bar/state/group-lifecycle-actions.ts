import type { TabGroup } from '@agentstart/protocol/workspace/tabs'
import type { StateCreator } from 'zustand'
import { createBrowserUuid } from '~renderer/browser/uuid'

import type { AppState } from '../../store/types'
import { buildActiveSurfacePatch, activeSurfacePatchMatchesState } from './active-surface'
import { buildSplitNode, replaceLeaf, collapseGroupLayout } from './model'
import type { TabsSlice } from './slice'

export function createGroupLifecycleActions(
  set: Parameters<StateCreator<AppState, [], [], TabsSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TabsSlice>>[1]
): Pick<
  TabsSlice,
  'ensureWorktreeRootGroup' | 'focusGroup' | 'closeEmptyGroup' | 'createEmptySplitGroup'
> {
  return {
    ensureWorktreeRootGroup: (worktreeId) => {
      const existingGroups = get().groupsByWorktree[worktreeId] ?? []
      if (existingGroups.length > 0) {
        return get().activeGroupIdByWorktree[worktreeId] ?? existingGroups[0].id
      }

      const groupId = createBrowserUuid()
      set((state) => ({
        // Why: a freshly selected worktree can legitimately have zero tabs, but
        // split-group affordances still need a canonical root group so new tabs
        // and splits land in a deterministic place like VS Code's editor area.
        groupsByWorktree: {
          ...state.groupsByWorktree,
          [worktreeId]: [{ id: groupId, worktreeId, activeTabId: null, tabOrder: [] }]
        },
        layoutByWorktree: {
          ...state.layoutByWorktree,
          [worktreeId]: { type: 'leaf', groupId }
        },
        activeGroupIdByWorktree: {
          ...state.activeGroupIdByWorktree,
          [worktreeId]: groupId
        }
      }))
      return groupId
    },
    focusGroup: (worktreeId, groupId) =>
      set((state) => {
        const groupAlreadyFocused = state.activeGroupIdByWorktree[worktreeId] === groupId
        const nextActiveGroupIdByWorktree = groupAlreadyFocused
          ? state.activeGroupIdByWorktree
          : {
              ...state.activeGroupIdByWorktree,
              [worktreeId]: groupId
            }
        // Why: focusing a split group surfaces whichever terminal tab is already
        // active in that group, so the tab-level bell is no longer needed.
        //
        // Why (activeWorktree guard below): only clear unreadTerminalTabs when
        // focusing a group within the *active* worktree. If the caller is
        // focusing a group in a background worktree, that tab is not visible
        // yet — dismissing its bell here would silently swallow the signal
        // before the user ever sees the tab. All current callers only fire for
        // the active worktree, but this guard prevents future misuse.
        if (state.activeWorktreeId !== worktreeId) {
          if (groupAlreadyFocused) {
            return state
          }
          return {
            activeGroupIdByWorktree: nextActiveGroupIdByWorktree
          }
        }
        const groups = state.groupsByWorktree[worktreeId] ?? []
        const unifiedTabs = state.unifiedTabsByWorktree[worktreeId] ?? []
        const visibleTerminalEntityIds = new Set(
          groups
            .map((group) =>
              group.activeTabId ? unifiedTabs.find((tab) => tab.id === group.activeTabId) : null
            )
            .filter((tab): tab is (typeof unifiedTabs)[number] => tab?.contentType === 'terminal')
            .map((tab) => tab.entityId)
        )
        const nextUnreadTerminalTabs =
          visibleTerminalEntityIds.size > 0
            ? (() => {
                let changed = false
                const copy = { ...state.unreadTerminalTabs }
                for (const terminalEntityId of visibleTerminalEntityIds) {
                  if (!copy[terminalEntityId]) {
                    continue
                  }
                  delete copy[terminalEntityId]
                  changed = true
                }
                return changed ? copy : state.unreadTerminalTabs
              })()
            : state.unreadTerminalTabs
        const activeSurfacePatch = buildActiveSurfacePatch(
          {
            ...state,
            activeGroupIdByWorktree: nextActiveGroupIdByWorktree
          },
          worktreeId,
          groupId
        )
        if (
          groupAlreadyFocused &&
          nextUnreadTerminalTabs === state.unreadTerminalTabs &&
          activeSurfacePatchMatchesState(state, worktreeId, activeSurfacePatch)
        ) {
          return state
        }
        return {
          ...(groupAlreadyFocused ? {} : { activeGroupIdByWorktree: nextActiveGroupIdByWorktree }),
          // Why: only write unreadTerminalTabs back into state when it actually
          // changed. The IIFE above returns state.unreadTerminalTabs by reference
          // on no-op; preserving that reference via conditional spread keeps
          // downstream selectors/subscribers from firing spuriously. This matches
          // the pattern used by activateTab and closeUnifiedTab.
          ...(nextUnreadTerminalTabs !== state.unreadTerminalTabs
            ? { unreadTerminalTabs: nextUnreadTerminalTabs }
            : {}),
          ...activeSurfacePatch
        }
      }),
    closeEmptyGroup: (worktreeId, groupId) => {
      const state = get()
      const group = (state.groupsByWorktree[worktreeId] ?? []).find(
        (candidate) => candidate.id === groupId
      )
      if (!group || group.tabOrder.length > 0) {
        return false
      }
      set((current) => {
        const remainingGroups = (current.groupsByWorktree[worktreeId] ?? []).filter(
          (candidate) => candidate.id !== groupId
        )
        const collapsedState = collapseGroupLayout(
          current.layoutByWorktree,
          current.activeGroupIdByWorktree,
          worktreeId,
          groupId,
          remainingGroups[0]?.id ?? null
        )
        // Why: drop the dead group's recent-quick-command entry so the in-memory
        // map can't grow unbounded as users open/close groups.
        const { [groupId]: _droppedRecent, ...remainingRecent } =
          current.recentQuickCommandIdByGroup
        return {
          groupsByWorktree: { ...current.groupsByWorktree, [worktreeId]: remainingGroups },
          layoutByWorktree: collapsedState.layoutByWorktree,
          activeGroupIdByWorktree: collapsedState.activeGroupIdByWorktree,
          recentQuickCommandIdByGroup: remainingRecent,
          ...(current.activeWorktreeId === worktreeId
            ? buildActiveSurfacePatch(
                {
                  ...current,
                  groupsByWorktree: {
                    ...current.groupsByWorktree,
                    [worktreeId]: remainingGroups
                  },
                  layoutByWorktree: collapsedState.layoutByWorktree,
                  activeGroupIdByWorktree: collapsedState.activeGroupIdByWorktree
                },
                worktreeId,
                collapsedState.activeGroupIdByWorktree[worktreeId] ?? null
              )
            : {})
        }
      })
      return true
    },
    createEmptySplitGroup: (worktreeId, sourceGroupId, direction) => {
      const newGroupId = createBrowserUuid()
      const newGroup: TabGroup = {
        id: newGroupId,
        worktreeId,
        activeTabId: null,
        tabOrder: []
      }
      set((state) => {
        const existing = state.groupsByWorktree[worktreeId] ?? []
        const currentLayout =
          state.layoutByWorktree[worktreeId] ?? ({ type: 'leaf', groupId: sourceGroupId } as const)
        const replacement = buildSplitNode(
          sourceGroupId,
          newGroupId,
          direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical',
          direction === 'left' || direction === 'up' ? 'first' : 'second'
        )
        return {
          groupsByWorktree: { ...state.groupsByWorktree, [worktreeId]: [...existing, newGroup] },
          layoutByWorktree: {
            ...state.layoutByWorktree,
            [worktreeId]: replaceLeaf(currentLayout, sourceGroupId, replacement)
          },
          activeGroupIdByWorktree: { ...state.activeGroupIdByWorktree, [worktreeId]: newGroupId }
        }
      })
      get().recordFeatureInteraction?.('terminal-panes')
      return newGroupId
    }
  }
}

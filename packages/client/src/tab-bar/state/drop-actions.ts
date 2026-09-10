import type { TabGroup } from '@agentstart/protocol/workspace/tabs'
import type { StateCreator } from 'zustand'
import { createBrowserUuid } from '~renderer/browser/uuid'

import type { AppState } from '../../store/types'
import { buildActiveSurfacePatch } from './active-surface'
import {
  dedupeTabOrder,
  findGroupAndWorktree,
  findGroupForTab,
  findTabAndWorktree,
  pickNextActiveTab,
  pushRecentTabId,
  sanitizeRecentTabIds
} from './group-state'
import { buildSplitNode, replaceLeaf, collapseGroupLayout } from './model'
import type { TabsSlice } from './slice'
import { isPaneColumnSplitDropNoOp } from './split-drop-no-op'

export function createDropActions(
  set: Parameters<StateCreator<AppState, [], [], TabsSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TabsSlice>>[1]
): Pick<TabsSlice, 'dropUnifiedTab' | 'copyUnifiedTabToGroup'> {
  return {
    dropUnifiedTab: (tabId, target) => {
      let moved = false
      set((state) => {
        const foundTab = findTabAndWorktree(state.unifiedTabsByWorktree, tabId)
        const foundTarget = findGroupAndWorktree(state.groupsByWorktree, target.groupId)
        if (!foundTab || !foundTarget || foundTab.worktreeId !== foundTarget.worktreeId) {
          return {}
        }

        const { tab, worktreeId } = foundTab
        const sourceGroup = findGroupForTab(state.groupsByWorktree, worktreeId, tab.groupId)
        const targetGroup = foundTarget.group
        if (!sourceGroup) {
          return {}
        }

        const isSplitDrop = Boolean(target.splitDirection)
        if (!isSplitDrop && tab.groupId === target.groupId) {
          return {}
        }
        const layout = state.layoutByWorktree[worktreeId]
        if (
          isSplitDrop &&
          isPaneColumnSplitDropNoOp({
            sourceGroupId: sourceGroup.id,
            targetGroupId: target.groupId,
            splitDirection: target.splitDirection!,
            sourceTabCount: sourceGroup.tabOrder.length,
            layout
          })
        ) {
          // Why: dragging the final tab in a group onto that same group's edge,
          // or onto the adjacent sibling's matching edge, creates a transient
          // column only to collapse the emptied source immediately.
          return {}
        }

        moved = true

        let nextGroups = state.groupsByWorktree[worktreeId] ?? []
        let nextLayoutByWorktree = state.layoutByWorktree
        let nextActiveGroupIdByWorktree = state.activeGroupIdByWorktree
        let resolvedTargetGroupId = target.groupId

        if (target.splitDirection) {
          const newGroupId = createBrowserUuid()
          const newGroup: TabGroup = {
            id: newGroupId,
            worktreeId,
            activeTabId: null, // Placeholder; properly set in the nextGroups.map() below
            tabOrder: []
          }
          const currentLayout =
            nextLayoutByWorktree[worktreeId] ?? ({ type: 'leaf', groupId: target.groupId } as const)
          const replacement = buildSplitNode(
            target.groupId,
            newGroupId,
            target.splitDirection === 'left' || target.splitDirection === 'right'
              ? 'horizontal'
              : 'vertical',
            target.splitDirection === 'left' || target.splitDirection === 'up' ? 'first' : 'second'
          )

          resolvedTargetGroupId = newGroupId
          nextGroups = [...nextGroups, newGroup]
          nextLayoutByWorktree = {
            ...nextLayoutByWorktree,
            [worktreeId]: replaceLeaf(currentLayout, target.groupId, replacement)
          }
          nextActiveGroupIdByWorktree = {
            ...nextActiveGroupIdByWorktree,
            [worktreeId]: newGroupId
          }
        }

        const dedupedSourceGroupOrder = dedupeTabOrder(sourceGroup.tabOrder)
        const sourceOrder = dedupeTabOrder(dedupedSourceGroupOrder.filter((id) => id !== tabId))
        const destinationGroup =
          nextGroups.find((group) => group.id === resolvedTargetGroupId) ?? targetGroup
        // Why: the target group's stored order can already contain this tab id
        // from a prior racey write or a same-group split where the source and
        // destination transiently share it. Splicing without filtering first
        // would leave the same id in the order twice, which React surfaces as
        // a duplicate-key warning in TabBar and can mis-reconcile xterm panes.
        const targetOrder = dedupeTabOrder(destinationGroup.tabOrder.filter((id) => id !== tabId))
        const targetIndex = Math.max(
          0,
          Math.min(target.index ?? targetOrder.length, targetOrder.length)
        )
        targetOrder.splice(targetIndex, 0, tabId)

        const sourceRecentTabIds = sanitizeRecentTabIds(
          (sourceGroup.recentTabIds ?? []).filter((id) => id !== tabId),
          sourceOrder
        )
        nextGroups = nextGroups.map((group) => {
          if (group.id === sourceGroup.id) {
            return {
              ...group,
              activeTabId:
                group.activeTabId === tabId
                  ? // Why: same MRU-aware fallback as moveUnifiedTabToGroup so
                    // the pane left behind by a drag keeps the user on their
                    // previously-active tab.
                    pickNextActiveTab(dedupedSourceGroupOrder, sourceGroup.recentTabIds, tabId)
                  : group.activeTabId,
              tabOrder: sourceOrder,
              recentTabIds: sourceRecentTabIds
            }
          }
          if (group.id === resolvedTargetGroupId) {
            return {
              ...group,
              activeTabId: tabId,
              tabOrder: targetOrder,
              recentTabIds: pushRecentTabId(
                sanitizeRecentTabIds(group.recentTabIds, targetOrder),
                tabId
              )
            }
          }
          return group
        })

        if (sourceOrder.length === 0) {
          nextGroups = nextGroups.filter((group) => group.id !== sourceGroup.id)
          const collapsedState = collapseGroupLayout(
            nextLayoutByWorktree,
            nextActiveGroupIdByWorktree,
            worktreeId,
            sourceGroup.id,
            resolvedTargetGroupId
          )
          nextLayoutByWorktree = collapsedState.layoutByWorktree
          nextActiveGroupIdByWorktree = collapsedState.activeGroupIdByWorktree
        } else {
          nextActiveGroupIdByWorktree = {
            ...nextActiveGroupIdByWorktree,
            [worktreeId]: resolvedTargetGroupId
          }
        }

        const nextUnifiedTabsByWorktree = {
          ...state.unifiedTabsByWorktree,
          [worktreeId]: (state.unifiedTabsByWorktree[worktreeId] ?? []).map((candidate) =>
            candidate.id === tabId ? { ...candidate, groupId: resolvedTargetGroupId } : candidate
          )
        }
        const nextGroupsByWorktree = {
          ...state.groupsByWorktree,
          [worktreeId]: nextGroups
        }

        return {
          unifiedTabsByWorktree: nextUnifiedTabsByWorktree,
          groupsByWorktree: nextGroupsByWorktree,
          layoutByWorktree: nextLayoutByWorktree,
          activeGroupIdByWorktree: nextActiveGroupIdByWorktree,
          ...(state.activeWorktreeId === worktreeId
            ? buildActiveSurfacePatch(
                {
                  ...state,
                  unifiedTabsByWorktree: nextUnifiedTabsByWorktree,
                  groupsByWorktree: nextGroupsByWorktree,
                  layoutByWorktree: nextLayoutByWorktree,
                  activeGroupIdByWorktree: nextActiveGroupIdByWorktree
                },
                worktreeId,
                resolvedTargetGroupId
              )
            : {})
        }
      })
      if (moved) {
        get().recordFeatureInteraction?.('terminal-tabs')
        get().recordFeatureInteraction?.('tab-splits')
      }
      return moved
    },
    copyUnifiedTabToGroup: (tabId, targetGroupId, init) => {
      const foundTab = findTabAndWorktree(get().unifiedTabsByWorktree, tabId)
      const foundTarget = findGroupAndWorktree(get().groupsByWorktree, targetGroupId)
      if (!foundTab || !foundTarget || foundTab.worktreeId !== foundTarget.worktreeId) {
        return null
      }
      const { tab, worktreeId } = foundTab
      return get().createUnifiedTab(worktreeId, tab.contentType, {
        entityId: init?.entityId ?? tab.entityId,
        label: init?.label ?? tab.label,
        generatedLabel: init?.generatedLabel ?? tab.generatedLabel,
        quickCommandLabel: init?.quickCommandLabel ?? tab.quickCommandLabel,
        customLabel: init?.customLabel ?? tab.customLabel,
        color: init?.color ?? tab.color,
        isPinned: init?.isPinned ?? tab.isPinned,
        id: init?.id,
        targetGroupId
      })
    }
  }
}

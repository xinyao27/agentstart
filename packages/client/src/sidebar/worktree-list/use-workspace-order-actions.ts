import type {
  WorkspaceStatus,
  WorkspaceStatusDefinition
} from '@agentstart/protocol/workspace/status/model'
import type { Worktree, WorktreeMeta } from '@agentstart/protocol/worktree/model'
import { useAppStore } from '~renderer/store/state'

import { getWorkspaceStatus, getWorkspaceStatusGroupKey } from '../workspace-status'
import {
  buildManualOrderUpdatesForGroupDrop,
  buildManualOrderUpdatesForVisibleGroups,
  type WorktreeDragGroup
} from '../worktree-manual-order'

export function useWorkspaceOrderActions(args: {
  worktreeMap: Map<string, Worktree>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
}) {
  const updateWorktreeMeta = useAppStore((state) => state.updateWorktreeMeta)
  const updateWorktreesMeta = useAppStore((state) => state.updateWorktreesMeta)
  const setWorktreesPinnedAndReveal = useAppStore((state) => state.setWorktreesPinnedAndReveal)
  const setSortBy = useAppStore((state) => state.setSortBy)
  const moveOne = (worktreeId: string, status: WorkspaceStatus): void => {
    const current = args.worktreeMap.get(worktreeId)
    if (current && getWorkspaceStatus(current, args.workspaceStatuses) !== status) {
      void updateWorktreeMeta(worktreeId, { workspaceStatus: status })
    }
  }
  const moveMany = (worktreeIds: readonly string[], status: WorkspaceStatus): void => {
    const updates = new Map<string, { workspaceStatus: WorkspaceStatus }>()
    for (const worktreeId of worktreeIds) {
      const current = args.worktreeMap.get(worktreeId)
      if (current && getWorkspaceStatus(current, args.workspaceStatuses) !== status) {
        updates.set(worktreeId, { workspaceStatus: status })
      }
    }
    if (updates.size > 0) {
      void updateWorktreesMeta(updates)
    }
  }
  const getRanks = (groups: readonly WorktreeDragGroup[]): Map<string, number> => {
    const ranks = new Map<string, number>()
    for (const group of groups) {
      for (const worktreeId of group.worktreeIds) {
        const worktree = args.worktreeMap.get(worktreeId)
        if (worktree) {
          ranks.set(worktreeId, worktree.manualOrder ?? worktree.sortOrder)
        }
      }
    }
    return ranks
  }
  const moveManyAtIndex = (input: {
    worktreeIds: readonly string[]
    status: WorkspaceStatus
    dropIndex: number
    groups: readonly WorktreeDragGroup[]
  }): void => {
    const order = buildManualOrderUpdatesForGroupDrop({
      groups: input.groups,
      targetGroupKey: getWorkspaceStatusGroupKey(input.status),
      draggedIds: input.worktreeIds,
      dropIndex: input.dropIndex,
      now: Date.now(),
      rankByWorktreeId: getRanks(input.groups)
    })
    const updates = new Map<string, Partial<WorktreeMeta>>()
    for (const worktreeId of input.worktreeIds) {
      const current = args.worktreeMap.get(worktreeId)
      if (current) {
        updates.set(
          worktreeId,
          getWorkspaceStatus(current, args.workspaceStatuses) === input.status
            ? {}
            : { workspaceStatus: input.status }
        )
      }
    }
    for (const [worktreeId, manualOrder] of order.updates) {
      updates.set(worktreeId, { ...updates.get(worktreeId), ...manualOrder })
    }
    for (const [worktreeId, update] of updates) {
      if (Object.keys(update).length === 0) {
        updates.delete(worktreeId)
      }
    }
    if (updates.size > 0) {
      if (order.changed) {
        setSortBy('manual')
      }
      void updateWorktreesMeta(updates)
    }
  }
  const reorder = (input: {
    groups: readonly WorktreeDragGroup[]
    sourceGroupKey: string
    draggedIds: readonly string[]
    dropIndex: number
  }): void => {
    const result = buildManualOrderUpdatesForVisibleGroups({
      ...input,
      now: Date.now(),
      rankByWorktreeId: getRanks(input.groups)
    })
    if (result.changed) {
      setSortBy('manual')
      void updateWorktreesMeta(result.updates)
    }
  }
  return {
    moveOne,
    moveMany,
    moveManyAtIndex,
    pinOne: (worktreeId: string) => setWorktreesPinnedAndReveal([worktreeId], true),
    pinMany: (worktreeIds: readonly string[]) => setWorktreesPinnedAndReveal(worktreeIds, true),
    reorder
  }
}

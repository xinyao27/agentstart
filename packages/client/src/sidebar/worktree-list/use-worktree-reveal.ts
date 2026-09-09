import type { LegendListRef } from '@legendapp/list/react'
import type { ProjectGroup } from '@yiru/protocol/project/group-model'
import type { Repo } from '@yiru/protocol/project/repository'
import type { FolderWorkspace } from '@yiru/protocol/workspace/folder'
import type { WorkspaceStatusDefinition } from '@yiru/protocol/workspace/status/model'
import type { WorktreeLineage } from '@yiru/protocol/worktree/lineage'
import type { Worktree } from '@yiru/protocol/worktree/model'
import { useEffect, useRef, useState } from 'react'
import type { PendingSidebarWorktreeReveal } from '~renderer/application-shell/state/slice'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'

import {
  workspaceIndexForLocalRowIndex,
  type WorkspaceSidebarProjectedRow
} from '../workspace-sidebar-row-projection'
import { getFolderWorkspaceRevealGroupKeys, sidebarWorkspaceStillExists } from './folder-reveal'
import {
  getGroupKeysForWorktree,
  getLineageGroupKey,
  getPinnedWorktreeDisplayPolicy,
  PINNED_GROUP_KEY,
  type WorktreeGroupBy
} from './groups'
import {
  getRenderRowSidebarKey,
  revealMountedWorktreeElement,
  resolvePendingSidebarReveal
} from './reveal'
import { findPreferredRenderRowIndexForWorktree, getRenderRowOptionId } from './row-model'
import type { RenderRow } from './virtual-rows'

export function useWorktreeReveal(args: {
  pending: PendingSidebarWorktreeReveal | null
  agentSendTargetWorktreeId: string | null
  groupBy: WorktreeGroupBy
  worktrees: readonly Worktree[]
  folderWorkspaces: readonly FolderWorkspace[]
  repoMap: Map<string, Repo>
  prCache: AppState['prCache'] | null
  lineageById: Record<string, WorktreeLineage>
  worktreeMap: Map<string, Worktree>
  renderRows: readonly RenderRow[]
  workspaceRows: readonly WorkspaceSidebarProjectedRow[]
  clearPending: () => void
  toggleGroup: (key: string) => void
  collapsedGroups: ReadonlySet<string>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  settings: AppState['settings']
  projectGroups: readonly ProjectGroup[]
  legendListRef: React.RefObject<LegendListRef | null>
  scrollRef: React.RefObject<HTMLDivElement | null>
  flash: (rowKey: string) => void
  scheduleFrame: (callback: FrameRequestCallback) => void
  cancelFrames: () => void
}): void {
  const [retryTick, setRetryTick] = useState(0)
  const retryRef = useRef<{ worktreeId: string; count: number } | null>(null)
  const setRenamingWorktreeId = useAppStore((state) => state.setRenamingWorktreeId)
  const pinnedDisplayPolicy = getPinnedWorktreeDisplayPolicy(args.settings)

  useEffect(() => {
    if (!args.pending) {
      return
    }
    const pending = args.pending
    if (args.agentSendTargetWorktreeId !== pending.worktreeId) {
      const folderGroupKeys = getFolderWorkspaceRevealGroupKeys(
        pending.worktreeId,
        args.folderWorkspaces,
        args.projectGroups
      )
      if (folderGroupKeys.length > 0) {
        for (const groupKey of folderGroupKeys) {
          if (args.collapsedGroups.has(groupKey)) {
            args.toggleGroup(groupKey)
          }
        }
      } else {
        const targetWorktree = args.worktrees.find((worktree) => worktree.id === pending.worktreeId)
        if (
          targetWorktree &&
          (!targetWorktree.isPinned || pinnedDisplayPolicy === 'duplicate-in-groups')
        ) {
          const seen = new Set<string>()
          let current: Worktree | undefined = targetWorktree
          while (current && !seen.has(current.id)) {
            seen.add(current.id)
            const lineage: WorktreeLineage | undefined = args.lineageById[current.id]
            const parent: Worktree | undefined = lineage
              ? args.worktreeMap.get(lineage.parentWorktreeId)
              : undefined
            if (
              !lineage ||
              !parent ||
              current.instanceId !== lineage.worktreeInstanceId ||
              parent.instanceId !== lineage.parentWorktreeInstanceId
            ) {
              break
            }
            const lineageGroupKey = getLineageGroupKey(parent.id)
            if (args.collapsedGroups.has(lineageGroupKey)) {
              args.toggleGroup(lineageGroupKey)
            }
            current = parent
          }
        }
        if (targetWorktree?.isPinned && pinnedDisplayPolicy === 'single-location') {
          if (args.collapsedGroups.has(PINNED_GROUP_KEY)) {
            args.toggleGroup(PINNED_GROUP_KEY)
          }
        } else if (targetWorktree) {
          for (const groupKey of getGroupKeysForWorktree(
            args.groupBy,
            targetWorktree,
            args.repoMap,
            args.prCache,
            args.workspaceStatuses,
            args.settings,
            args.projectGroups
          )) {
            if (args.collapsedGroups.has(groupKey)) {
              args.toggleGroup(groupKey)
            }
          }
        }
      }
    }

    let cancelled = false
    args.scheduleFrame(() => {
      if (cancelled) {
        return
      }
      const targetStillExists = sidebarWorkspaceStillExists(
        pending.worktreeId,
        args.worktrees,
        args.folderWorkspaces
      )
      const targetIndex = findPreferredRenderRowIndexForWorktree(
        args.renderRows,
        pending.worktreeId,
        pinnedDisplayPolicy === 'duplicate-in-groups'
      )
      const outcome = resolvePendingSidebarReveal({
        targetIndex,
        targetWorktreeStillExists: targetStillExists
      })
      if (outcome === 'clear') {
        retryRef.current = null
        args.clearPending()
        return
      }
      if (outcome !== 'scroll-and-clear') {
        return
      }
      const targetRow = args.renderRows[targetIndex]
      const workspaceTargetIndex = workspaceIndexForLocalRowIndex(args.workspaceRows, targetIndex)
      const retry = () => {
        const previous = retryRef.current
        const count = previous?.worktreeId === pending.worktreeId ? previous.count + 1 : 1
        retryRef.current = { worktreeId: pending.worktreeId, count }
        if (count <= 8) {
          args.scheduleFrame(() => {
            if (!cancelled) {
              setRetryTick((tick) => tick + 1)
            }
          })
        } else {
          retryRef.current = null
          args.clearPending()
        }
      }
      const revealed = args.scrollRef.current
        ? revealMountedWorktreeElement(
            args.scrollRef.current,
            pending.worktreeId,
            pending.behavior,
            getRenderRowOptionId(targetRow, pending.worktreeId)
          )
        : null
      if (revealed) {
        if (pending.highlight) {
          const rowKey = revealed.dataset.worktreeRowKey ?? getRenderRowSidebarKey(targetRow)
          if (rowKey) {
            args.flash(rowKey)
          }
        }
        if (pending.beginRename) {
          setRenamingWorktreeId({
            worktreeId: pending.worktreeId,
            rowKey: revealed.dataset.worktreeRowKey
          })
        }
        retryRef.current = null
        args.clearPending()
        return
      }
      void args.legendListRef.current?.scrollIndexIntoView({
        index: workspaceTargetIndex,
        animated: false
      })
      retry()
    })
    return () => {
      cancelled = true
      args.cancelFrames()
    }
  }, [args, pinnedDisplayPolicy, retryTick, setRenamingWorktreeId])
}

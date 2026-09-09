import type { Repo } from '@yiru/protocol/project/repository'
import type {
  WorkspaceStatus,
  WorkspaceStatusDefinition
} from '@yiru/protocol/workspace/status/model'
import type { WorktreeLineage } from '@yiru/protocol/worktree/lineage'
import type { Worktree } from '@yiru/protocol/worktree/model'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'

import type { HostSectionRow } from '../host-section-rows'
import { getWorkspaceStatusGroupKey } from '../workspace-status'
import { getWorktreeDragUnitGroups } from '../worktree-drag-units'
import { getReorderedWorktreeIdsToUnnest } from '../worktree-lineage-drag-drop'
import { expandDraggedWorktreeIdsForVisibleLineage } from '../worktree-manual-order'
import { getEligibleWorktreeParents } from '../worktree-parent-candidates'
import {
  getWorktreeSidebarDragRectsForGroup,
  refreshWorktreeSidebarDragSession,
  type WorktreeSidebarDragPoint,
  type WorktreeSidebarDragRect,
  type WorktreeSidebarDragSession
} from '../worktree-sidebar-drag-autoscroll'
import {
  computeWorktreeSidebarDropPreview,
  type WorktreeSidebarDropPreview,
  type WorktreeSidebarStatusDropTarget
} from '../worktree-sidebar-drop-preview'
import {
  removeSidebarDragPreview,
  setSidebarPointerDragDocumentStyles
} from '../worktree-sidebar-pointer-drag-dom'
import {
  type WorktreePointerDrag,
  type WorktreeRowDragState,
  WORKTREE_ROW_DRAG_INITIAL_STATE
} from './drag-state'
import { PINNED_GROUP_KEY, type WorktreeGroupBy } from './groups'
import { getWorktreeDragGroups, getWorktreeDragIndexes, type WorktreeItemRow } from './row-model'

export function useWorktreeDragCore(args: {
  rows: HostSectionRow[]
  worktrees: readonly Worktree[]
  worktreeMap: Map<string, Worktree>
  lineageById: Record<string, WorktreeLineage>
  repoMap: Map<string, Repo>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  groupBy: WorktreeGroupBy
  scrollRef: React.RefObject<HTMLDivElement | null>
}) {
  const [dragOverStatus, setDragOverStatus] = useState<WorkspaceStatus | null>(null)
  const [pinDragOver, setPinDragOver] = useState(false)
  const [nativeLineageDropTargetId, setNativeLineageDropTargetId] = useState<string | null>(null)
  const [state, setState] = useState<WorktreeRowDragState>(WORKTREE_ROW_DRAG_INITIAL_STATE)
  const sessionRef = useRef<WorktreeSidebarDragSession | null>(null)
  const pointerDragRef = useRef<WorktreePointerDrag | null>(null)
  const pointerAutoscrollFrameRef = useRef<number | null>(null)
  const pointerAutoscrollTimeRef = useRef<number | null>(null)
  const nativeAutoscrollFrameRef = useRef<number | null>(null)
  const nativeAutoscrollTimeRef = useRef<number | null>(null)
  const nativeLatestPointRef = useRef<WorktreeSidebarDragPoint | null>(null)
  const suppressClickUntilRef = useRef(0)
  const assignWorktreeParent = useAppStore((store) => store.assignWorktreeParent)
  const updateWorktreeLineage = useAppStore((store) => store.updateWorktreeLineage)

  const groups = getWorktreeDragGroups(args.rows)
  const unitGroups = getWorktreeDragUnitGroups(args.rows)
  const naturalIds = new Set(
    args.rows.flatMap((row) =>
      row.type === 'item' && row.sectionKey !== PINNED_GROUP_KEY ? [row.worktree.id] : []
    )
  )
  const lineageRows = args.rows
    .filter((row): row is WorktreeItemRow => row.type === 'item')
    .filter((row) => row.sectionKey !== PINNED_GROUP_KEY || !naturalIds.has(row.worktree.id))
    .map((row) => ({ worktreeId: row.worktree.id, depth: row.depth }))
  const getReorderDraggedIds = (ids: readonly string[]) =>
    expandDraggedWorktreeIdsForVisibleLineage(lineageRows, ids)
  const getReorderUnitDraggedIds = (sourceGroupKey: string, ids: readonly string[]) => {
    const group = unitGroups.find((candidate) => candidate.key === sourceGroupKey)
    if (!group) {
      return ids
    }
    const unitIds = new Set(group.worktreeIds)
    const filtered = ids.filter((id) => unitIds.has(id))
    return filtered.length > 0 ? filtered : ids
  }
  const indexes = getWorktreeDragIndexes(args.rows)
  const refreshSession = useEventCallback((): boolean => {
    const session = sessionRef.current
    const container = args.scrollRef.current
    if (!session || !container) {
      return false
    }
    const refreshed = refreshWorktreeSidebarDragSession({
      session,
      groups,
      unitGroups,
      rects: getWorktreeSidebarDragRectsForGroup(container, session.sourceGroupKey)
    })
    sessionRef.current = refreshed
    return refreshed !== null
  })
  const computeDropForGroup = (input: {
    pointerY: number
    groupKey: string
    rects: readonly WorktreeSidebarDragRect[]
    draggedIds: readonly string[]
    draggingWorktreeId?: string | null
  }): WorktreeSidebarDropPreview | null => {
    const container = args.scrollRef.current
    const group = unitGroups.find((candidate) => candidate.key === input.groupKey)
    if (!container || !group) {
      return null
    }
    return computeWorktreeSidebarDropPreview({
      pointerY: input.pointerY,
      containerTop: container.getBoundingClientRect().top,
      scrollTop: container.scrollTop,
      rects: input.rects,
      groupIds: group.worktreeIds,
      draggedIds: input.draggedIds,
      draggingWorktreeId: input.draggingWorktreeId
    })
  }
  const computeDrop = useEventCallback((pointerY: number) => {
    const session = sessionRef.current
    return session
      ? computeDropForGroup({
          pointerY,
          groupKey: session.sourceGroupKey,
          rects: session.rects,
          draggedIds: session.reorderUnitDraggedIds,
          draggingWorktreeId: session.draggingWorktreeId
        })
      : null
  })
  const computeStatusDrop = useEventCallback(
    (input: { pointerY: number; status: WorkspaceStatus; draggedIds: readonly string[] }) => {
      const container = args.scrollRef.current
      if (!container) {
        return null
      }
      const groupKey = getWorkspaceStatusGroupKey(input.status)
      return computeDropForGroup({
        pointerY: input.pointerY,
        groupKey,
        rects: getWorktreeSidebarDragRectsForGroup(container, groupKey),
        draggedIds: input.draggedIds,
        draggingWorktreeId: sessionRef.current?.draggingWorktreeId ?? null
      })
    }
  )

  const cancelPointerAutoscroll = () => {
    if (pointerAutoscrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerAutoscrollFrameRef.current)
      pointerAutoscrollFrameRef.current = null
    }
    pointerAutoscrollTimeRef.current = null
  }
  const cancelNativeAutoscroll = () => {
    if (nativeAutoscrollFrameRef.current !== null) {
      window.cancelAnimationFrame(nativeAutoscrollFrameRef.current)
      nativeAutoscrollFrameRef.current = null
    }
    nativeAutoscrollTimeRef.current = null
    nativeLatestPointRef.current = null
  }
  const clear = useEventCallback(() => {
    const drag = pointerDragRef.current
    cancelPointerAutoscroll()
    cancelNativeAutoscroll()
    setNativeLineageDropTargetId(null)
    if (drag?.frameId !== null && drag?.frameId !== undefined) {
      window.cancelAnimationFrame(drag.frameId)
    }
    removeSidebarDragPreview(drag?.preview ?? null)
    pointerDragRef.current = null
    sessionRef.current = null
    setSidebarPointerDragDocumentStyles(false)
    setDragOverStatus(null)
    setPinDragOver(false)
    setState(WORKTREE_ROW_DRAG_INITIAL_STATE)
  })
  const eligibleLineageTarget = useEventCallback(
    (
      target: WorktreeSidebarStatusDropTarget & { lineageParentId: string | null },
      draggedIds: readonly string[]
    ) => {
      if (!target.lineageParentId) {
        return target
      }
      const canAssignAll = draggedIds.every((id) => {
        const child = args.worktreeMap.get(id)
        return child
          ? getEligibleWorktreeParents({
              child,
              worktrees: [...args.worktrees],
              lineageById: args.lineageById,
              worktreeMap: args.worktreeMap,
              repoMap: args.repoMap
            }).some((candidate) => candidate.id === target.lineageParentId)
          : false
      })
      return canAssignAll ? target : { ...target, lineageParentId: null }
    }
  )
  const commitLineageParent = useEventCallback((ids: readonly string[], parentId: string) => {
    const target = eligibleLineageTarget(
      { status: null, isPinDrop: false, lineageParentId: parentId },
      ids
    )
    if (!target.lineageParentId) {
      return false
    }
    void Promise.all(
      ids.map((id) => assignWorktreeParent(id, { parentWorktreeId: parentId }))
    ).catch((error) => {
      console.error('Failed to nest workspace:', error)
      toast.error(
        translate(
          'auto.components.sidebar.WorktreeList.failedNestWorkspace',
          'Failed to nest workspace'
        )
      )
    })
    return true
  })
  const clearReorderedParents = useEventCallback(
    (input: { draggedIds: readonly string[]; sourceGroupKey: string }) => {
      const sourceGroup = groups.find((group) => group.key === input.sourceGroupKey)
      if (!sourceGroup) {
        return
      }
      const ids = getReorderedWorktreeIdsToUnnest({
        draggedIds: input.draggedIds,
        sourceGroupIds: sourceGroup.worktreeIds,
        lineageById: args.lineageById
      })
      if (ids.length === 0) {
        return
      }
      void Promise.all(ids.map((id) => updateWorktreeLineage(id, { noParent: true }))).catch(
        (error) => {
          console.error('Failed to unnest workspace:', error)
          toast.error(
            translate(
              'auto.components.sidebar.WorktreeList.failedUnnestWorkspace',
              'Failed to unnest workspace'
            )
          )
        }
      )
    }
  )

  return {
    state,
    setState,
    dragOverStatus,
    setDragOverStatus,
    pinDragOver,
    setPinDragOver,
    nativeLineageDropTargetId,
    setNativeLineageDropTargetId,
    sessionRef,
    pointerDragRef,
    pointerAutoscrollFrameRef,
    pointerAutoscrollTimeRef,
    nativeAutoscrollFrameRef,
    nativeAutoscrollTimeRef,
    nativeLatestPointRef,
    suppressClickUntilRef,
    groups,
    unitGroups,
    indexes,
    getReorderDraggedIds,
    getReorderUnitDraggedIds,
    refreshSession,
    computeDrop,
    computeStatusDrop,
    cancelPointerAutoscroll,
    cancelNativeAutoscroll,
    clear,
    eligibleLineageTarget,
    commitLineageParent,
    clearReorderedParents
  }
}

export type WorktreeDragCore = ReturnType<typeof useWorktreeDragCore>

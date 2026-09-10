import type { WorkspaceStatus } from '@agentstart/protocol/workspace/status/model'

import { getFullDropIndexForWorktreeDragUnit } from '../worktree-drag-units'
import type { WorktreeDragGroup } from '../worktree-manual-order'
import { getWorktreeSidebarDragRectsForGroup } from '../worktree-sidebar-drag-autoscroll'
import { EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS, getPointerDropStatusTarget } from './drag-state'
import type { WorktreeDragCore } from './use-drag-core'

export function createNativeDragHandlers(args: {
  core: WorktreeDragCore
  scrollRef: React.RefObject<HTMLDivElement | null>
  onMoveWorktreesToStatusAtIndex: (input: {
    worktreeIds: readonly string[]
    status: WorkspaceStatus
    dropIndex: number
    groups: readonly WorktreeDragGroup[]
  }) => void
  onReorderWorktrees: (input: {
    groups: readonly WorktreeDragGroup[]
    sourceGroupKey: string
    draggedIds: readonly string[]
    dropIndex: number
  }) => void
}) {
  const {
    groups: worktreeDragGroups,
    unitGroups: worktreeDragUnitGroups,
    sessionRef: worktreeDragSessionRef,
    getReorderDraggedIds,
    getReorderUnitDraggedIds,
    setState: setWorktreeDragState,
    refreshSession: refreshWorktreeDragSession,
    eligibleLineageTarget: getEligibleLineageDropTarget,
    commitLineageParent: commitWorktreeLineageParentDrop,
    computeDrop: computeWorktreeDrop,
    computeStatusDrop: computeWorktreeStatusDrop,
    clearReorderedParents: clearReorderedWorktreeParents,
    clear: clearWorktreeDrag
  } = args.core
  const { scrollRef, onMoveWorktreesToStatusAtIndex, onReorderWorktrees } = args

  const handleWorktreeCardDragStart = (
    _event: React.DragEvent<HTMLDivElement>,
    worktreeId: string,
    draggedIds: readonly string[]
  ) => {
    const sourceGroupKey =
      worktreeDragGroups.find((group) => group.worktreeIds.includes(worktreeId))?.key ?? null
    if (!sourceGroupKey) {
      return
    }
    const reorderDraggedIds = getReorderDraggedIds(draggedIds)
    const reorderUnitDraggedIds = getReorderUnitDraggedIds(sourceGroupKey, reorderDraggedIds)
    worktreeDragSessionRef.current = {
      draggingWorktreeId: worktreeId,
      sourceGroupKey,
      draggedIds,
      reorderDraggedIds,
      reorderUnitDraggedIds,
      rects: scrollRef.current
        ? getWorktreeSidebarDragRectsForGroup(scrollRef.current, sourceGroupKey)
        : []
    }
    setWorktreeDragState({
      draggingWorktreeId: worktreeId,
      sourceGroupKey,
      dropIndex: null,
      dropIndicatorY: null,
      previewOffsetsByWorktreeId: EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS,
      pointerY: null
    })
  }

  const handleWorktreeDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const session = worktreeDragSessionRef.current
    if (!session) {
      return
    }
    if (!refreshWorktreeDragSession()) {
      clearWorktreeDrag()
      return
    }
    const container = scrollRef.current
    const target = getEligibleLineageDropTarget(
      container
        ? getPointerDropStatusTarget({
            container,
            x: event.clientX,
            y: event.clientY
          })
        : { status: null, isPinDrop: false, lineageParentId: null },
      session.draggedIds
    )

    if (target.lineageParentId) {
      event.preventDefault()
      event.stopPropagation()
      commitWorktreeLineageParentDrop(session.draggedIds, target.lineageParentId)
      clearWorktreeDrag()
      return
    }

    const drop = computeWorktreeDrop(event.clientY)
    if (!drop) {
      const statusDrop = target.status
        ? computeWorktreeStatusDrop({
            pointerY: event.clientY,
            status: target.status,
            draggedIds: session.draggedIds
          })
        : null
      if (target.status && statusDrop) {
        event.preventDefault()
        event.stopPropagation()
        onMoveWorktreesToStatusAtIndex({
          worktreeIds: session.draggedIds,
          status: target.status,
          dropIndex: statusDrop.dropIndex,
          groups: worktreeDragGroups
        })
        clearWorktreeDrag()
        return
      }
      clearWorktreeDrag()
      return
    }
    event.preventDefault()
    onReorderWorktrees({
      groups: worktreeDragGroups,
      sourceGroupKey: session.sourceGroupKey,
      draggedIds: session.reorderDraggedIds,
      dropIndex: getFullDropIndexForWorktreeDragUnit({
        groups: worktreeDragUnitGroups,
        sourceGroupKey: session.sourceGroupKey,
        dropIndex: drop.dropIndex
      })
    })
    clearReorderedWorktreeParents({
      draggedIds: session.draggedIds,
      sourceGroupKey: session.sourceGroupKey
    })
    clearWorktreeDrag()
  }

  return { handleWorktreeCardDragStart, handleWorktreeDrop }
}

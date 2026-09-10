import type {
  WorkspaceStatus,
  WorkspaceStatusDefinition
} from '@agentstart/protocol/workspace/status/model'
import { useEffect } from 'react'

import { getFullDropIndexForWorktreeDragUnit } from '../worktree-drag-units'
import type { WorktreeDragGroup } from '../worktree-manual-order'
import { resolveWorktreeSidebarStatusDropCommitTarget } from '../worktree-sidebar-drop-preview'
import {
  getPointerDropStatusTarget,
  shouldPreferSidebarStatusDropTarget,
  SIDEBAR_POINTER_DRAG_THRESHOLD_PX,
  type WorktreePointerDrag
} from './drag-state'
import type { WorktreeDragCore } from './use-drag-core'

export function usePointerDragEvents(args: {
  core: WorktreeDragCore
  scrollRef: React.RefObject<HTMLDivElement | null>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  beginDrag: (drag: WorktreePointerDrag) => void
  scheduleFrame: (drag: WorktreePointerDrag) => void
  onMoveWorktreesToStatus: (ids: readonly string[], status: WorkspaceStatus) => void
  onMoveWorktreesToStatusAtIndex: (input: {
    worktreeIds: readonly string[]
    status: WorkspaceStatus
    dropIndex: number
    groups: readonly WorktreeDragGroup[]
  }) => void
  onPinWorktrees: (ids: readonly string[]) => void
  onReorderWorktrees: (input: {
    groups: readonly WorktreeDragGroup[]
    sourceGroupKey: string
    draggedIds: readonly string[]
    dropIndex: number
  }) => void
}) {
  const {
    pointerDragRef: worktreePointerDragRef,
    suppressClickUntilRef: suppressWorktreeClickUntilRef,
    refreshSession: refreshWorktreeDragSession,
    eligibleLineageTarget: getEligibleLineageDropTarget,
    commitLineageParent: commitWorktreeLineageParentDrop,
    computeStatusDrop: computeWorktreeStatusDrop,
    computeDrop: computeWorktreeDrop,
    groups: worktreeDragGroups,
    unitGroups: worktreeDragUnitGroups,
    clearReorderedParents: clearReorderedWorktreeParents,
    clear: clearWorktreeDrag
  } = args.core
  const {
    scrollRef,
    workspaceStatuses,
    beginDrag: beginWorktreePointerDrag,
    scheduleFrame: scheduleWorktreePointerDragFrame,
    onMoveWorktreesToStatus,
    onMoveWorktreesToStatusAtIndex,
    onPinWorktrees,
    onReorderWorktrees
  } = args

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const drag = worktreePointerDragRef.current
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }
      drag.currentX = event.clientX
      drag.currentY = event.clientY
      if (!drag.active) {
        const distance = Math.hypot(drag.currentX - drag.startX, drag.currentY - drag.startY)
        if (distance < SIDEBAR_POINTER_DRAG_THRESHOLD_PX) {
          return
        }
        beginWorktreePointerDrag(drag)
      }
      event.preventDefault()
      event.stopPropagation()
      scheduleWorktreePointerDragFrame(drag)
    }

    const handlePointerUp = (event: PointerEvent): void => {
      const drag = worktreePointerDragRef.current
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }
      drag.currentX = event.clientX
      drag.currentY = event.clientY
      if (!drag.active) {
        worktreePointerDragRef.current = null
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (!refreshWorktreeDragSession()) {
        clearWorktreeDrag()
        return
      }
      const preferredStatusTarget = getEligibleLineageDropTarget(
        scrollRef.current
          ? getPointerDropStatusTarget({
              container: scrollRef.current,
              x: event.clientX,
              y: event.clientY
            })
          : { status: null, isPinDrop: false, lineageParentId: null },
        drag.draggedIds
      )
      if (preferredStatusTarget.lineageParentId) {
        commitWorktreeLineageParentDrop(drag.draggedIds, preferredStatusTarget.lineageParentId)
        clearWorktreeDrag()
        return
      }
      if (
        shouldPreferSidebarStatusDropTarget({
          sourceGroupKey: drag.sourceGroupKey,
          target: preferredStatusTarget,
          workspaceStatuses
        })
      ) {
        const statusDrop = preferredStatusTarget.status
          ? computeWorktreeStatusDrop({
              pointerY: event.clientY,
              status: preferredStatusTarget.status,
              draggedIds: drag.draggedIds
            })
          : null
        if (preferredStatusTarget.isPinDrop) {
          onPinWorktrees(drag.draggedIds)
        } else if (preferredStatusTarget.status) {
          if (statusDrop) {
            onMoveWorktreesToStatusAtIndex({
              worktreeIds: drag.draggedIds,
              status: preferredStatusTarget.status,
              dropIndex: statusDrop.dropIndex,
              groups: worktreeDragGroups
            })
          } else {
            onMoveWorktreesToStatus(drag.draggedIds, preferredStatusTarget.status)
          }
        }
        clearWorktreeDrag()
        return
      }
      const drop = computeWorktreeDrop(event.clientY)
      if (drop) {
        onReorderWorktrees({
          groups: worktreeDragGroups,
          sourceGroupKey: drag.sourceGroupKey,
          draggedIds: drag.reorderDraggedIds,
          dropIndex: getFullDropIndexForWorktreeDragUnit({
            groups: worktreeDragUnitGroups,
            sourceGroupKey: drag.sourceGroupKey,
            dropIndex: drop.dropIndex
          })
        })
        clearReorderedWorktreeParents({
          draggedIds: drag.draggedIds,
          sourceGroupKey: drag.sourceGroupKey
        })
      } else if (scrollRef.current) {
        const currentTarget = preferredStatusTarget
        const currentPreview = currentTarget.status
          ? computeWorktreeStatusDrop({
              pointerY: event.clientY,
              status: currentTarget.status,
              draggedIds: drag.draggedIds
            })
          : null
        const { target, preview: statusDrop } = resolveWorktreeSidebarStatusDropCommitTarget({
          currentTarget,
          currentPreview,
          latestTrackedTarget: drag.latestStatusDropTarget,
          x: event.clientX,
          y: event.clientY
        })
        if (target.lineageParentId) {
          commitWorktreeLineageParentDrop(drag.draggedIds, target.lineageParentId)
        } else if (target.isPinDrop) {
          onPinWorktrees(drag.draggedIds)
        } else if (target.status) {
          if (statusDrop) {
            onMoveWorktreesToStatusAtIndex({
              worktreeIds: drag.draggedIds,
              status: target.status,
              dropIndex: statusDrop.dropIndex,
              groups: worktreeDragGroups
            })
          } else {
            onMoveWorktreesToStatus(drag.draggedIds, target.status)
          }
        }
      }
      clearWorktreeDrag()
    }

    const handlePointerCancel = (event: PointerEvent): void => {
      const drag = worktreePointerDragRef.current
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }
      clearWorktreeDrag()
    }

    window.addEventListener('pointermove', handlePointerMove, { capture: true })
    window.addEventListener('pointerup', handlePointerUp, { capture: true })
    window.addEventListener('pointercancel', handlePointerCancel, { capture: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true })
      window.removeEventListener('pointerup', handlePointerUp, { capture: true })
      window.removeEventListener('pointercancel', handlePointerCancel, { capture: true })
    }
  }, [
    beginWorktreePointerDrag,
    clearWorktreeDrag,
    clearReorderedWorktreeParents,
    commitWorktreeLineageParentDrop,
    computeWorktreeDrop,
    computeWorktreeStatusDrop,
    getEligibleLineageDropTarget,
    onMoveWorktreesToStatus,
    onMoveWorktreesToStatusAtIndex,
    onPinWorktrees,
    onReorderWorktrees,
    refreshWorktreeDragSession,
    scheduleWorktreePointerDragFrame,
    scrollRef,
    worktreeDragGroups,
    worktreeDragUnitGroups,
    worktreePointerDragRef,
    workspaceStatuses
  ])

  useEffect(() => {
    const handleClick = (event: MouseEvent): void => {
      if (window.performance.now() >= suppressWorktreeClickUntilRef.current) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [suppressWorktreeClickUntilRef])
}

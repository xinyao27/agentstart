import type { WorkspaceStatusDefinition } from '@yiru/protocol/workspace/status/model'
import { useEventCallback } from '~renderer/react/use-event-callback'

import { getWorktreeSidebarDragAutoscroll } from '../worktree-sidebar-drag-autoscroll'
import {
  createSidebarDragPreview,
  setSidebarPointerDragDocumentStyles,
  updateSidebarDragPreviewPosition
} from '../worktree-sidebar-pointer-drag-dom'
import {
  areWorktreeDragPreviewOffsetsEqual,
  EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS,
  getPointerDropStatusTarget,
  shouldPreferSidebarStatusDropTarget,
  updateLatestWorktreeStatusDropTarget,
  type WorktreePointerDrag
} from './drag-state'
import type { WorktreeDragCore } from './use-drag-core'

export function usePointerDragPreview(args: {
  core: WorktreeDragCore
  scrollRef: React.RefObject<HTMLDivElement | null>
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  markScrollMovement: () => void
}) {
  const {
    pointerDragRef: worktreePointerDragRef,
    pointerAutoscrollFrameRef: worktreePointerAutoscrollFrameIdRef,
    pointerAutoscrollTimeRef: worktreePointerAutoscrollLastFrameTimeRef,
    sessionRef: worktreeDragSessionRef,
    suppressClickUntilRef: suppressWorktreeClickUntilRef,
    refreshSession: refreshWorktreeDragSession,
    eligibleLineageTarget: getEligibleLineageDropTarget,
    computeStatusDrop: computeWorktreeStatusDrop,
    computeDrop: computeWorktreeDrop,
    cancelPointerAutoscroll: cancelWorktreePointerAutoscroll,
    clear: clearWorktreeDrag,
    setDragOverStatus,
    setPinDragOver,
    setState: setWorktreeDragState
  } = args.core
  const { scrollRef, workspaceStatuses, markScrollMovement } = args

  const flushWorktreePointerDrag = () => {
    const drag = worktreePointerDragRef.current
    if (!drag) {
      return
    }
    drag.frameId = null
    if (!drag.active || !drag.preview) {
      return
    }
    updateSidebarDragPreviewPosition({
      preview: drag.preview,
      pointerX: drag.currentX,
      pointerY: drag.currentY,
      offsetX: drag.previewOffsetX,
      offsetY: drag.previewOffsetY
    })
    if (!refreshWorktreeDragSession()) {
      clearWorktreeDrag()
      return
    }
    const sidebarContainer = scrollRef.current
    const preferredStatusTarget = getEligibleLineageDropTarget(
      sidebarContainer
        ? getPointerDropStatusTarget({
            container: sidebarContainer,
            x: drag.currentX,
            y: drag.currentY
          })
        : { status: null, isPinDrop: false, lineageParentId: null },
      drag.draggedIds
    )
    if (preferredStatusTarget.lineageParentId) {
      updateLatestWorktreeStatusDropTarget(drag, preferredStatusTarget, null)
      setDragOverStatus(null)
      setPinDragOver(false)
      setWorktreeDragState((prev) =>
        prev.dropIndex === null &&
        prev.dropIndicatorY === null &&
        prev.pointerY === drag.currentY &&
        prev.previewOffsetsByWorktreeId.size === 0
          ? prev
          : {
              ...prev,
              dropIndex: null,
              dropIndicatorY: null,
              previewOffsetsByWorktreeId: EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS,
              pointerY: drag.currentY
            }
      )
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
            pointerY: drag.currentY,
            status: preferredStatusTarget.status,
            draggedIds: drag.draggedIds
          })
        : null
      if (statusDrop) {
        updateLatestWorktreeStatusDropTarget(drag, preferredStatusTarget, statusDrop)
        setDragOverStatus(null)
        setPinDragOver(false)
        setWorktreeDragState((prev) =>
          prev.dropIndex === statusDrop.dropIndex &&
          prev.dropIndicatorY === statusDrop.dropIndicatorY &&
          prev.pointerY === drag.currentY &&
          areWorktreeDragPreviewOffsetsEqual(
            prev.previewOffsetsByWorktreeId,
            statusDrop.previewOffsetsByWorktreeId
          )
            ? prev
            : { ...prev, ...statusDrop, pointerY: drag.currentY }
        )
        return
      }
      updateLatestWorktreeStatusDropTarget(drag, preferredStatusTarget, statusDrop)
      setDragOverStatus(preferredStatusTarget.status)
      setPinDragOver(preferredStatusTarget.isPinDrop)
      setWorktreeDragState((prev) =>
        prev.dropIndex === null &&
        prev.dropIndicatorY === null &&
        prev.pointerY === drag.currentY &&
        prev.previewOffsetsByWorktreeId.size === 0
          ? prev
          : {
              ...prev,
              dropIndex: null,
              dropIndicatorY: null,
              previewOffsetsByWorktreeId: EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS,
              pointerY: drag.currentY
            }
      )
      return
    }

    const drop = computeWorktreeDrop(drag.currentY)
    if (!drop) {
      const target = preferredStatusTarget
      const statusDrop = target.status
        ? computeWorktreeStatusDrop({
            pointerY: drag.currentY,
            status: target.status,
            draggedIds: drag.draggedIds
          })
        : null
      if (statusDrop) {
        updateLatestWorktreeStatusDropTarget(drag, target, statusDrop)
        setDragOverStatus(null)
        setPinDragOver(false)
        setWorktreeDragState((prev) =>
          prev.dropIndex === statusDrop.dropIndex &&
          prev.dropIndicatorY === statusDrop.dropIndicatorY &&
          prev.pointerY === drag.currentY &&
          areWorktreeDragPreviewOffsetsEqual(
            prev.previewOffsetsByWorktreeId,
            statusDrop.previewOffsetsByWorktreeId
          )
            ? prev
            : { ...prev, ...statusDrop, pointerY: drag.currentY }
        )
        return
      }
      updateLatestWorktreeStatusDropTarget(drag, target, statusDrop)
      setDragOverStatus(target.status)
      setPinDragOver(target.isPinDrop)
      setWorktreeDragState((prev) =>
        prev.dropIndex === null &&
        prev.dropIndicatorY === null &&
        prev.pointerY === drag.currentY &&
        prev.previewOffsetsByWorktreeId.size === 0
          ? prev
          : {
              ...prev,
              dropIndex: null,
              dropIndicatorY: null,
              previewOffsetsByWorktreeId: EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS,
              pointerY: drag.currentY
            }
      )
      return
    }
    drag.latestStatusDropTarget = null
    setDragOverStatus(null)
    setPinDragOver(false)
    setWorktreeDragState((prev) =>
      prev.dropIndex === drop.dropIndex &&
      prev.dropIndicatorY === drop.dropIndicatorY &&
      prev.pointerY === drag.currentY &&
      areWorktreeDragPreviewOffsetsEqual(
        prev.previewOffsetsByWorktreeId,
        drop.previewOffsetsByWorktreeId
      )
        ? prev
        : { ...prev, ...drop, pointerY: drag.currentY }
    )
  }

  const scheduleWorktreePointerDragFrame = useEventCallback((drag: WorktreePointerDrag) => {
    if (drag.frameId !== null) {
      return
    }
    drag.frameId = window.requestAnimationFrame(flushWorktreePointerDrag)
  })

  const runWorktreePointerAutoscrollFrame = (frameTime: number) => {
    worktreePointerAutoscrollFrameIdRef.current = null
    const drag = worktreePointerDragRef.current
    const container = scrollRef.current
    const session = worktreeDragSessionRef.current
    if (!drag?.active || !container || !session) {
      cancelWorktreePointerAutoscroll()
      return
    }

    const previousFrameTime = worktreePointerAutoscrollLastFrameTimeRef.current ?? frameTime
    worktreePointerAutoscrollLastFrameTimeRef.current = frameTime
    const autoscroll = getWorktreeSidebarDragAutoscroll({
      point: { clientX: drag.currentX, clientY: drag.currentY },
      containerRect: container.getBoundingClientRect(),
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      elapsedMs: frameTime - previousFrameTime
    })
    if (autoscroll) {
      markScrollMovement()
      container.scrollTop = autoscroll.scrollTop
      if (!refreshWorktreeDragSession()) {
        clearWorktreeDrag()
        return
      }
      scheduleWorktreePointerDragFrame(drag)
    }

    worktreePointerAutoscrollFrameIdRef.current = window.requestAnimationFrame(
      runWorktreePointerAutoscrollFrame
    )
  }

  const startWorktreePointerAutoscroll = () => {
    if (worktreePointerAutoscrollFrameIdRef.current !== null) {
      return
    }
    worktreePointerAutoscrollLastFrameTimeRef.current = null
    worktreePointerAutoscrollFrameIdRef.current = window.requestAnimationFrame(
      runWorktreePointerAutoscrollFrame
    )
  }

  const beginWorktreePointerDrag = useEventCallback((drag: WorktreePointerDrag) => {
    const { preview, offsetX, offsetY } = createSidebarDragPreview({
      sourceRow: drag.sourceRow,
      pointerX: drag.currentX,
      pointerY: drag.currentY,
      draggedCount: drag.draggedIds.length
    })
    drag.active = true
    drag.preview = preview
    drag.previewOffsetX = offsetX
    drag.previewOffsetY = offsetY
    suppressWorktreeClickUntilRef.current = window.performance.now() + 500
    setSidebarPointerDragDocumentStyles(true)
    worktreeDragSessionRef.current = {
      draggingWorktreeId: drag.worktreeId,
      sourceGroupKey: drag.sourceGroupKey,
      draggedIds: drag.draggedIds,
      reorderDraggedIds: drag.reorderDraggedIds,
      reorderUnitDraggedIds: drag.reorderUnitDraggedIds,
      rects: drag.rects
    }
    setWorktreeDragState({
      draggingWorktreeId: drag.worktreeId,
      sourceGroupKey: drag.sourceGroupKey,
      dropIndex: null,
      dropIndicatorY: null,
      previewOffsetsByWorktreeId: EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS,
      pointerY: drag.currentY
    })
    startWorktreePointerAutoscroll()
    scheduleWorktreePointerDragFrame(drag)
  })

  return { beginWorktreePointerDrag, scheduleWorktreePointerDragFrame }
}

import type { Worktree } from '@agentstart/protocol/worktree/model'

import { getWorktreeSidebarDragRectsForGroup } from '../worktree-sidebar-drag-autoscroll'
import { isSidebarPointerDragBlocked } from '../worktree-sidebar-pointer-drag-dom'
import type { WorktreeGroupBy } from './groups'
import type { WorktreeDragCore } from './use-drag-core'

export function createPointerDragStartHandlers(args: {
  core: WorktreeDragCore
  scrollRef: React.RefObject<HTMLDivElement | null>
  selectedWorktreeIds: ReadonlySet<string>
  selectedWorktrees: readonly Worktree[]
  groupBy: WorktreeGroupBy
}): {
  handleWorktreeRowPointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
    worktreeId: string,
    rowKey: string
  ) => void
  handleWorktreeRowClickCapture: (event: React.MouseEvent<HTMLDivElement>) => void
} {
  const handleWorktreeRowPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    worktreeId: string,
    rowKey: string
  ) => {
    if (event.button !== 0 || event.pointerType === 'touch') {
      return
    }
    const sourceRow = event.currentTarget
    if (isSidebarPointerDragBlocked(event.target, sourceRow)) {
      return
    }
    const sourceGroupKey = args.core.indexes.groupKeyByRowKey.get(rowKey)
    const container = args.scrollRef.current
    if (!sourceGroupKey || !container) {
      return
    }
    const rects = getWorktreeSidebarDragRectsForGroup(container, sourceGroupKey)
    if (rects.length <= 1 && args.groupBy !== 'workspace-status') {
      return
    }
    const draggedIds =
      args.selectedWorktreeIds.has(worktreeId) && args.selectedWorktrees.length > 1
        ? args.selectedWorktrees.map((worktree) => worktree.id)
        : [worktreeId]
    const reorderDraggedIds = args.core.getReorderDraggedIds(draggedIds)
    const reorderUnitDraggedIds = args.core.getReorderUnitDraggedIds(
      sourceGroupKey,
      reorderDraggedIds
    )
    args.core.pointerDragRef.current = {
      pointerId: event.pointerId,
      sourceRow,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      worktreeId,
      draggedIds,
      reorderDraggedIds,
      reorderUnitDraggedIds,
      sourceGroupKey,
      rects,
      active: false,
      preview: null,
      previewOffsetX: 0,
      previewOffsetY: 0,
      frameId: null,
      latestStatusDropTarget: null
    }
  }
  const handleWorktreeRowClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (window.performance.now() >= args.core.suppressClickUntilRef.current) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }
  return { handleWorktreeRowPointerDown, handleWorktreeRowClickCapture }
}

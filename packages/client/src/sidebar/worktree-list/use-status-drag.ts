import type { WorkspaceStatus } from '@yiru/protocol/workspace/status/model'
import { useEffect } from 'react'

import type { HostSectionRow } from '../host-section-rows'
import { useWorkspaceStatusDocumentDrop } from '../use-workspace-status-drop'
import { hasWorkspaceDragData, readWorkspaceDragDataIds } from '../workspace-status'
import { getFullDropIndexForWorktreeDragUnit } from '../worktree-drag-units'
import type { WorktreeDragGroup } from '../worktree-manual-order'
import { getPointerDropStatusTarget } from './drag-state'
import { PINNED_GROUP_KEY, type WorktreeGroupBy } from './groups'
import type { WorktreeDragCore } from './use-drag-core'

export function useWorkspaceStatusDrag(args: {
  core: WorktreeDragCore
  scrollRef: React.RefObject<HTMLDivElement | null>
  groupBy: WorktreeGroupBy
  rows: HostSectionRow[]
  onMoveWorktreeToStatus: (worktreeId: string, status: WorkspaceStatus) => void
  onMoveWorktreesToStatus: (worktreeIds: readonly string[], status: WorkspaceStatus) => void
  onMoveWorktreesToStatusAtIndex: (input: {
    worktreeIds: readonly string[]
    status: WorkspaceStatus
    dropIndex: number
    groups: readonly WorktreeDragGroup[]
  }) => void
  onPinWorktree: (worktreeId: string) => void
  onPinWorktrees: (worktreeIds: readonly string[]) => void
  onReorderWorktrees: (input: {
    groups: readonly WorktreeDragGroup[]
    sourceGroupKey: string
    draggedIds: readonly string[]
    dropIndex: number
  }) => void
}) {
  const {
    sessionRef: worktreeDragSessionRef,
    groups: worktreeDragGroups,
    unitGroups: worktreeDragUnitGroups,
    setDragOverStatus,
    setPinDragOver,
    computeStatusDrop: computeWorktreeStatusDrop,
    computeDrop: computeWorktreeDrop,
    refreshSession: refreshWorktreeDragSession,
    eligibleLineageTarget: getEligibleLineageDropTarget,
    commitLineageParent: commitWorktreeLineageParentDrop,
    clearReorderedParents: clearReorderedWorktreeParents,
    clear: clearWorktreeDrag
  } = args.core
  const {
    scrollRef,
    groupBy,
    rows,
    onMoveWorktreeToStatus,
    onMoveWorktreesToStatus,
    onMoveWorktreesToStatusAtIndex,
    onPinWorktree,
    onPinWorktrees,
    onReorderWorktrees
  } = args

  const hasWorkspaceDropTargets =
    groupBy === 'workspace-status' ||
    rows.some((row) => row.type === 'header' && row.key === PINNED_GROUP_KEY)

  const handleWorkspaceStatusDragOver = (event: React.DragEvent, status: WorkspaceStatus) => {
    if (!hasWorkspaceDragData(event.dataTransfer)) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverStatus(status)
  }

  const handleWorkspaceStatusDragLeave = (event: React.DragEvent) => {
    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return
    }
    setDragOverStatus(null)
  }

  const handleWorkspacePinDragOver = (event: React.DragEvent) => {
    if (!hasWorkspaceDragData(event.dataTransfer)) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setPinDragOver(true)
  }

  const handleWorkspacePinDragLeave = (event: React.DragEvent) => {
    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return
    }
    setPinDragOver(false)
  }

  const handleWorkspaceStatusDragFinish = () => {
    setDragOverStatus(null)
    setPinDragOver(false)
  }

  const handleWorkspaceStatusDrop = (event: React.DragEvent, status: WorkspaceStatus) => {
    const worktreeIds = readWorkspaceDragDataIds(event.dataTransfer)
    if (worktreeIds.length === 0) {
      return
    }
    event.preventDefault()
    const session = worktreeDragSessionRef.current
    const statusDrop = session
      ? computeWorktreeStatusDrop({
          pointerY: event.clientY,
          status,
          draggedIds: session.draggedIds
        })
      : null
    setDragOverStatus(null)
    if (session && statusDrop) {
      event.stopPropagation()
      onMoveWorktreesToStatusAtIndex({
        worktreeIds: session.draggedIds,
        status,
        dropIndex: statusDrop.dropIndex,
        groups: worktreeDragGroups
      })
      clearWorktreeDrag()
      return
    }
    onMoveWorktreesToStatus(worktreeIds, status)
  }

  useEffect(() => {
    const handleDocumentDrop = (event: DragEvent): void => {
      const session = worktreeDragSessionRef.current
      if (!session) {
        return
      }
      if (!refreshWorktreeDragSession()) {
        clearWorktreeDrag()
        return
      }
      const drop = computeWorktreeDrop(event.clientY)
      if (!drop) {
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
      // Why: status-group drops are captured before React sees them. When the
      // pointer is still inside the source group, this is a reorder rather than
      // a status move, so commit here and stop the status-drop capture handler.
      event.preventDefault()
      event.stopPropagation()
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

    document.addEventListener('drop', handleDocumentDrop, true)
    return () => document.removeEventListener('drop', handleDocumentDrop, true)
  }, [
    clearWorktreeDrag,
    clearReorderedWorktreeParents,
    commitWorktreeLineageParentDrop,
    computeWorktreeDrop,
    computeWorktreeStatusDrop,
    getEligibleLineageDropTarget,
    onMoveWorktreesToStatusAtIndex,
    onReorderWorktrees,
    refreshWorktreeDragSession,
    scrollRef,
    worktreeDragSessionRef,
    worktreeDragGroups,
    worktreeDragUnitGroups
  ])

  useEffect(() => {
    const handleDocumentDragEnd = (): void => {
      if (worktreeDragSessionRef.current) {
        clearWorktreeDrag()
      }
    }

    document.addEventListener('dragend', handleDocumentDragEnd, true)
    return () => document.removeEventListener('dragend', handleDocumentDragEnd, true)
  }, [clearWorktreeDrag, worktreeDragSessionRef])

  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== 'visible' && worktreeDragSessionRef.current) {
        clearWorktreeDrag()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [clearWorktreeDrag, worktreeDragSessionRef])

  useWorkspaceStatusDocumentDrop(
    scrollRef,
    onMoveWorktreeToStatus,
    onPinWorktree,
    handleWorkspaceStatusDragFinish,
    hasWorkspaceDropTargets,
    {
      onMoveWorktreesToStatus,
      onPinWorktrees
    }
  )

  return {
    handleWorkspaceStatusDragOver,
    handleWorkspaceStatusDragLeave,
    handleWorkspacePinDragOver,
    handleWorkspacePinDragLeave,
    handleWorkspaceStatusDrop
  }
}

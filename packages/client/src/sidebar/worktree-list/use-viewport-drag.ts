import type { RefObject } from 'react'

import type { NavigationProjectedRow } from '../navigation-row-projection'
import { createNativeDragHandlers } from './native-drag-handlers'
import { createPointerDragStartHandlers } from './pointer-drag-start'
import { useWorktreeDragCore } from './use-drag-core'
import { useNativeDragPreview } from './use-native-drag-preview'
import { usePointerDragEvents } from './use-pointer-drag-events'
import { usePointerDragPreview } from './use-pointer-drag-preview'
import { useWorkspaceStatusDrag } from './use-status-drag'
import { useVisibleWorkspaces } from './use-visible-workspaces'
import type { LegendWorktreeViewportProps } from './viewport-props'

type DragProps = Pick<
  LegendWorktreeViewportProps,
  | 'rows'
  | 'worktrees'
  | 'worktreeMap'
  | 'worktreeLineageById'
  | 'repoMap'
  | 'workspaceStatuses'
  | 'groupBy'
  | 'selectedWorktreeIds'
  | 'selectedWorktrees'
  | 'onMoveWorktreeToStatus'
  | 'onMoveWorktreesToStatus'
  | 'onMoveWorktreesToStatusAtIndex'
  | 'onPinWorktree'
  | 'onPinWorktrees'
  | 'onReorderWorktrees'
  | 'activeWorktreeId'
  | 'currentWorktreeId'
>

export function useViewportDrag(args: {
  props: DragProps
  workspaceRows: readonly NavigationProjectedRow[]
  primaryActiveRowKey?: string
  scrollRef: RefObject<HTMLDivElement | null>
  markScrollMovement: () => void
}) {
  const core = useWorktreeDragCore({
    rows: args.props.rows,
    worktrees: args.props.worktrees,
    worktreeMap: args.props.worktreeMap,
    lineageById: args.props.worktreeLineageById,
    repoMap: args.props.repoMap,
    workspaceStatuses: args.props.workspaceStatuses,
    groupBy: args.props.groupBy,
    scrollRef: args.scrollRef
  })
  const pointerPreview = usePointerDragPreview({
    core,
    scrollRef: args.scrollRef,
    workspaceStatuses: args.props.workspaceStatuses,
    markScrollMovement: args.markScrollMovement
  })
  const pointerStart = createPointerDragStartHandlers({
    core,
    scrollRef: args.scrollRef,
    selectedWorktreeIds: args.props.selectedWorktreeIds,
    selectedWorktrees: args.props.selectedWorktrees,
    groupBy: args.props.groupBy
  })
  usePointerDragEvents({
    core,
    scrollRef: args.scrollRef,
    workspaceStatuses: args.props.workspaceStatuses,
    beginDrag: pointerPreview.beginWorktreePointerDrag,
    scheduleFrame: pointerPreview.scheduleWorktreePointerDragFrame,
    onMoveWorktreesToStatus: args.props.onMoveWorktreesToStatus,
    onMoveWorktreesToStatusAtIndex: args.props.onMoveWorktreesToStatusAtIndex,
    onPinWorktrees: args.props.onPinWorktrees,
    onReorderWorktrees: args.props.onReorderWorktrees
  })
  const handleWorktreeDragOver = useNativeDragPreview({
    core,
    scrollRef: args.scrollRef,
    markScrollMovement: args.markScrollMovement
  })
  const nativeHandlers = createNativeDragHandlers({
    core,
    scrollRef: args.scrollRef,
    onMoveWorktreesToStatusAtIndex: args.props.onMoveWorktreesToStatusAtIndex,
    onReorderWorktrees: args.props.onReorderWorktrees
  })
  const visible = useVisibleWorkspaces({
    activeDescendant: {
      activeWorktreeId: args.props.activeWorktreeId,
      primaryActiveRowKey: args.primaryActiveRowKey,
      workspaceRows: args.workspaceRows
    },
    currentWorktreeId: args.props.currentWorktreeId,
    worktreeMap: args.props.worktreeMap,
    groupBy: args.props.groupBy,
    workspaceRows: args.workspaceRows
  })
  const statusHandlers = useWorkspaceStatusDrag({
    core,
    scrollRef: args.scrollRef,
    groupBy: args.props.groupBy,
    rows: args.props.rows,
    onMoveWorktreeToStatus: args.props.onMoveWorktreeToStatus,
    onMoveWorktreesToStatus: args.props.onMoveWorktreesToStatus,
    onMoveWorktreesToStatusAtIndex: args.props.onMoveWorktreesToStatusAtIndex,
    onPinWorktree: args.props.onPinWorktree,
    onPinWorktrees: args.props.onPinWorktrees,
    onReorderWorktrees: args.props.onReorderWorktrees
  })
  return {
    state: core.state,
    dragOverStatus: core.dragOverStatus,
    pinDragOver: core.pinDragOver,
    nativeLineageDropTargetId: core.nativeLineageDropTargetId,
    pointerDragRef: core.pointerDragRef,
    groupKeyByRowKey: core.indexes.groupKeyByRowKey,
    groupIndexByRowKey: core.indexes.groupIndexByRowKey,
    clear: core.clear,
    ...pointerStart,
    ...nativeHandlers,
    handleWorktreeDragOver,
    ...visible,
    ...statusHandlers
  }
}

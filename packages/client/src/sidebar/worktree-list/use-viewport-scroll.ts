import type { LegendListRef } from '@legendapp/list/react'
import type React from 'react'
import type { RefObject } from 'react'
import type { AppState } from '~renderer/store/types'

import { getLegendListScrollElement } from '../list-scroll-area'
import type { NavigationProjectedRow } from '../navigation-row-projection'
import { markWorktreeLegendScrollRoot } from '../worktree-legend-scroll-root'
import type { ProjectGroupingModel } from './groups'
import { useWorktreeNavigation } from './use-navigation'
import { useRevealFrames } from './use-reveal-frames'
import { useRevealHighlight } from './use-reveal-highlight'
import { useRowReveal } from './use-row-reveal'
import { useWorktreeReveal } from './use-worktree-reveal'
import type { LegendWorktreeViewportProps } from './viewport-props'
import type { RenderRow } from './virtual-rows'

export function useViewportScroll(args: {
  props: Pick<
    LegendWorktreeViewportProps,
    | 'pendingRevealWorktree'
    | 'pendingRevealSidebarRow'
    | 'agentSendTargetWorktreeId'
    | 'groupBy'
    | 'worktrees'
    | 'folderWorkspaces'
    | 'repoMap'
    | 'prCache'
    | 'worktreeLineageById'
    | 'worktreeMap'
    | 'clearPendingRevealWorktreeId'
    | 'clearPendingRevealSidebarRow'
    | 'toggleGroup'
    | 'collapsedGroups'
    | 'workspaceStatuses'
    | 'projectGroups'
    | 'repoOrder'
    | 'projectOrderBy'
    | 'activeWorktreeId'
    | 'activeModal'
    | 'scrollOffsetRef'
  >
  projectGrouping: ProjectGroupingModel | undefined
  settings: AppState['settings']
  keybindings: AppState['keybindings']
  renderRows: readonly RenderRow[]
  workspaceRows: readonly NavigationProjectedRow[]
  legendListRef: RefObject<LegendListRef | null>
  scrollRef: RefObject<HTMLDivElement | null>
  clearWorktreeDrag: () => void
  markScrollMovement: () => void
  setScrollRoot: (node: HTMLDivElement | null) => void
}) {
  const projectGroups = args.props.projectGroups ?? []
  const revealFrames = useRevealFrames()
  const revealHighlight = useRevealHighlight()
  useWorktreeReveal({
    pending: args.props.pendingRevealWorktree,
    agentSendTargetWorktreeId: args.props.agentSendTargetWorktreeId,
    groupBy: args.props.groupBy,
    worktrees: args.props.worktrees,
    folderWorkspaces: args.props.folderWorkspaces,
    repoMap: args.props.repoMap,
    prCache: args.props.prCache,
    lineageById: args.props.worktreeLineageById,
    worktreeMap: args.props.worktreeMap,
    renderRows: args.renderRows,
    workspaceRows: args.workspaceRows,
    clearPending: args.props.clearPendingRevealWorktreeId,
    toggleGroup: args.props.toggleGroup,
    collapsedGroups: args.props.collapsedGroups,
    workspaceStatuses: args.props.workspaceStatuses,
    settings: args.settings,
    projectGroups,
    legendListRef: args.legendListRef,
    scrollRef: args.scrollRef,
    flash: revealHighlight.flash,
    scheduleFrame: revealFrames.schedule,
    cancelFrames: revealFrames.cancel
  })
  useRowReveal({
    pending: args.props.pendingRevealSidebarRow,
    repoMap: args.props.repoMap,
    projectGroups,
    projectGrouping: args.projectGrouping,
    collapsedGroups: args.props.collapsedGroups,
    groupBy: args.props.groupBy,
    toggleGroup: args.props.toggleGroup,
    renderRows: args.renderRows,
    workspaceRows: args.workspaceRows,
    clearPending: args.props.clearPendingRevealSidebarRow,
    legendListRef: args.legendListRef,
    scrollRef: args.scrollRef,
    flash: revealHighlight.flash,
    scheduleFrame: revealFrames.schedule,
    cancelFrames: revealFrames.cancel
  })
  const handleContainerKeyDown = useWorktreeNavigation({
    groupBy: args.props.groupBy,
    worktrees: args.props.worktrees,
    repoMap: args.props.repoMap,
    prCache: args.props.prCache,
    collapsedGroups: args.props.collapsedGroups,
    repoOrder: args.props.repoOrder,
    workspaceStatuses: args.props.workspaceStatuses,
    projectOrderBy: args.props.projectOrderBy,
    lineageById: args.props.worktreeLineageById,
    worktreeMap: args.props.worktreeMap,
    settings: args.settings,
    projectGroups,
    projectGrouping: args.projectGrouping,
    activeWorktreeId: args.props.activeWorktreeId,
    renderRows: args.renderRows,
    workspaceRows: args.workspaceRows,
    legendListRef: args.legendListRef,
    scrollRef: args.scrollRef,
    activeModal: args.props.activeModal,
    keybindings: args.keybindings,
    markDirectScrollInput: args.markScrollMovement
  })
  const handleScrollPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const scrollbarWidth = event.currentTarget.offsetWidth - event.currentTarget.clientWidth
    const rect = event.currentTarget.getBoundingClientRect()
    if (scrollbarWidth > 0 && event.clientX >= rect.right - scrollbarWidth) {
      args.markScrollMovement()
    }
  }
  const setScrollRootRef = (node: HTMLDivElement | null): void => {
    if (node === null) {
      revealFrames.cancel()
      revealHighlight.clear()
      args.clearWorktreeDrag()
    }
    if (node) {
      markWorktreeLegendScrollRoot(node)
    }
    args.setScrollRoot(node)
  }
  return {
    highlightedRowKey: revealHighlight.highlightedRowKey,
    handleContainerKeyDown,
    handleScrollPointerDown,
    setLegendListScrollRootRef: (value: unknown) =>
      setScrollRootRef(getLegendListScrollElement(value))
  }
}

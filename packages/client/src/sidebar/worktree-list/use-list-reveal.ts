import { DEFAULT_SHOW_SLEEPING_WORKSPACES } from '@agentstart/protocol/settings/workspace-preferences'
import { useEffect } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import {
  SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT,
  type ScrollToCurrentWorkspaceRevealRequestDetail
} from '~renderer/sidebar/scroll-to-current-workspace-status'
import { useAppStore } from '~renderer/store/state'

import { computeClearFilterActions, sidebarHasActiveFilters } from '../visible-worktrees'
import { getKnownSidebarWorktreeById } from './folder-reveal'
import type { useListState } from './use-list-state'

type ListState = ReturnType<typeof useListState>

export function useListReveal(args: {
  state: ListState
  renderedRowKeys: ReadonlySet<string>
  renderedWorktreeIds: readonly string[]
}) {
  const setShowSleepingWorkspaces = useAppStore((state) => state.setShowSleepingWorkspaces)
  const setHideDefaultBranchWorkspace = useAppStore((state) => state.setHideDefaultBranchWorkspace)
  const setFilterRepoIds = useAppStore((state) => state.setFilterRepoIds)
  const setVisibleWorkspaceHostIds = useAppStore((state) => state.setVisibleWorkspaceHostIds)
  const filterState = {
    showSleepingWorkspaces: args.state.showSleepingWorkspaces,
    filterRepoIds: args.state.filterRepoIds,
    hideDefaultBranchWorkspace: args.state.hideDefaultBranchWorkspace,
    visibleWorkspaceHostIds: args.state.visibleWorkspaceHostIds,
    workspaceHostScope: args.state.workspaceHostScope
  }
  const hasFilters = sidebarHasActiveFilters(filterState)
  const clearFilters = useEventCallback(() => {
    const actions = computeClearFilterActions(filterState)
    if (actions.resetShowSleepingWorkspaces) {
      setShowSleepingWorkspaces(DEFAULT_SHOW_SLEEPING_WORKSPACES)
    }
    if (actions.resetFilterRepoIds) {
      setFilterRepoIds([])
    }
    if (actions.resetHideDefaultBranchWorkspace) {
      setHideDefaultBranchWorkspace(false)
    }
    if (actions.resetVisibleWorkspaceHostIds) {
      setVisibleWorkspaceHostIds(null)
    }
  })
  useEffect(() => {
    const pending = args.state.pendingRevealSidebarRow
    if (!pending) {
      return
    }
    const targetsProject =
      pending.rowKey.startsWith('project-group:') ||
      pending.rowKey.startsWith('project:') ||
      pending.rowKey.startsWith('repo:')
    if (targetsProject && args.state.groupBy !== 'repo') {
      args.state.setGroupBy('repo')
    } else if (!args.renderedRowKeys.has(pending.rowKey) && hasFilters) {
      clearFilters()
    }
  }, [args.renderedRowKeys, args.state, clearFilters, hasFilters])
  const revealCurrentWorkspace = useEventCallback((event: Event) => {
    const detail =
      event instanceof CustomEvent
        ? (event.detail as ScrollToCurrentWorkspaceRevealRequestDetail | undefined)
        : undefined
    if (detail?.target?.type === 'sidebar-row') {
      const sidebarDetail = detail as Extract<
        ScrollToCurrentWorkspaceRevealRequestDetail,
        { target: { type: 'sidebar-row' } }
      >
      args.state.revealSidebarRow(detail.target.rowKey, {
        behavior: 'smooth',
        highlight: sidebarDetail.highlight !== false
      })
      return
    }
    const currentId = args.state.currentWorktreeId
    if (!currentId) {
      return
    }
    const current = getKnownSidebarWorktreeById(
      currentId,
      args.state.worktreeMap,
      args.state.folderWorkspaces
    )
    if (!current || current.isArchived) {
      return
    }
    if (!args.renderedWorktreeIds.includes(currentId)) {
      clearFilters()
    }
    args.state.revealWorktreeInSidebar(currentId, {
      behavior: 'smooth',
      highlight: true,
      beginRename: (detail as { beginRename?: boolean } | undefined)?.beginRename === true
    })
  })
  useEffect(() => {
    window.addEventListener(
      SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT,
      revealCurrentWorkspace
    )
    return () =>
      window.removeEventListener(
        SCROLL_TO_CURRENT_WORKSPACE_REVEAL_REQUEST_EVENT,
        revealCurrentWorkspace
      )
  }, [revealCurrentWorkspace])
  return { hasFilters, clearFilters }
}

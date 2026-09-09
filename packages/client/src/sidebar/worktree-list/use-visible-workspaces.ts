import type { OnViewableItemsChangedInfo } from '@legendapp/list/react'
import type { Worktree } from '@yiru/protocol/worktree/model'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'
import { rightSidebarShowsPullRequestData } from '~renderer/workspace-panel/right-sidebar-visibility'

import type { WorkspaceSidebarProjectedRow } from '../workspace-sidebar-row-projection'
import type { WorktreeGroupBy } from './groups'
import {
  getActiveDescendantOptionId,
  type ActiveDescendantInput,
  type WorktreeItemRow
} from './row-model'

export function useVisibleWorkspaces(args: {
  activeDescendant: ActiveDescendantInput
  currentWorktreeId: string | null
  worktreeMap: Map<string, Worktree>
  groupBy: WorktreeGroupBy
  workspaceRows: readonly WorkspaceSidebarProjectedRow[]
}): {
  activeDescendantId: string | undefined
  handleViewableItemsChanged: (
    info: OnViewableItemsChangedInfo<WorkspaceSidebarProjectedRow>
  ) => void
} {
  const [visibleIndexes, setVisibleIndexes] = useState<readonly number[]>([])
  const [visibilityRevision, setVisibilityRevision] = useState(0)
  const lastRefreshKeyRef = useRef('')
  const reportVisibleRef = useRef<(indexes: readonly number[]) => void>(() => {})
  const reportCandidates = useAppStore((state) => state.reportVisibleGitHubPRRefreshCandidates)
  const cardProperties = useAppStore((state) => state.worktreeCardProperties)
  const activeView = useAppStore((state) => state.activeView)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const rightSidebarOpen = useAppStore((state) => state.rightSidebarOpen)
  const rightSidebarTab = useAppStore((state) => state.rightSidebarTab)
  const catalog = useProjectCatalog()
  const rightSidebarShowsPR = rightSidebarShowsPullRequestData({
    activeView,
    activeWorktreeId,
    repos: catalog.repos,
    rightSidebarOpen,
    rightSidebarTab,
    worktreesByRepo: projectCatalogRepoBuckets(catalog).worktreesByRepo
  })
  const sshGeneration = useAppStore((state) => state.sshConnectedGeneration)
  const prGeneration = useAppStore((state) => state.prVisibleRefreshGeneration)

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') {
        lastRefreshKeyRef.current = '__document_hidden__'
        return
      }
      setVisibilityRevision((revision) => revision + 1)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const reportVisible = useEventCallback((indexes: readonly number[]) => {
    if (document.visibilityState !== 'visible') {
      lastRefreshKeyRef.current = '__document_hidden__'
      return
    }
    const currentWorktree = args.currentWorktreeId
      ? (args.worktreeMap.get(args.currentWorktreeId) ?? null)
      : null
    const hasGitHubReview = currentWorktree !== null
    const tracksSidebarWorktree = rightSidebarShowsPR && hasGitHubReview
    const tracksVisibleRows = args.groupBy === 'pr-status' || cardProperties.includes('status')
    if (!tracksVisibleRows && !tracksSidebarWorktree) {
      if (lastRefreshKeyRef.current !== '__hidden__') {
        lastRefreshKeyRef.current = '__hidden__'
        reportCandidates([], Date.now())
      }
      return
    }
    const visibleRows = indexes
      .map((index) => args.workspaceRows[index])
      .map((projected) => (projected?.kind === 'local' ? projected.row : undefined))
      .filter((row): row is WorktreeItemRow => row?.type === 'item')
      .filter((row) => row.repo?.kind === 'git' && !row.worktree.isBare && row.worktree.branch)
    const ids = new Set(visibleRows.map((row) => row.worktree.id))
    if (
      tracksSidebarWorktree &&
      currentWorktree &&
      !currentWorktree.isBare &&
      currentWorktree.branch
    ) {
      ids.add(currentWorktree.id)
    }
    const visibleIdentity = visibleRows
      .map((row) => `${row.worktree.id}:${row.worktree.branch}:${row.worktree.linkedPR ?? ''}`)
      .join('|')
    const sidebarIdentity =
      tracksSidebarWorktree && currentWorktree
        ? `${currentWorktree.id}:${currentWorktree.branch}:${currentWorktree.linkedPR ?? ''}`
        : ''
    const key = `${visibleIdentity}:${sidebarIdentity}:${sshGeneration}:${prGeneration}:${cardProperties.join(',')}`
    if (!key || key === lastRefreshKeyRef.current) {
      return
    }
    lastRefreshKeyRef.current = key
    reportCandidates([...ids], Date.now())
  })
  useLayoutEffect(() => {
    reportVisibleRef.current = reportVisible
  }, [reportVisible])

  const handleViewableItemsChanged = (
    info: OnViewableItemsChangedInfo<WorkspaceSidebarProjectedRow>
  ) => {
    const indexes = info.viewableItems.map((item) => item.index).sort((left, right) => left - right)
    setVisibleIndexes((current) =>
      current.length === indexes.length &&
      current.every((index, position) => index === indexes[position])
        ? current
        : indexes
    )
    reportVisibleRef.current(indexes)
  }
  useEffect(() => {
    reportVisible(visibleIndexes)
  }, [reportVisible, visibilityRevision, visibleIndexes])

  return {
    activeDescendantId: getActiveDescendantOptionId({
      ...args.activeDescendant,
      visibleIndexes
    }),
    handleViewableItemsChanged
  }
}

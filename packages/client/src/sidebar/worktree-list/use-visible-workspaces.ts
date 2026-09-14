import type { Worktree } from '@agentstart/protocol/worktree/model'
import type { OnViewableItemsChangedInfo } from '@legendapp/list/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'
import { workspacePanelShowsPullRequestData } from '~renderer/workspace-panel/workspace-panel-visibility'

import type { NavigationProjectedRow } from '../navigation-row-projection'
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
  workspaceRows: readonly NavigationProjectedRow[]
}): {
  activeDescendantId: string | undefined
  handleViewableItemsChanged: (info: OnViewableItemsChangedInfo<NavigationProjectedRow>) => void
} {
  const [visibleIndexes, setVisibleIndexes] = useState<readonly number[]>([])
  const [visibilityRevision, setVisibilityRevision] = useState(0)
  const lastRefreshKeyRef = useRef('')
  const reportVisibleRef = useRef<(indexes: readonly number[]) => void>(() => {})
  const reportCandidates = useAppStore((state) => state.reportVisibleGitHubPRRefreshCandidates)
  const cardProperties = useAppStore((state) => state.worktreeCardProperties)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const workspacePanelOpen = useAppStore((state) => state.workspacePanelOpen)
  const workspacePanelTab = useAppStore((state) => state.workspacePanelTab)
  const catalog = useProjectCatalog()
  const workspacePanelShowsPR = useAppStore((state) =>
    workspacePanelShowsPullRequestData({
      activeGroupIdByWorktree: state.activeGroupIdByWorktree,
      activeWorktreeId,
      groupsByWorktree: state.groupsByWorktree,
      repos: catalog.repos,
      unifiedTabsByWorktree: state.unifiedTabsByWorktree,
      workspacePanelOpen,
      workspacePanelTab,
      worktreesByRepo: projectCatalogRepoBuckets(catalog).worktreesByRepo
    })
  )
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
    const tracksSidebarWorktree = workspacePanelShowsPR && hasGitHubReview
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

  const handleViewableItemsChanged = (info: OnViewableItemsChangedInfo<NavigationProjectedRow>) => {
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

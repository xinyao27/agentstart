import type { GitBranchChangeEntry } from '@yiru/protocol/git/branch-compare-types'
import type { GitHistoryItem } from '@yiru/protocol/git/history-types'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { getRepoOwnerRoutedSettings } from '~renderer/repo/runtime-owner'
import { useRepoById, useWorktreeById } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'

import { showWorkspaceSidebar } from '../show-sidebar'
import type { SourceControlRowOpenEvent } from '../source-control/split-open'
import { useGitHistoryCommitActions } from '../use-git-history-commit-actions'
import { collectGitGraphBranchOptions, filterGitGraphItemsByBranches } from './branch-filter'
import { DEFAULT_GIT_GRAPH_COLUMN_WIDTHS, type GitGraphColumnWidths } from './column-widths'
import {
  computeGitGraphFindMatches,
  EMPTY_GIT_GRAPH_FIND_STATE,
  stepGitGraphFindIndex
} from './find-state'
import { EMPTY_GIT_GRAPH_STATE } from './state'
import { useGitGraphCommitWriteActions } from './use-commit-write-actions'

// Why: bounds selectParent's auto-load-more loop (below) so a parent id that
// can never surface — filtered out by the branch selector, or genuinely
// missing — can't page through history forever.
const MAX_PARENT_LOAD_MORE_ATTEMPTS = 20

const EMPTY_GIT_STATUS_ENTRIES: readonly unknown[] = []
// Why: a stable identity for "no commits yet" keeps every memo/callback below
// keyed on `items` from re-running every render — `graphState.result?.items
// ?? []` would otherwise allocate a fresh empty array each render.
const EMPTY_GIT_GRAPH_ITEMS: readonly GitHistoryItem[] = []

type GitGraphFindCursor = {
  query: string
  index: number
}

function waitForGitGraphLoad(worktreeId: string): Promise<void> {
  return new Promise((resolve) => {
    let unsubscribe = (): void => undefined
    const completeWhenReady = (state: ReturnType<typeof useAppStore.getState>): void => {
      if (state.gitGraphByWorktree[worktreeId]?.status !== 'loading-more') {
        unsubscribe()
        resolve()
      }
    }
    unsubscribe = useAppStore.subscribe(completeWhenReady)
    completeWhenReady(useAppStore.getState())
  })
}

export function useGitGraphView({ worktreeId, tabId }: { worktreeId: string; tabId: string }) {
  const worktree = useWorktreeById(worktreeId)
  const repo = useRepoById(worktree?.repoId ?? null)
  const settings = useAppStore((s) => s.settings)
  const activeRepoSettings = (() => getRepoOwnerRoutedSettings(settings, repo ?? null))()
  const worktreePath = worktree?.path ?? null

  const graphState = useAppStore((s) => s.gitGraphByWorktree[worktreeId] ?? EMPTY_GIT_GRAPH_STATE)
  const refreshGitGraph = useAppStore((s) => s.refreshGitGraph)
  const loadMoreGitGraph = useAppStore((s) => s.loadMoreGitGraph)
  const closeUnifiedTab = useAppStore((s) => s.closeUnifiedTab)
  const includeRemoteBranches = useAppStore(
    (s) => s.gitGraphIncludeRemoteBranchesByWorktree[worktreeId] ?? true
  )
  const setGitGraphIncludeRemoteBranches = useAppStore((s) => s.setGitGraphIncludeRemoteBranches)
  const selectedRefIds = useAppStore((s) => s.gitGraphSelectedRefIdsByWorktree[worktreeId] ?? null)
  const setGitGraphSelectedRefIds = useAppStore((s) => s.setGitGraphSelectedRefIds)
  const columnWidths = useAppStore(
    (s) => s.gitGraphColumnWidthsByWorktree[worktreeId] ?? DEFAULT_GIT_GRAPH_COLUMN_WIDTHS
  )
  const setGitGraphColumnWidths = useAppStore((s) => s.setGitGraphColumnWidths)
  const dirtyEntries = useAppStore(
    (s) => s.gitStatusByWorktree[worktreeId] ?? EMPTY_GIT_STATUS_ENTRIES
  )

  useEffect(() => {
    void refreshGitGraph(worktreeId)
  }, [refreshGitGraph, worktreeId])

  const loadedItems = graphState.result?.items ?? EMPTY_GIT_GRAPH_ITEMS
  const isLoading = graphState.status === 'loading' || graphState.status === 'refreshing'
  const isLoadingMore = graphState.status === 'loading-more'

  // Why: branch options list every ref seen on the loaded page regardless of
  // the current filter, so a filtered-down view can still reach every branch
  // in the dropdown.
  const branchOptions = (() => collectGitGraphBranchOptions(loadedItems))()
  // Why: this is the set actually rendered — the graph layout and find
  // matches must be built from it, not from `loadedItems`, or the SVG lanes
  // and search hits would include commits no row exists for.
  const items = (() => filterGitGraphItemsByBranches(loadedItems, selectedRefIds))()

  const [expandedCommitId, setExpandedCommitId] = useState<string | null>(null)
  const toggleExpand = (id: string) => {
    setExpandedCommitId((current) => (current === id ? null : id))
  }

  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState(EMPTY_GIT_GRAPH_FIND_STATE.query)
  const [findCursor, setFindCursor] = useState<GitGraphFindCursor>({
    query: EMPTY_GIT_GRAPH_FIND_STATE.query,
    index: EMPTY_GIT_GRAPH_FIND_STATE.currentIndex
  })
  const findMatchIds = (() => computeGitGraphFindMatches(items, findQuery))()
  const findIndex =
    findMatchIds.length === 0
      ? -1
      : findCursor.query === findQuery
        ? Math.min(findCursor.index, findMatchIds.length - 1)
        : 0
  const currentFindCommitId = findIndex >= 0 ? (findMatchIds[findIndex] ?? null) : null
  const findMatchIdSet = (() => new Set(findMatchIds))()

  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const scrollToCommit = useEventCallback((id: string) => {
    rowRefs.current.get(id)?.scrollIntoView({ block: 'center' })
  })

  useEffect(() => {
    if (currentFindCommitId) {
      scrollToCommit(currentFindCommitId)
    }
  }, [currentFindCommitId, scrollToCommit])

  const stepFind = (direction: 1 | -1) => {
    setFindCursor({
      query: findQuery,
      index: stepGitGraphFindIndex(findMatchIds.length, findIndex, direction)
    })
  }

  const closeFind = useEventCallback(() => {
    setFindOpen(false)
    setFindQuery('')
  })

  useEffect(() => {
    const isMac = navigator.userAgent.includes('Mac')
    const handleKeyDown = (event: KeyboardEvent): void => {
      const modifierPressed = isMac ? event.metaKey : event.ctrlKey
      if (modifierPressed && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setFindOpen(true)
      } else if (event.key === 'Escape' && findOpen) {
        closeFind()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeFind, findOpen])

  const resolveSplitTargetGroupId = (): string | undefined => undefined
  const {
    loadCommitFiles,
    openHistoryCommitDiff,
    openCommitFile,
    handleCommitAction: handleReadCommitAction
  } = useGitHistoryCommitActions({
    activeWorktreeId: worktreeId,
    worktreePath,
    activeRepoSettings,
    resolveSplitTargetGroupId
  })
  const { handleCommitAction, writeDialog, isWriting, closeWriteDialog, submitWriteDialog } =
    useGitGraphCommitWriteActions({
      worktreeId,
      worktreePath,
      activeRepoSettings,
      onReadAction: handleReadCommitAction
    })

  const openFile = (entry: GitBranchChangeEntry, event?: SourceControlRowOpenEvent) => {
    const item = items.find((candidate) => expandedCommitId === candidate.id)
    if (item) {
      openCommitFile(item, entry, event)
    }
  }

  const openAllChanges = (commitId: string) => {
    const item = items.find((candidate) => candidate.id === commitId)
    if (item) {
      void openHistoryCommitDiff(item)
    }
  }

  // Why: a parent hash from a collapsed commit's details may not be on the
  // loaded page yet (skip-based paging). Rather than silently do nothing,
  // keep loading further pages until the parent shows up in `items` or there
  // is no more history / the attempt bound below is hit.
  const parentSelectionRunRef = useRef(0)

  const selectParent = (parentId: string) => {
    const runId = parentSelectionRunRef.current + 1
    parentSelectionRunRef.current = runId
    void (async () => {
      let attempts = 0
      while (parentSelectionRunRef.current === runId) {
        const state = useAppStore.getState()
        const currentGraph = state.gitGraphByWorktree[worktreeId] ?? EMPTY_GIT_GRAPH_STATE
        const currentRefIds = state.gitGraphSelectedRefIdsByWorktree[worktreeId] ?? null
        const currentItems = filterGitGraphItemsByBranches(
          currentGraph.result?.items ?? EMPTY_GIT_GRAPH_ITEMS,
          currentRefIds
        )
        if (currentItems.some((item) => item.id === parentId)) {
          setExpandedCommitId(parentId)
          requestAnimationFrame(() => {
            if (parentSelectionRunRef.current === runId) {
              scrollToCommit(parentId)
            }
          })
          return
        }
        if (currentGraph.status === 'loading-more') {
          await waitForGitGraphLoad(worktreeId)
          continue
        }
        if (!currentGraph.result?.hasMore || attempts >= MAX_PARENT_LOAD_MORE_ATTEMPTS) {
          toast.error(
            translate(
              'auto.components.workspace-panel.git-graph.useGitGraphView.a1b2c3d4e6',
              'Could not find that commit in the loaded history'
            )
          )
          return
        }
        attempts += 1
        await loadMoreGitGraph(worktreeId)
      }
    })()
  }

  useEffect(() => {
    return () => {
      parentSelectionRunRef.current += 1
    }
  }, [worktreeId])

  const handleColumnWidthsChange = (widths: GitGraphColumnWidths) =>
    setGitGraphColumnWidths(worktreeId, widths)

  const close = () => closeUnifiedTab(tabId)
  const openUncommittedChanges = () => showWorkspaceSidebar({ view: 'source-control', worktreeId })

  return {
    graphState,
    items,
    // Why: view.tsx needs this to tell "filter matched zero commits in the
    // loaded page, but more history could still be fetched" apart from
    // "there is genuinely no more history to load" — both render as an empty
    // `items` array otherwise.
    hasLoadedItems: loadedItems.length > 0,
    isFiltered: selectedRefIds !== null,
    isLoading,
    isLoadingMore,
    hasMore: graphState.result?.hasMore ?? false,
    currentCommitId: graphState.result?.currentRef?.revision,
    isDirty: dirtyEntries.length > 0,
    branchOptions,
    selectedRefIds,
    setGitGraphSelectedRefIds: (refIds: string[] | null) =>
      setGitGraphSelectedRefIds(worktreeId, refIds),
    includeRemoteBranches,
    setIncludeRemoteBranches: (include: boolean) =>
      setGitGraphIncludeRemoteBranches(worktreeId, include),
    columnWidths,
    onColumnWidthsChange: handleColumnWidthsChange,
    expandedCommitId,
    toggleExpand,
    selectParent,
    rowRefs,
    loadCommitFiles,
    openFile,
    openAllChanges,
    handleCommitAction,
    writeDialog,
    isWriting,
    closeWriteDialog,
    submitWriteDialog,
    findOpen,
    setFindOpen,
    findQuery,
    setFindQuery,
    findIndex,
    findMatchIdSet,
    currentFindCommitId,
    stepFind,
    closeFind,
    onRefresh: () => void refreshGitGraph(worktreeId),
    onLoadMore: () => void loadMoreGitGraph(worktreeId),
    onOpenUncommittedChanges: openUncommittedChanges,
    onCloseGraph: close
  }
}

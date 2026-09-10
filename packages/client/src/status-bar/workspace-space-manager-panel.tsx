import type { WorkspaceSpaceWorktreeValue as WorkspaceSpaceWorktree } from '@agentstart/protocol'
import type { GitStatusResult } from '@agentstart/protocol/git/status-types'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useAppStore } from '~renderer/store/state'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import { prepareActiveWorktreeFocusAfterDelete } from '../sidebar/active-worktree-focus-after-delete'
import { runWorktreeBatchDelete } from '../sidebar/delete-worktree/flow'
import { refreshGitStatusForWorktree } from '../workspace-panel/git-status-refresh'
import { useWorkspaceSpaceDecisions } from './use-workspace-space-decisions'
import type { WorkspaceGitRefreshState } from './workspace-space-decision'
import { WorkspaceSpaceOverview } from './workspace-space-overview'
import {
  filterWorkspaceSpaceRows,
  getLargestWorkspaceSpaceRowSize,
  getSelectedDeletableWorkspaceIds,
  getVisibleDeletableWorkspaceIds,
  getWorkspaceSpaceGitStatusRefreshCandidates,
  isWorkspaceSpaceRowReadyToDelete,
  pruneWorkspaceSpaceSelectedIds,
  resolveWorkspaceSpaceInspectedWorktreeId,
  resolveWorkspaceSpaceTreemapZoomWorktreeId,
  sortWorkspaceSpaceRows,
  type WorkspaceSpaceSortDirection,
  type WorkspaceSpaceSortKey
} from './workspace-space-presentation'
import { WorkspaceSpaceTable } from './workspace-space-table'

const GIT_STATUS_REFRESH_CONCURRENCY = 6

export function WorkspaceSpaceManagerPanel(): React.JSX.Element {
  const analysis = useAppStore((state) => state.workspaceSpaceAnalysis)
  const scanError = useAppStore((state) => state.workspaceSpaceScanError)
  const isScanning = useAppStore((state) => state.workspaceSpaceScanning)
  const refreshWorkspaceSpace = useAppStore((state) => state.refreshWorkspaceSpace)
  const cancelWorkspaceSpaceScan = useAppStore((state) => state.cancelWorkspaceSpaceScan)
  const removeWorkspaceSpaceWorktrees = useAppStore((state) => state.removeWorkspaceSpaceWorktrees)
  const removeWorktree = useAppStore((state) => state.removeWorktree)
  const deleteStateByWorktreeId = useAppStore((state) => state.deleteStateByWorktreeId)
  const settings = useAppStore((state) => state.settings)
  const setGitStatus = useAppStore((state) => state.setGitStatus)
  const updateWorktreeGitIdentity = useAppStore((state) => state.updateWorktreeGitIdentity)
  const setUpstreamStatus = useAppStore((state) => state.setUpstreamStatus)
  const fetchUpstreamStatus = useAppStore((state) => state.fetchUpstreamStatus)
  const { repos } = useProjectCatalog()
  const [query, setQuery] = useState('')
  const [onlyDeletable, setOnlyDeletable] = useState(false)
  const [sortKey, setSortKey] = useState<WorkspaceSpaceSortKey>('size')
  const [sortDirection, setSortDirection] = useState<WorkspaceSpaceSortDirection>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [inspectedWorktreeId, setInspectedWorktreeId] = useState<string | null>(null)
  const [treemapZoomWorktreeId, setTreemapZoomWorktreeId] = useState<string | null>(null)
  const [gitRefreshStateByWorktreeId, setGitRefreshStateByWorktreeId] = useState<
    Record<string, WorkspaceGitRefreshState>
  >({})
  const inFlightGitStatusRefreshes = useRef<Set<string>>(new Set())

  const refresh = (): void => {
    void refreshWorkspaceSpace().catch(() => {
      /* scanError is stored by the slice */
    })
  }

  const cancelScan = (): void => {
    void cancelWorkspaceSpaceScan()
  }

  const sourceRows = (() => analysis?.worktrees ?? [])()
  const decisionDetailsByWorktreeId = useWorkspaceSpaceDecisions(sourceRows)
  const isWorktreeDeleting = (worktreeId: string): boolean =>
    deleteStateByWorktreeId[worktreeId]?.isDeleting ?? false
  const refreshWorkspaceGitStatus = useEventCallback(
    (worktree: WorkspaceSpaceWorktree): Promise<void> => {
      const currentState = useAppStore.getState()
      if (currentState.gitStatusByWorktree[worktree.worktreeId] !== undefined) {
        return Promise.resolve()
      }
      if (inFlightGitStatusRefreshes.current.has(worktree.worktreeId)) {
        return Promise.resolve()
      }
      inFlightGitStatusRefreshes.current.add(worktree.worktreeId)

      setGitRefreshStateByWorktreeId((current) => ({
        ...current,
        [worktree.worktreeId]: { isRefreshing: true, error: null }
      }))

      return refreshGitStatusForWorktree({
        settings,
        worktreeId: worktree.worktreeId,
        worktreePath: worktree.path,
        connectionId: repos.find((repo) => repo.id === worktree.repoId)?.connectionId ?? undefined,
        deps: {
          setGitStatus,
          updateWorktreeGitIdentity,
          setUpstreamStatus,
          fetchUpstreamStatus
        }
      })
        .then(() => {
          if (useAppStore.getState().gitStatusByWorktree[worktree.worktreeId] === undefined) {
            setGitStatus(worktree.worktreeId, {
              conflictOperation: 'unknown',
              entries: [],
              ignoredPaths: []
            } as GitStatusResult)
          }
          setGitRefreshStateByWorktreeId((current) => ({
            ...current,
            [worktree.worktreeId]: { isRefreshing: false, error: null }
          }))
        })
        .catch((error: unknown) => {
          setGitRefreshStateByWorktreeId((current) => ({
            ...current,
            [worktree.worktreeId]: {
              isRefreshing: false,
              error: error instanceof Error ? error.message : String(error)
            }
          }))
        })
        .finally(() => {
          inFlightGitStatusRefreshes.current.delete(worktree.worktreeId)
        })
    }
  )
  const isWorktreeUnavailableForDelete = (worktreeId: string): boolean => {
    if (isWorktreeDeleting(worktreeId)) {
      return true
    }
    const worktree = sourceRows.find((row) => row.worktreeId === worktreeId)
    return (
      !worktree ||
      !isWorkspaceSpaceRowReadyToDelete(worktree, decisionDetailsByWorktreeId.get(worktreeId))
    )
  }

  const rows = (() =>
    sortWorkspaceSpaceRows(
      filterWorkspaceSpaceRows(sourceRows, query, onlyDeletable),
      sortKey,
      sortDirection
    ))()

  const nextInspectedWorktreeId = resolveWorkspaceSpaceInspectedWorktreeId(
    sourceRows,
    inspectedWorktreeId
  )
  const nextSelectedIds = pruneWorkspaceSpaceSelectedIds(sourceRows, selectedIds)
  const nextTreemapZoomWorktreeId = resolveWorkspaceSpaceTreemapZoomWorktreeId(
    sourceRows,
    treemapZoomWorktreeId
  )
  // Why: these ids are local UI state derived from the latest scan rows. Repair
  // them before commit so stale selections cannot flash after a scan changes.
  if (inspectedWorktreeId !== nextInspectedWorktreeId) {
    setInspectedWorktreeId(nextInspectedWorktreeId)
  }
  if (nextSelectedIds !== selectedIds) {
    setSelectedIds(nextSelectedIds)
  }
  if (treemapZoomWorktreeId !== nextTreemapZoomWorktreeId) {
    setTreemapZoomWorktreeId(nextTreemapZoomWorktreeId)
  }

  useEffect(() => {
    const candidates = getWorkspaceSpaceGitStatusRefreshCandidates(sourceRows)
    if (candidates.length === 0) {
      return
    }

    let cancelled = false
    let nextIndex = 0
    const runWorker = async (): Promise<void> => {
      while (!cancelled) {
        const worktree = candidates[nextIndex]
        nextIndex += 1
        if (!worktree) {
          return
        }
        await refreshWorkspaceGitStatus(worktree)
      }
    }
    const workerCount = Math.min(GIT_STATUS_REFRESH_CONCURRENCY, candidates.length)
    void Promise.all(Array.from({ length: workerCount }, () => runWorker()))

    return () => {
      cancelled = true
    }
  }, [refreshWorkspaceGitStatus, sourceRows])

  const inspectedWorktree =
    rows.find((row) => row.worktreeId === nextInspectedWorktreeId) ??
    rows.find((row) => row.status === 'ok') ??
    null
  const zoomedWorktree =
    sourceRows.find((row) => row.worktreeId === nextTreemapZoomWorktreeId && row.status === 'ok') ??
    null
  const maxSize = getLargestWorkspaceSpaceRowSize(rows)
  const selectedDeletableIds = (() =>
    getSelectedDeletableWorkspaceIds(rows, nextSelectedIds, isWorktreeUnavailableForDelete))()
  const selectedDeletableIdSet = (() => new Set(selectedDeletableIds))()
  const visibleDeletableIds = (() =>
    getVisibleDeletableWorkspaceIds(rows, isWorktreeUnavailableForDelete))()
  const allVisibleSelected =
    visibleDeletableIds.length > 0 && visibleDeletableIds.every((id) => nextSelectedIds.has(id))
  const someVisibleSelected = visibleDeletableIds.some((id) => nextSelectedIds.has(id))
  const visibleSelectionState = allVisibleSelected ? true : someVisibleSelected ? 'mixed' : false
  const isInitialScan = isScanning && !analysis
  const hasRows = sourceRows.length > 0
  const selectedReclaimableBytes = (() =>
    rows
      .filter((row) => selectedDeletableIdSet.has(row.worktreeId))
      .reduce((sum, row) => sum + row.reclaimableBytes, 0))()

  const toggleSort = (key: WorkspaceSpaceSortKey): void => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'name' || key === 'repo' ? 'asc' : 'desc')
  }

  const selectSortKey = (key: WorkspaceSpaceSortKey): void => {
    setSortKey(key)
    setSortDirection(key === 'name' || key === 'repo' ? 'asc' : 'desc')
  }

  const toggleSelection = (worktreeId: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(worktreeId)) {
        next.delete(worktreeId)
      } else {
        next.add(worktreeId)
      }
      return next
    })
  }

  const toggleVisibleSelection = (): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        for (const id of visibleDeletableIds) {
          next.delete(id)
        }
      } else {
        for (const id of visibleDeletableIds) {
          next.add(id)
        }
      }
      return next
    })
  }

  const handleDeletedWorktrees = (deletedIds: readonly string[]): void => {
    if (deletedIds.length === 0) {
      return
    }
    removeWorkspaceSpaceWorktrees(deletedIds)
    setInspectedWorktreeId((current) => (current && deletedIds.includes(current) ? null : current))
    setTreemapZoomWorktreeId((current) =>
      current && deletedIds.includes(current) ? null : current
    )
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const id of deletedIds) {
        next.delete(id)
      }
      return next
    })
    toast.success(
      deletedIds.length === 1
        ? translate(
            'auto.components.status.bar.WorkspaceSpaceManagerPanel.9afc97f9a3',
            'Workspace deleted'
          )
        : translate(
            'auto.components.status.bar.WorkspaceSpaceManagerPanel.eee5240810',
            'Workspaces deleted'
          ),
      {
        description: translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.63efebe0e6',
          '{{value0}} {{value1}} removed from Space.',
          {
            value0: deletedIds.length,
            value1: deletedIds.length === 1 ? 'workspace' : 'workspaces'
          }
        )
      }
    )
  }

  const deleteWorktrees = (worktreeIds: readonly string[]): void => {
    if (worktreeIds.length === 0) {
      return
    }
    runWorktreeBatchDelete(worktreeIds, {
      forceConfirm: true,
      onDeleted: handleDeletedWorktrees
    })
  }

  const forceDeleteWorktree = (worktree: WorkspaceSpaceWorktree): void => {
    // Why: Space keeps normal deletes non-force so uncommitted work is not
    // discarded silently; a failed row gets this explicit recovery path.
    const commitFocus = prepareActiveWorktreeFocusAfterDelete(worktree.worktreeId)
    void removeWorktree(worktree.worktreeId, true)
      .then((result) => {
        if (!result.ok) {
          toast.error(
            translate(
              'auto.components.status.bar.WorkspaceSpaceManagerPanel.2965415393',
              'Force delete failed'
            ),
            {
              description: result.error
            }
          )
          return
        }
        commitFocus()
        handleDeletedWorktrees([worktree.worktreeId])
      })
      .catch((error: unknown) => {
        toast.error(
          translate(
            'auto.components.status.bar.WorkspaceSpaceManagerPanel.2965415393',
            'Force delete failed'
          ),
          {
            description: error instanceof Error ? error.message : String(error)
          }
        )
      })
  }

  const deleteSelected = (): void => {
    if (selectedDeletableIds.length === 0) {
      return
    }
    deleteWorktrees(selectedDeletableIds)
  }

  return (
    <div className="space-y-5">
      <WorkspaceSpaceOverview
        analysis={analysis}
        scanError={scanError}
        isScanning={isScanning}
        rows={sourceRows}
        isInitialScan={isInitialScan}
        inspectedWorktree={inspectedWorktree}
        zoomedWorktree={zoomedWorktree}
        selectedCount={selectedDeletableIds.length}
        selectedReclaimableBytes={selectedReclaimableBytes}
        query={query}
        sortKey={sortKey}
        onlyDeletable={onlyDeletable}
        visibleDeletableCount={visibleDeletableIds.length}
        allVisibleSelected={allVisibleSelected}
        onRefresh={refresh}
        onCancelScan={cancelScan}
        onInspect={setInspectedWorktreeId}
        onTreemapZoom={setTreemapZoomWorktreeId}
        onClearSelection={() => setSelectedIds(new Set())}
        onDeleteSelected={deleteSelected}
        onQueryChange={setQuery}
        onSortKeyChange={selectSortKey}
        onToggleOnlyDeletable={() => setOnlyDeletable((current) => !current)}
        onToggleVisibleSelection={toggleVisibleSelection}
      />
      <WorkspaceSpaceTable
        rows={rows}
        maxSize={maxSize}
        isInitialScan={isInitialScan}
        hasSourceRows={hasRows}
        hasAnalysis={analysis !== null}
        scanError={scanError}
        visibleSelectionState={visibleSelectionState}
        visibleDeletableCount={visibleDeletableIds.length}
        allVisibleSelected={allVisibleSelected}
        sortKey={sortKey}
        sortDirection={sortDirection}
        selectedIds={nextSelectedIds}
        inspectedWorktreeId={inspectedWorktree?.worktreeId ?? null}
        decisionDetailsByWorktreeId={decisionDetailsByWorktreeId}
        gitRefreshStateByWorktreeId={gitRefreshStateByWorktreeId}
        deleteStateByWorktreeId={deleteStateByWorktreeId}
        onToggleVisibleSelection={toggleVisibleSelection}
        onToggleSort={toggleSort}
        onToggleSelected={toggleSelection}
        onInspect={setInspectedWorktreeId}
        onOpenWorkspace={activateAndRevealWorktree}
        onDelete={(worktreeId) => deleteWorktrees([worktreeId])}
        onForceDelete={forceDeleteWorktree}
      />
    </div>
  )
}

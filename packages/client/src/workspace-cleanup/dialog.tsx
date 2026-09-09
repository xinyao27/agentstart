import type { WorkspaceCleanupCandidate } from '@yiru/protocol'
import { isGitRepoKind } from '@yiru/protocol/project/repository'
import { canQueueWorkspaceCleanupCandidate } from '@yiru/protocol/workspace/cleanup-policy'
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { useAppStore } from '~renderer/store/state'
import { Dialog, DialogContent } from '~renderer/ui/dialog'
import { activateAndRevealWorktree } from '~renderer/worktree/activation'

import { ConfirmRemove } from './confirmation'
import { WorkspaceCleanupContent } from './content'
import {
  DEFAULT_FILTERS,
  formatScanNoticeMessage,
  formatWorkspaceCleanupReadyToastDescription,
  getDefaultSelectedWorkspaceCleanupIds,
  toggleSetMember
} from './dialog-model'
import {
  filterWorkspaceCleanupCandidates,
  getWorkspaceCleanupReviewInfo,
  sortWorkspaceCleanupCandidates,
  type WorkspaceCleanupFilters,
  type WorkspaceCleanupReviewInfo,
  type WorkspaceCleanupSortDirection,
  type WorkspaceCleanupSortKey
} from './presentation'
import { useWorkspaceCleanupRemoval } from './use-removal'
import { resolveWorkspaceCleanupActiveView, type WorkspaceCleanupView } from './view-selection'

export default function WorkspaceCleanupDialog(): React.JSX.Element {
  const activeModal = useAppStore((state) => state.activeModal)
  const openModal = useAppStore((state) => state.openModal)
  const closeModal = useAppStore((state) => state.closeModal)
  const scan = useAppStore((state) => state.workspaceCleanupScan)
  const scanProgress = useAppStore((state) => state.workspaceCleanupProgress)
  const loading = useAppStore((state) => state.workspaceCleanupLoading)
  const error = useAppStore((state) => state.workspaceCleanupError)
  const scanWorkspaceCleanup = useAppStore((state) => state.scanWorkspaceCleanup)
  const markCandidateViewed = useAppStore((state) => state.markWorkspaceCleanupCandidateViewed)
  const dismissCandidates = useAppStore((state) => state.dismissWorkspaceCleanupCandidates)
  const resetDismissals = useAppStore((state) => state.resetWorkspaceCleanupDismissals)
  const catalog = useProjectCatalog()
  const { repos } = catalog
  const { worktreesByRepo } = projectCatalogRepoBuckets(catalog)
  const reviewUiStateInputs = useAppStore(
    useShallow((state) => ({
      hostedReviewCache: state.hostedReviewCache,
      settings: state.settings
    }))
  )
  const reviewStateInputs = { ...reviewUiStateInputs, repos, worktreesByRepo }
  const deletingWorktreeIds = useAppStore(
    useShallow(
      (state) =>
        new Set(
          Object.entries(state.deleteStateByWorktreeId)
            .filter(([, deleteState]) => deleteState.isDeleting)
            .map(([worktreeId]) => worktreeId)
        )
    )
  )

  const open = activeModal === 'workspace-cleanup'
  const openRef = useRef(open)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(() => new Set())
  const [activeView, setActiveView] = useState<WorkspaceCleanupView>('ready')
  const [repoSelection, setRepoSelection] = useState<ReadonlySet<string>>(() => new Set())
  const [filters, setFilters] = useState<WorkspaceCleanupFilters>(DEFAULT_FILTERS)
  const [sortKey, setSortKey] = useState<WorkspaceCleanupSortKey>('activity')
  const [sortDirection, setSortDirection] = useState<WorkspaceCleanupSortDirection>('asc')
  const autoScanAttemptedForOpenRef = useRef(false)
  const latestReadyToastScanAtRef = useRef<number | null>(null)
  const wasOpenRef = useRef(false)
  const mountedRef = useMountedRef()

  const closeCleanup = (): void => {
    setActiveView('ready')
    setFilters(DEFAULT_FILTERS)
    setSortKey('activity')
    setSortDirection('asc')
    setSelectedIds(new Set())
    closeModal()
  }

  const deselectRemovedIds = useEventCallback((removedIds: readonly string[]) => {
    if (removedIds.length === 0) {
      return
    }
    setSelectedIds((current) => {
      const next = new Set(current)
      for (const id of removedIds) {
        next.delete(id)
      }
      return next
    })
  })
  const removal = useWorkspaceCleanupRemoval({
    loading,
    onSelectOnly: (worktreeId) => setSelectedIds(new Set([worktreeId])),
    onRemoved: deselectRemovedIds,
    onClose: closeCleanup
  })

  useEffect(() => {
    openRef.current = open
  }, [open])

  const startScan = useEventCallback((options: { notifyWhenReady?: boolean } = {}) => {
    void scanWorkspaceCleanup()
      .then((result) => {
        if (mountedRef.current) {
          setSelectedIds(
            getDefaultSelectedWorkspaceCleanupIds(result.candidates, deletingWorktreeIds)
          )
          removal.resetForScan()
        }
        if (!mountedRef.current || !options.notifyWhenReady || openRef.current) {
          return
        }
        if (latestReadyToastScanAtRef.current === result.scannedAt) {
          return
        }
        latestReadyToastScanAtRef.current = result.scannedAt
        const suggestedCount = result.candidates.filter(
          (candidate) => candidate.selectedByDefault
        ).length
        toast.success(
          translate(
            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.0e2d235c63',
            'Inactive workspace scan ready'
          ),
          {
            description: formatWorkspaceCleanupReadyToastDescription(
              result.candidates.length,
              suggestedCount
            ),
            action: {
              label: translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.4a35c08764',
                'Review'
              ),
              onClick: () => openModal('workspace-cleanup')
            }
          }
        )
      })
      .catch((scanError: unknown) => {
        if (mountedRef.current) {
          toast.error(
            translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.662b8ec3f8',
              'Workspace cleanup scan failed'
            ),
            { description: scanError instanceof Error ? scanError.message : String(scanError) }
          )
        }
      })
  })

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      autoScanAttemptedForOpenRef.current = false
      return
    }
    if (!wasOpenRef.current) {
      wasOpenRef.current = true
      autoScanAttemptedForOpenRef.current = false
      if (!removal.isInFlight()) {
        removal.resetForOpen()
      }
    }
    // Why: a scan started during deletion would be invalidated by the removal batch.
    if (!loading && !autoScanAttemptedForOpenRef.current && !removal.isInFlight()) {
      autoScanAttemptedForOpenRef.current = true
      startScan({ notifyWhenReady: true })
    }
  }, [loading, open, removal, startScan])

  const candidates = scan?.candidates ?? []
  const eligibleRepos = repos.filter((repo) => isGitRepoKind(repo))
  const eligibleRepoIds = eligibleRepos.map((repo) => repo.id)
  const effectiveRepoSelection =
    repoSelection.size > 0 || eligibleRepoIds.length === 0
      ? repoSelection
      : new Set(eligibleRepoIds)
  const filteredCandidates =
    effectiveRepoSelection.size === 0 || effectiveRepoSelection.size === eligibleRepoIds.length
      ? candidates
      : candidates.filter((candidate) => effectiveRepoSelection.has(candidate.repoId))
  const reviewInfoByWorktreeId = new Map<string, WorkspaceCleanupReviewInfo>()
  for (const candidate of candidates) {
    reviewInfoByWorktreeId.set(
      candidate.worktreeId,
      getWorkspaceCleanupReviewInfo(candidate, reviewStateInputs)
    )
  }

  const visibleCandidates = sortWorkspaceCleanupCandidates(
    filteredCandidates.filter((candidate) => !candidate.blockers.includes('dismissed')),
    'activity',
    'asc',
    reviewInfoByWorktreeId
  )
  const hiddenCandidates = sortWorkspaceCleanupCandidates(
    filteredCandidates.filter((candidate) => candidate.blockers.includes('dismissed')),
    'activity',
    'asc',
    reviewInfoByWorktreeId
  )
  const groups = {
    ready: visibleCandidates.filter((candidate) => candidate.tier === 'ready'),
    review: visibleCandidates.filter((candidate) => candidate.tier === 'review'),
    protected: visibleCandidates.filter((candidate) => candidate.tier === 'protected')
  }
  const cleanupViewCounts = {
    ready: groups.ready.length,
    review: groups.review.length,
    protected: groups.protected.length,
    hidden: hiddenCandidates.length
  }
  const resolvedActiveView = resolveWorkspaceCleanupActiveView({
    requestedView: activeView,
    counts: cleanupViewCounts,
    open,
    loading,
    hasScan: scan != null
  })
  const activeBaseRows =
    resolvedActiveView === 'hidden' ? hiddenCandidates : groups[resolvedActiveView]
  const activeRows = sortWorkspaceCleanupCandidates(
    filterWorkspaceCleanupCandidates(
      activeBaseRows,
      filters,
      reviewInfoByWorktreeId,
      scan?.scannedAt ?? 0
    ),
    sortKey,
    sortDirection,
    reviewInfoByWorktreeId
  )
  const selectedCandidates = [...selectedIds]
    .map((id) => activeRows.find((candidate) => candidate.worktreeId === id))
    .filter(
      (candidate): candidate is WorkspaceCleanupCandidate =>
        candidate != null &&
        canQueueWorkspaceCleanupCandidate(candidate) &&
        !deletingWorktreeIds.has(candidate.worktreeId)
    )

  const ignoreCandidate = (candidate: WorkspaceCleanupCandidate): void => {
    void dismissCandidates([candidate])
      .then(() => {
        if (mountedRef.current) {
          deselectRemovedIds([candidate.worktreeId])
        }
      })
      .catch((dismissError: unknown) => {
        if (mountedRef.current) {
          toast.error(
            translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.7f451a3e2c',
              'Could not ignore cleanup suggestion'
            ),
            {
              description:
                dismissError instanceof Error ? dismissError.message : String(dismissError)
            }
          )
        }
      })
  }
  const viewCandidate = (candidate: WorkspaceCleanupCandidate): void => {
    markCandidateViewed(candidate)
    closeCleanup()
    activateAndRevealWorktree(candidate.worktreeId)
  }
  const repoNameById = new Map(repos.map((repo) => [repo.id, repo.displayName || repo.path]))
  const scanNoticeMessage = formatScanNoticeMessage(
    (scan?.errors ?? []).filter((scanError) => effectiveRepoSelection.has(scanError.repoId)),
    repoNameById
  )
  const hasAnyCandidates = candidates.length > 0

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && closeCleanup()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(820px,90vh)] w-[calc(100vw-3rem)] max-w-[calc(100vw-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-3rem)] xl:w-[920px] xl:max-w-[920px]"
      >
        {removal.confirming ? (
          <ConfirmRemove
            candidates={removal.confirmCandidates}
            reviewInfoByWorktreeId={reviewInfoByWorktreeId}
            progress={removal.progress}
            onCancel={removal.cancel}
            onConfirm={removal.confirm}
          />
        ) : (
          <WorkspaceCleanupContent
            loading={loading}
            initialLoading={loading && !hasAnyCandidates}
            hasAnyCandidates={hasAnyCandidates}
            scanProgress={scanProgress}
            error={error}
            scanNoticeMessage={scanNoticeMessage}
            selectedCount={selectedCandidates.length}
            eligibleRepos={eligibleRepos}
            eligibleRepoIds={eligibleRepoIds}
            effectiveRepoSelection={effectiveRepoSelection}
            selectedCandidates={selectedCandidates}
            activeView={resolvedActiveView}
            cleanupViewCounts={cleanupViewCounts}
            filteredCandidateCount={filteredCandidates.length}
            hiddenCandidateCount={hiddenCandidates.length}
            filters={filters}
            sortKey={sortKey}
            sortDirection={sortDirection}
            activeRows={activeRows}
            activeBaseRowCount={activeBaseRows.length}
            candidateCount={candidates.length}
            hasScan={scan != null}
            visibleCandidateCount={visibleCandidates.length}
            reviewInfoByWorktreeId={reviewInfoByWorktreeId}
            expandedRowIds={expandedRowIds}
            deletingWorktreeIds={deletingWorktreeIds}
            selectedIds={selectedIds}
            rowFailures={removal.rowFailures}
            onClose={closeCleanup}
            onRefresh={() => startScan({ notifyWhenReady: true })}
            onRepoSelectionChange={setRepoSelection}
            onViewChange={setActiveView}
            onFiltersChange={setFilters}
            onSortKeyChange={setSortKey}
            onSortDirectionChange={setSortDirection}
            onResetDismissals={() => void resetDismissals()}
            onOpenConfirmation={removal.openConfirmation}
            onToggleExpanded={(id) => setExpandedRowIds((current) => toggleSetMember(current, id))}
            onToggleSelected={(id) => setSelectedIds((current) => toggleSetMember(current, id))}
            onViewCandidate={viewCandidate}
            onIgnoreCandidate={ignoreCandidate}
            onRemoveRow={removal.removeRow}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

import type { WorkspaceCleanupCandidate, WorkspaceCleanupScanProgress } from '@agentstart/protocol'
import type { Repo } from '@agentstart/protocol/project/repository'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  Trash as Trash2,
  ArrowCounterClockwise as RefreshCcw,
  X
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import RepoMultiCombobox from '~renderer/repo/multi-combobox'
import { Button } from '~renderer/ui/button'
import { DialogHeader, DialogTitle } from '~renderer/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { WorkspaceCleanupCandidateList } from './candidate-list'
import { CandidateRow } from './candidate-row'
import {
  DEFAULT_FILTERS,
  EMPTY_REVIEW_INFO,
  formatRelativeTime,
  formatWorkspaceCleanupProgress
} from './dialog-model'
import { WorkspaceCleanupFilterToolbar } from './filter-toolbar'
import { WorkspaceCleanupListNotices } from './list-notices'
import type {
  WorkspaceCleanupFilters,
  WorkspaceCleanupReviewInfo,
  WorkspaceCleanupSortDirection,
  WorkspaceCleanupSortKey
} from './presentation'
import { CleanupViewNav } from './view-nav'
import type { WorkspaceCleanupView, WorkspaceCleanupViewCounts } from './view-selection'

type WorkspaceCleanupContentProps = {
  loading: boolean
  initialLoading: boolean
  hasAnyCandidates: boolean
  scanProgress: WorkspaceCleanupScanProgress | null
  error: string | null
  scanNoticeMessage: string | null
  selectedCount: number
  eligibleRepos: Repo[]
  eligibleRepoIds: string[]
  effectiveRepoSelection: ReadonlySet<string>
  selectedCandidates: WorkspaceCleanupCandidate[]
  activeView: WorkspaceCleanupView
  cleanupViewCounts: WorkspaceCleanupViewCounts
  filteredCandidateCount: number
  hiddenCandidateCount: number
  filters: WorkspaceCleanupFilters
  sortKey: WorkspaceCleanupSortKey
  sortDirection: WorkspaceCleanupSortDirection
  activeRows: WorkspaceCleanupCandidate[]
  activeBaseRowCount: number
  candidateCount: number
  hasScan: boolean
  visibleCandidateCount: number
  reviewInfoByWorktreeId: ReadonlyMap<string, WorkspaceCleanupReviewInfo>
  expandedRowIds: ReadonlySet<string>
  deletingWorktreeIds: ReadonlySet<string>
  selectedIds: ReadonlySet<string>
  rowFailures: Record<string, string>
  onClose: () => void
  onRefresh: () => void
  onRepoSelectionChange: (selection: Set<string>) => void
  onViewChange: (view: WorkspaceCleanupView) => void
  onFiltersChange: (filters: WorkspaceCleanupFilters) => void
  onSortKeyChange: (sortKey: WorkspaceCleanupSortKey) => void
  onSortDirectionChange: (direction: WorkspaceCleanupSortDirection) => void
  onResetDismissals: () => void
  onOpenConfirmation: (candidates: readonly WorkspaceCleanupCandidate[]) => void
  onToggleExpanded: (worktreeId: string) => void
  onToggleSelected: (worktreeId: string) => void
  onViewCandidate: (candidate: WorkspaceCleanupCandidate) => void
  onIgnoreCandidate: (candidate: WorkspaceCleanupCandidate) => void
  onRemoveRow: (candidate: WorkspaceCleanupCandidate) => void
}

export function WorkspaceCleanupContent({
  loading,
  initialLoading,
  hasAnyCandidates,
  scanProgress,
  error,
  scanNoticeMessage,
  selectedCount,
  eligibleRepos,
  eligibleRepoIds,
  effectiveRepoSelection,
  selectedCandidates,
  activeView,
  cleanupViewCounts,
  filteredCandidateCount,
  hiddenCandidateCount,
  filters,
  sortKey,
  sortDirection,
  activeRows,
  activeBaseRowCount,
  candidateCount,
  hasScan,
  visibleCandidateCount,
  reviewInfoByWorktreeId,
  expandedRowIds,
  deletingWorktreeIds,
  selectedIds,
  rowFailures,
  onClose,
  onRefresh,
  onRepoSelectionChange,
  onViewChange,
  onFiltersChange,
  onSortKeyChange,
  onSortDirectionChange,
  onResetDismissals,
  onOpenConfirmation,
  onToggleExpanded,
  onToggleSelected,
  onViewCandidate,
  onIgnoreCandidate,
  onRemoveRow
}: WorkspaceCleanupContentProps): React.JSX.Element {
  return (
    <>
      <DialogHeader className="border-border border-b px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <DialogTitle className="min-w-0 text-base">
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.b2c1331844',
              'Delete Inactive Workspaces'
            )}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.7ae2ad30f4',
                      'Refresh'
                    )}
                    onClick={onRefresh}
                    disabled={loading}
                  >
                    {loading ? (
                      <LoadingIndicator className="size-3.5" />
                    ) : (
                      <RefreshCcw className="size-3.5" />
                    )}
                  </Button>
                }
              />
              <TooltipContent side="bottom" sideOffset={4}>
                {translate(
                  'auto.components.workspace.cleanup.WorkspaceCleanupDialog.7ae2ad30f4',
                  'Refresh'
                )}
              </TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.191f0bc98e',
                'Close'
              )}
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </DialogHeader>

      {initialLoading ? (
        <div className="border-border bg-muted/25 flex items-start gap-2 border-b px-5 py-3">
          <LoadingIndicator className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-foreground text-xs font-medium">
              {translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.7eee951968',
                'Checking inactive workspaces'
              )}
            </div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.47123d0108',
                'Scanning inactive workspaces. You can close this and come back.'
              )}
            </div>
            <div className="text-muted-foreground mt-1 text-xs font-medium">
              {formatWorkspaceCleanupProgress(scanProgress)}
            </div>
          </div>
        </div>
      ) : hasAnyCandidates ? (
        <div className="border-border bg-muted/25 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="text-foreground min-w-0 text-sm font-medium">
            {selectedCount}{' '}
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.ac5ba84cc1',
              'selected'
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {eligibleRepos.length > 1 ? (
              <div className="w-[220px] max-w-full">
                <RepoMultiCombobox
                  repos={eligibleRepos}
                  selected={effectiveRepoSelection}
                  onChange={(next) => onRepoSelectionChange(new Set(next))}
                  onSelectAll={() => onRepoSelectionChange(new Set(eligibleRepoIds))}
                  triggerClassName="h-8 w-full border border-border/60 bg-background px-2 text-xs font-medium hover:bg-accent/60"
                />
              </div>
            ) : null}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onOpenConfirmation(selectedCandidates)}
              disabled={selectedCount === 0 || loading}
            >
              <Trash2 className="size-3.5" />
              {translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.b771c92598',
                'Delete selected'
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {loading && hasScan && hasAnyCandidates ? (
        <div className="border-border bg-muted/25 border-b px-5 py-2">
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <LoadingIndicator className="size-3.5 shrink-0" />
            <span>
              {translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.9a3be9f2df',
                'Scanning inactive workspaces. New rows appear here as they finish. You can close this and come back.'
              )}
            </span>
            <span className="text-foreground font-medium">
              {formatWorkspaceCleanupProgress(scanProgress)}
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="border-destructive/30 bg-destructive/10 text-destructive border-b px-5 py-2 text-xs">
          {error}
        </div>
      ) : scanNoticeMessage ? (
        <div className="border-border bg-muted/25 text-muted-foreground flex items-center gap-2 border-b px-5 py-2 text-xs">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>{scanNoticeMessage}</span>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[185px_minmax(0,1fr)]">
        <CleanupViewNav
          activeView={activeView}
          counts={cleanupViewCounts}
          onViewChange={onViewChange}
        />
        <div className="border-border flex min-h-0 min-w-0 flex-col border-t md:border-t-0 md:border-l">
          {filteredCandidateCount > 0 ? (
            <WorkspaceCleanupFilterToolbar
              filters={filters}
              showRestoreIgnored={activeView === 'hidden' && hiddenCandidateCount > 0}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onFiltersChange={onFiltersChange}
              onSortKeyChange={onSortKeyChange}
              onSortDirectionChange={onSortDirectionChange}
              onRestoreIgnored={onResetDismissals}
            />
          ) : null}
          <WorkspaceCleanupCandidateList
            rows={activeRows}
            header={
              <WorkspaceCleanupListNotices
                activeBaseRowCount={activeBaseRowCount}
                activeFilters={hasActiveFilters(filters)}
                activeRowCount={activeRows.length}
                candidateCount={candidateCount}
                filteredCandidateCount={filteredCandidateCount}
                hasScan={hasScan}
                initialLoading={initialLoading}
                loading={loading}
                scanNoticeMessage={scanNoticeMessage}
                visibleCandidateCount={visibleCandidateCount}
                onClearFilters={() => onFiltersChange(DEFAULT_FILTERS)}
                onShowAllRepos={() => onRepoSelectionChange(new Set(eligibleRepoIds))}
                onShowIgnored={() => onViewChange('hidden')}
              />
            }
            renderRow={(candidate, index) => (
              <CandidateRow
                key={candidate.worktreeId}
                candidate={candidate}
                reviewInfo={reviewInfoByWorktreeId.get(candidate.worktreeId) ?? EMPTY_REVIEW_INFO}
                last={activeRows.length > 1 && index === activeRows.length - 1}
                expanded={expandedRowIds.has(candidate.worktreeId)}
                lastActivityLabel={formatRelativeTime(candidate.lastActivityAt)}
                removing={loading || deletingWorktreeIds.has(candidate.worktreeId)}
                selected={
                  selectedIds.has(candidate.worktreeId) &&
                  !loading &&
                  !deletingWorktreeIds.has(candidate.worktreeId)
                }
                failure={rowFailures[candidate.worktreeId]}
                onToggleExpanded={onToggleExpanded}
                onToggleSelected={onToggleSelected}
                onView={onViewCandidate}
                onIgnore={onIgnoreCandidate}
                onRemove={onRemoveRow}
              />
            )}
          />
        </div>
      </div>
    </>
  )
}

function hasActiveFilters(filters: WorkspaceCleanupFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.time !== 'all' ||
    filters.review !== 'all' ||
    filters.git !== 'all' ||
    filters.context !== 'all'
  )
}

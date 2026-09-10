import type {
  PRCheckDetail,
  PRCheckRunDetails
} from '@agentstart/protocol/hosted-review/review-types'
import { useEffect, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import { getAttachedWorktreesForFolderWorkspace } from './folder-workspace-attached-worktrees'
import { FolderWorkspacePrChecksRow } from './folder-workspace-pr-checks-row'
import { createParentPrChecksProjectionSelector } from './parent-pr-checks-projection-selector'
import {
  getParentPrChecksRefreshCandidates,
  runLimitedParentPrChecksRefreshes
} from './parent-pr-checks-refresh'
import type { ParentPrChecksRefreshOutcome, ParentPrChecksRow } from './parent-pr-checks-rows'
import { RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME } from './right-sidebar-button-styles'

type FolderWorkspacePrChecksPanelProps = {
  isVisible?: boolean
}

export default function FolderWorkspacePrChecksPanel({
  isVisible = true
}: FolderWorkspacePrChecksPanelProps): React.JSX.Element {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const activeWorkspaceKey = useAppStore((s) => s.activeWorkspaceKey)
  const {
    folderWorkspaces,
    repos,
    workspaceLineageByChildKey,
    worktreeLineageById,
    worktreesByRepo
  } = useProjectCatalog()
  const settings = useAppStore((s) => s.settings)
  const fetchHostedReviewForBranch = useAppStore((s) => s.fetchHostedReviewForBranch)
  const fetchPRChecks = useAppStore((s) => s.fetchPRChecks)
  const fetchPRCheckDetails = useAppStore((s) => s.fetchPRCheckDetails)
  const [refreshOutcomes, setRefreshOutcomes] = useState<
    ReadonlyMap<string, ParentPrChecksRefreshOutcome>
  >(() => new Map())
  const [expandedRowIds, setExpandedRowIds] = useState<ReadonlySet<string>>(() => new Set())
  const [manualRefreshGeneration, setManualRefreshGeneration] = useState(0)
  const lastForcedManualRefreshGenerationRef = useRef(0)

  const { folderWorkspace, childWorktrees } = (() =>
    getAttachedWorktreesForFolderWorkspace({
      activeWorkspaceKey,
      activeWorktreeId,
      folderWorkspaces,
      workspaceLineageByChildKey,
      worktreeLineageById,
      worktreesByRepo
    }))()
  const projectionSelector = (() =>
    createParentPrChecksProjectionSelector({
      worktrees: childWorktrees,
      repos,
      settings,
      refreshOutcomes
    }))()
  const projection = useAppStore(projectionSelector)
  const folderWorkspaceId = folderWorkspace?.id ?? null
  const headerSummary = (() => formatReviewChecksHeaderSummary(projection.summary))()
  const refreshCandidates = (() =>
    getParentPrChecksRefreshCandidates({ worktrees: childWorktrees, repos }))()
  const refreshCandidateSignature = (() =>
    refreshCandidates
      .map((candidate) =>
        [candidate.identity, candidate.repo.path, candidate.repo.executionHostId ?? ''].join('|')
      )
      .sort()
      .join(';;'))()
  const refreshCandidatesRef = useRef(refreshCandidates)

  useEffect(() => {
    refreshCandidatesRef.current = refreshCandidates
  }, [refreshCandidates])

  useEffect(() => {
    const candidates = refreshCandidatesRef.current
    if (!isVisible || !folderWorkspaceId || childWorktrees.length === 0) {
      return
    }
    if (candidates.length === 0) {
      return
    }
    // Why: manual refresh should force exactly one generation; automatic
    // refresh cycles after that must stay cache/staleness-aware.
    const forceRefresh = manualRefreshGeneration > lastForcedManualRefreshGenerationRef.current
    if (forceRefresh) {
      lastForcedManualRefreshGenerationRef.current = manualRefreshGeneration
    }
    let cancelled = false
    void runLimitedParentPrChecksRefreshes({
      candidates,
      concurrency: 3,
      force: forceRefresh,
      fetchHostedReviewForBranch,
      fetchPRChecks,
      onOutcome: (identity, outcome) => {
        if (cancelled) {
          return
        }
        setRefreshOutcomes((current) => new Map(current).set(identity, outcome))
      }
    })
    return () => {
      cancelled = true
    }
  }, [
    isVisible,
    folderWorkspaceId,
    childWorktrees.length,
    fetchHostedReviewForBranch,
    fetchPRChecks,
    refreshCandidateSignature,
    manualRefreshGeneration
  ])

  const currentRefreshIdentities = (() =>
    new Set(refreshCandidates.map((candidate) => candidate.identity)))()
  const isRefreshing = [...refreshOutcomes.entries()].some(
    ([identity, outcome]) => currentRefreshIdentities.has(identity) && outcome.kind === 'loading'
  )

  const validRowIds = new Set(projection.rows.map((row) => row.id))
  const visibleExpandedRowIds = new Set([...expandedRowIds].filter((id) => validRowIds.has(id)))

  const toggleRowExpanded = (rowId: string): void => {
    setExpandedRowIds((current) => {
      const next = new Set(current)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  const loadCheckDetails = (
    row: ParentPrChecksRow,
    check: PRCheckDetail
  ): Promise<PRCheckRunDetails | null> => {
    if (!row.repo) {
      return Promise.resolve(null)
    }
    return fetchPRCheckDetails(
      row.repo.path,
      {
        checkRunId: check.checkRunId,
        workflowRunId: check.workflowRunId,
        checkName: check.name,
        url: check.url,
        prRepo: null
      },
      { repoId: row.repo.id }
    )
  }

  if (!folderWorkspace) {
    return (
      <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm">
        {translate(
          'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.unavailable',
          'PR checks are only shown for folder workspaces.'
        )}
      </div>
    )
  }

  return (
    <div className="bg-background text-foreground flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-border border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-foreground truncate text-sm font-medium">
              {translate(
                'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.reviewChecks',
                'Review checks'
              )}
            </div>
            {headerSummary ? (
              <div className="text-muted-foreground mt-1 truncate text-xs">{headerSummary}</div>
            ) : null}
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  className={RIGHT_SIDEBAR_BUTTON_SURFACE_CLASS_NAME}
                  onClick={() => setManualRefreshGeneration((generation) => generation + 1)}
                  disabled={childWorktrees.length === 0 || isRefreshing}
                  aria-label={translate(
                    'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.refresh',
                    'Refresh PR checks'
                  )}
                >
                  {isRefreshing ? (
                    <LoadingIndicator className="size-3.5" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                </Button>
              }
            />
            <TooltipContent side="bottom">
              {translate(
                'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.refresh',
                'Refresh PR checks'
              )}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {childWorktrees.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="text-foreground text-sm font-medium">
            {translate(
              'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.emptyTitle',
              'No attached worktrees yet'
            )}
          </div>
          <div className="text-muted-foreground mt-2 max-w-[16rem] text-xs leading-5">
            {translate(
              'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.emptyCopy',
              'PR checks will appear here after worktrees are attached to this folder workspace.'
            )}
          </div>
        </div>
      ) : (
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <div className="space-y-1">
            {projection.rows.map((row) => (
              <FolderWorkspacePrChecksRow
                key={row.id}
                row={row}
                expanded={visibleExpandedRowIds.has(row.id)}
                onToggle={() => toggleRowExpanded(row.id)}
                onLoadCheckDetails={(check) => loadCheckDetails(row, check)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatReviewChecksHeaderSummary(summary: {
  attached: number
  failing: number
  pending: number
  passing: number
}): string | null {
  if (summary.attached === 0) {
    return null
  }
  const worktreeCount = formatWorktreeCount(summary.attached)
  const attentionParts = [
    summary.failing > 0 ? formatFailingCount(summary.failing) : null,
    summary.pending > 0 ? formatPendingCount(summary.pending) : null
  ].filter((part): part is string => part !== null)

  if (attentionParts.length > 0) {
    return [...attentionParts, worktreeCount].join(' · ')
  }
  if (summary.passing === summary.attached) {
    return [
      worktreeCount,
      translate(
        'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.allChecksPassing',
        'all checks passing'
      )
    ].join(' · ')
  }
  return worktreeCount
}

function formatWorktreeCount(count: number): string {
  return count === 1
    ? translate(
        'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.oneWorktree',
        '1 worktree'
      )
    : translate(
        'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.worktreeCount',
        '{{value0}} worktrees',
        { value0: count }
      )
}

function formatFailingCount(count: number): string {
  return count === 1
    ? translate('auto.components.rightSidebar.FolderWorkspacePrChecksPanel.oneFailing', '1 failing')
    : translate(
        'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.failingCount',
        '{{value0}} failing',
        { value0: count }
      )
}

function formatPendingCount(count: number): string {
  return count === 1
    ? translate('auto.components.rightSidebar.FolderWorkspacePrChecksPanel.onePending', '1 pending')
    : translate(
        'auto.components.rightSidebar.FolderWorkspacePrChecksPanel.pendingCount',
        '{{value0}} pending',
        { value0: count }
      )
}

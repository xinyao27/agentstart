import type {
  WorkspaceSpaceAnalysisValue as WorkspaceSpaceAnalysis,
  WorkspaceSpaceWorktreeValue as WorkspaceSpaceWorktree
} from '@yiru/protocol'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  HardDrive,
  ArrowClockwise as RefreshCw,
  X
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'

import { BreakdownList } from './workspace-space-breakdown'
import { formatBytes, getWorkspaceSpaceScanningLabel } from './workspace-space-format'
import { Metric, UpdatedMetric } from './workspace-space-metrics'
import type { WorkspaceSpaceSortKey } from './workspace-space-presentation'
import { FilterToolbar, SelectionToolbar } from './workspace-space-toolbar'
import { WorkspaceTreemap } from './workspace-space-treemap'

type WorkspaceSpaceOverviewProps = {
  analysis: WorkspaceSpaceAnalysis | null
  scanError: string | null
  isScanning: boolean
  rows: WorkspaceSpaceWorktree[]
  isInitialScan: boolean
  inspectedWorktree: WorkspaceSpaceWorktree | null
  zoomedWorktree: WorkspaceSpaceWorktree | null
  selectedCount: number
  selectedReclaimableBytes: number
  query: string
  sortKey: WorkspaceSpaceSortKey
  onlyDeletable: boolean
  visibleDeletableCount: number
  allVisibleSelected: boolean
  onRefresh: () => void
  onCancelScan: () => void
  onInspect: (worktreeId: string) => void
  onTreemapZoom: (worktreeId: string | null) => void
  onClearSelection: () => void
  onDeleteSelected: () => void
  onQueryChange: (query: string) => void
  onSortKeyChange: (key: WorkspaceSpaceSortKey) => void
  onToggleOnlyDeletable: () => void
  onToggleVisibleSelection: () => void
}

export function WorkspaceSpaceOverview({
  analysis,
  scanError,
  isScanning,
  rows,
  isInitialScan,
  inspectedWorktree,
  zoomedWorktree,
  selectedCount,
  selectedReclaimableBytes,
  query,
  sortKey,
  onlyDeletable,
  visibleDeletableCount,
  allVisibleSelected,
  onRefresh,
  onCancelScan,
  onInspect,
  onTreemapZoom,
  onClearSelection,
  onDeleteSelected,
  onQueryChange,
  onSortKeyChange,
  onToggleOnlyDeletable,
  onToggleVisibleSelection
}: WorkspaceSpaceOverviewProps): React.JSX.Element {
  const hasRows = rows.length > 0
  const repoErrors = analysis?.repos.filter((repo) => repo.error !== null) ?? []
  return (
    <>
      <div className="border-border/65 bg-background/35 md:divide-border/60 grid overflow-hidden border md:grid-cols-4 md:divide-x">
        <Metric
          label={translate(
            'auto.components.status.bar.WorkspaceSpaceManagerPanel.09960d86bd',
            'Scanned'
          )}
          value={analysis ? formatBytes(analysis.totalSizeBytes) : '—'}
        />
        <Metric
          label={translate(
            'auto.components.status.bar.WorkspaceSpaceManagerPanel.83f1a0a932',
            'Reclaimable'
          )}
          value={analysis ? formatBytes(analysis.reclaimableBytes) : '—'}
        />
        <Metric
          label={translate(
            'auto.components.status.bar.WorkspaceSpaceManagerPanel.43171f3e60',
            'Workspaces'
          )}
          value={
            analysis
              ? analysis.unavailableWorktreeCount > 0
                ? `${analysis.scannedWorktreeCount}/${analysis.worktreeCount}`
                : String(analysis.scannedWorktreeCount)
              : '—'
          }
        />
        <UpdatedMetric scannedAt={analysis?.scannedAt ?? null} isScanning={isScanning} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
          {isScanning ? (
            <LoadingIndicator className="size-4 shrink-0" />
          ) : (
            <HardDrive className="size-4 shrink-0" />
          )}
          <span className="truncate">{getScanSummary(analysis, isScanning)}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={isScanning ? onCancelScan : onRefresh}
          className="w-28 gap-1.5"
        >
          {isScanning ? <X className="size-3.5" /> : <RefreshCw className="size-3.5" />}
          {getScanActionLabel(analysis !== null, isScanning)}
        </Button>
      </div>

      {scanError ? (
        <div className="border-destructive/35 bg-destructive/8 text-destructive flex items-start gap-2 border px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">
            {scanError}
            {analysis
              ? translate(
                  'auto.components.status.bar.WorkspaceSpaceManagerPanel.20a4204dce',
                  'Last successful results remain visible.'
                )
              : ''}
          </span>
        </div>
      ) : null}
      {repoErrors.length > 0 ? (
        <div className="border-border/70 bg-muted/20 text-muted-foreground space-y-1.5 border px-3 py-2 text-xs">
          {repoErrors.map((repo) => (
            <div key={repo.repoId} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 break-words">
                {repo.displayName}: {repo.error}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {hasRows || isInitialScan ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
          <WorkspaceTreemap
            rows={rows}
            isScanning={isInitialScan}
            selectedWorktreeId={inspectedWorktree?.worktreeId ?? null}
            zoomedWorktree={zoomedWorktree}
            onSelect={onInspect}
            onZoomChange={onTreemapZoom}
          />
          <BreakdownList worktree={inspectedWorktree} isScanning={isInitialScan} />
        </div>
      ) : null}
      {hasRows ? (
        <SelectionToolbar
          selectedCount={selectedCount}
          reclaimableBytes={selectedReclaimableBytes}
          onClear={onClearSelection}
          onDelete={onDeleteSelected}
        />
      ) : null}
      {hasRows ? (
        <FilterToolbar
          query={query}
          sortKey={sortKey}
          onlyDeletable={onlyDeletable}
          visibleDeletableCount={visibleDeletableCount}
          allVisibleSelected={allVisibleSelected}
          onQueryChange={onQueryChange}
          onSortKeyChange={onSortKeyChange}
          onToggleOnlyDeletable={onToggleOnlyDeletable}
          onToggleVisibleSelection={onToggleVisibleSelection}
        />
      ) : null}
    </>
  )
}

function getScanSummary(analysis: WorkspaceSpaceAnalysis | null, isScanning: boolean): string {
  if (analysis) {
    return isScanning
      ? translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.34174bd83d',
          '{{value0}}. You can leave this page; the last result stays visible.',
          { value0: getWorkspaceSpaceScanningLabel() }
        )
      : translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.d595295d7d',
          '{{value0}} can be reclaimed from linked worktrees.',
          { value0: formatBytes(analysis.reclaimableBytes) }
        )
  }
  return isScanning
    ? translate(
        'auto.components.status.bar.WorkspaceSpaceManagerPanel.265d956765',
        '{{value0}}. You can leave this page.',
        { value0: getWorkspaceSpaceScanningLabel() }
      )
    : translate(
        'auto.components.status.bar.WorkspaceSpaceManagerPanel.e91dd2a9ae',
        'Run a scan to inspect workspace sizes.'
      )
}

function getScanActionLabel(hasAnalysis: boolean, isScanning: boolean): string {
  if (isScanning) {
    return translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.8dc9ddac8a', 'Cancel')
  }
  return hasAnalysis
    ? translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.508673bac0', 'Refresh')
    : translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.8c7c57fbf8', 'Scan')
}

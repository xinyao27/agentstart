import type { WorkspaceSpaceWorktreeValue as WorkspaceSpaceWorktree } from '@yiru/protocol'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'

import type {
  WorkspaceDecisionDetails,
  WorkspaceGitRefreshState,
  WorkspaceSpaceDeleteState
} from './workspace-space-decision'
import { CheckButton, SortIndicator } from './workspace-space-metrics'
import type {
  WorkspaceSpaceSortDirection,
  WorkspaceSpaceSortKey
} from './workspace-space-presentation'
import { WorkspaceRow } from './workspace-space-row'

type WorkspaceSpaceTableProps = {
  rows: WorkspaceSpaceWorktree[]
  maxSize: number
  isInitialScan: boolean
  hasSourceRows: boolean
  hasAnalysis: boolean
  scanError: string | null
  visibleSelectionState: boolean | 'mixed'
  visibleDeletableCount: number
  allVisibleSelected: boolean
  sortKey: WorkspaceSpaceSortKey
  sortDirection: WorkspaceSpaceSortDirection
  selectedIds: ReadonlySet<string>
  inspectedWorktreeId: string | null
  decisionDetailsByWorktreeId: ReadonlyMap<string, WorkspaceDecisionDetails>
  gitRefreshStateByWorktreeId: Record<string, WorkspaceGitRefreshState>
  deleteStateByWorktreeId: Record<string, WorkspaceSpaceDeleteState>
  onToggleVisibleSelection: () => void
  onToggleSort: (key: WorkspaceSpaceSortKey) => void
  onToggleSelected: (worktreeId: string) => void
  onInspect: (worktreeId: string) => void
  onOpenWorkspace: (worktreeId: string) => void
  onDelete: (worktreeId: string) => void
  onForceDelete: (worktree: WorkspaceSpaceWorktree) => void
}

export function WorkspaceSpaceTable({
  rows,
  maxSize,
  isInitialScan,
  hasSourceRows,
  hasAnalysis,
  scanError,
  visibleSelectionState,
  visibleDeletableCount,
  allVisibleSelected,
  sortKey,
  sortDirection,
  selectedIds,
  inspectedWorktreeId,
  decisionDetailsByWorktreeId,
  gitRefreshStateByWorktreeId,
  deleteStateByWorktreeId,
  onToggleVisibleSelection,
  onToggleSort,
  onToggleSelected,
  onInspect,
  onOpenWorkspace,
  onDelete,
  onForceDelete
}: WorkspaceSpaceTableProps): React.JSX.Element {
  if (!hasSourceRows && !isInitialScan) {
    return <EmptyWorkspaceTable scanError={scanError} hasAnalysis={hasAnalysis} />
  }
  return (
    <div className="border-border/70 bg-background/30 overflow-x-auto border">
      <div className="min-w-[46rem]">
        <div className="border-border/60 text-muted-foreground grid grid-cols-[1.75rem_minmax(0,1.25fr)_minmax(9rem,0.55fr)_8rem_9.5rem] gap-3 border-b px-3 py-2 text-[11px] font-medium tracking-[0.14em] uppercase">
          <div className="flex items-center">
            <CheckButton
              checked={visibleSelectionState}
              disabled={visibleDeletableCount === 0}
              label={translate(
                allVisibleSelected
                  ? 'auto.components.status.bar.WorkspaceSpaceManagerPanel.697d60c456'
                  : 'auto.components.status.bar.WorkspaceSpaceManagerPanel.1d0f8300d1',
                allVisibleSelected
                  ? 'Clear visible selection'
                  : 'Select visible deletable workspaces'
              )}
              onClick={onToggleVisibleSelection}
            />
          </div>
          <SortHeader
            label={translate(
              'auto.components.status.bar.WorkspaceSpaceManagerPanel.e4aebea158',
              'Workspace'
            )}
            sortKey="name"
            activeKey={sortKey}
            direction={sortDirection}
            onToggle={onToggleSort}
          />
          <SortHeader
            label={translate(
              'auto.components.status.bar.WorkspaceSpaceManagerPanel.81f14d9924',
              'Repository'
            )}
            sortKey="repo"
            activeKey={sortKey}
            direction={sortDirection}
            onToggle={onToggleSort}
          />
          <SortHeader
            label={translate(
              'auto.components.status.bar.WorkspaceSpaceManagerPanel.33aef3e9cc',
              'Size'
            )}
            sortKey="size"
            activeKey={sortKey}
            direction={sortDirection}
            onToggle={onToggleSort}
            align="right"
          />
          <div className="text-right">
            {translate('auto.components.status.bar.WorkspaceSpaceManagerPanel.be37293b10', 'State')}
          </div>
        </div>
        <div className="scrollbar-sleek max-h-[28rem] overflow-y-auto">
          {isInitialScan ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 px-4 py-10 text-center text-sm">
              <LoadingIndicator className="size-4" />
              {translate(
                'auto.components.status.bar.WorkspaceSpaceManagerPanel.a02d84d2d2',
                'Scanning workspaces. You can leave this page.'
              )}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-muted-foreground px-4 py-10 text-center text-sm">
              {translate(
                'auto.components.status.bar.WorkspaceSpaceManagerPanel.e031e93219',
                'No matching workspaces.'
              )}
            </div>
          ) : (
            rows.map((worktree) => {
              const details = decisionDetailsByWorktreeId.get(worktree.worktreeId)
              if (!details) {
                return null
              }
              return (
                <WorkspaceRow
                  key={worktree.worktreeId}
                  worktree={worktree}
                  maxSize={maxSize}
                  selected={selectedIds.has(worktree.worktreeId)}
                  inspected={inspectedWorktreeId === worktree.worktreeId}
                  decisionDetails={details}
                  gitRefreshState={gitRefreshStateByWorktreeId[worktree.worktreeId]}
                  deleteState={deleteStateByWorktreeId[worktree.worktreeId]}
                  onToggleSelected={() => onToggleSelected(worktree.worktreeId)}
                  onInspect={() => onInspect(worktree.worktreeId)}
                  onOpenWorkspace={() => onOpenWorkspace(worktree.worktreeId)}
                  onDelete={() => onDelete(worktree.worktreeId)}
                  onForceDelete={() => onForceDelete(worktree)}
                />
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onToggle,
  align = 'left'
}: {
  label: string
  sortKey: WorkspaceSpaceSortKey
  activeKey: WorkspaceSpaceSortKey
  direction: WorkspaceSpaceSortDirection
  onToggle: (key: WorkspaceSpaceSortKey) => void
  align?: 'left' | 'right'
}): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="xs"
      type="button"
      onClick={() => onToggle(sortKey)}
      className={`focus-visible:bg-accent flex h-auto border-0 p-0 font-normal ${
        align === 'right' ? 'justify-end text-right' : 'justify-start text-left whitespace-normal'
      }`}
    >
      {label}
      <SortIndicator sortKey={sortKey} activeKey={activeKey} direction={direction} />
    </Button>
  )
}

function EmptyWorkspaceTable({
  scanError,
  hasAnalysis
}: {
  scanError: string | null
  hasAnalysis: boolean
}): React.JSX.Element {
  const message = scanError
    ? translate(
        'auto.components.status.bar.WorkspaceSpaceManagerPanel.8194a4fb29',
        'Scan failed before any workspace sizes were collected.'
      )
    : hasAnalysis
      ? translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.61e25239da',
          'No workspace rows were available from the scan.'
        )
      : translate(
          'auto.components.status.bar.WorkspaceSpaceManagerPanel.e91dd2a9ae',
          'Run a scan to inspect workspace sizes.'
        )
  return (
    <div className="border-border/70 bg-background/30 text-muted-foreground border px-4 py-10 text-center text-sm">
      {message}
    </div>
  )
}

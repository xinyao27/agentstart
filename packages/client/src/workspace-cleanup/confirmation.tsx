import type { WorkspaceCleanupCandidate } from '@yiru/protocol'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Warning as AlertTriangle, Trash as Trash2, X } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~renderer/ui/dialog'
import { Progress } from '~renderer/ui/progress'
import { ScrollArea } from '~renderer/ui/scroll-area'

import type { WorkspaceCleanupRemovalProgress } from './background-removal'
import {
  getCandidateStatus,
  getContextPillLabel,
  getDirtyGitLabel,
  getReviewPillTone,
  shouldShowGitMetadataChip
} from './candidate-row-data'
import {
  EMPTY_REVIEW_INFO,
  formatRelativeTime,
  formatWorkspaceCleanupRemovalProgress
} from './dialog-model'
import type { WorkspaceCleanupReviewInfo } from './presentation'
import { StatusPill } from './status-pill'

type ConfirmRemoveProps = {
  candidates: WorkspaceCleanupCandidate[]
  reviewInfoByWorktreeId: ReadonlyMap<string, WorkspaceCleanupReviewInfo>
  progress: WorkspaceCleanupRemovalProgress | null
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmRemove({
  candidates,
  reviewInfoByWorktreeId,
  progress,
  onCancel,
  onConfirm
}: ConfirmRemoveProps): React.JSX.Element {
  const count = candidates.length
  const deleting = progress !== null
  const progressValue = progress
    ? Math.min(100, Math.max(0, (progress.processedCount / progress.totalCount) * 100))
    : 0
  return (
    <>
      <DialogHeader className="border-border border-b px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="border-destructive/25 bg-destructive/10 text-destructive mt-0.5 flex size-8 shrink-0 items-center justify-center border">
              {deleting ? (
                <LoadingIndicator className="size-4" />
              ) : (
                <AlertTriangle className="size-4" />
              )}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">
                {deleting
                  ? translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.deletingCount',
                      'Deleting workspaces: {{value0}}',
                      { value0: count }
                    )
                  : translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.deleteCount',
                      'Delete workspaces: {{value0}}?',
                      { value0: count }
                    )}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-xs leading-5">
                {deleting
                  ? translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.1d3503357d',
                      'You can close this and come back while deletion continues.'
                    )
                  : translate(
                      'auto.components.workspace.cleanup.WorkspaceCleanupDialog.38ca0b1400',
                      "This permanently deletes their local files. You can't undo this."
                    )}
              </DialogDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.191f0bc98e',
              'Close'
            )}
            onClick={onCancel}
          >
            <X className="size-4" />
          </Button>
        </div>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col">
        {progress ? (
          <div className="border-border bg-muted/25 border-b px-5 py-3">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <LoadingIndicator className="size-3.5 shrink-0" />
              <span className="text-foreground font-medium">
                {formatWorkspaceCleanupRemovalProgress(progress)}
              </span>
            </div>
            <Progress value={progressValue} className="mt-2 h-1.5" />
          </div>
        ) : null}
        <div className="border-border flex items-center justify-between border-b px-5 py-2.5">
          <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.05em] uppercase">
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.selectedForDeletionCount',
              'Selected for deletion: {{value0}}',
              { value0: count }
            )}
          </div>
          <div className="text-muted-foreground text-xs">
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.592fbab446',
              'Sorted by oldest activity'
            )}
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {candidates.map((candidate, index) => (
            <ConfirmRemoveRow
              key={candidate.worktreeId}
              candidate={candidate}
              reviewInfo={reviewInfoByWorktreeId.get(candidate.worktreeId) ?? EMPTY_REVIEW_INFO}
              last={index === candidates.length - 1}
            />
          ))}
        </ScrollArea>
      </div>
      <DialogFooter className="border-border border-t px-5 py-3">
        <Button variant="outline" onClick={onCancel}>
          {deleting
            ? translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.191f0bc98e',
                'Close'
              )
            : translate(
                'auto.components.workspace.cleanup.WorkspaceCleanupDialog.b6bae1eed1',
                'Cancel'
              )}
        </Button>
        {!deleting ? (
          <Button variant="destructive" onClick={onConfirm} disabled={count === 0}>
            <Trash2 className="size-4" />
            {translate(
              'auto.components.workspace.cleanup.WorkspaceCleanupDialog.deleteButtonCount',
              'Delete {{value0}}',
              { value0: count }
            )}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  )
}

function ConfirmRemoveRow({
  candidate,
  reviewInfo,
  last
}: {
  candidate: WorkspaceCleanupCandidate
  reviewInfo: WorkspaceCleanupReviewInfo
  last: boolean
}): React.JSX.Element {
  const dirtyLabel = getDirtyGitLabel(candidate)
  const branchDiffersFromName = candidate.branch !== candidate.displayName
  const contextPillLabel = getContextPillLabel(candidate)
  const showGitMetadataChip = shouldShowGitMetadataChip(candidate)
  const status = getCandidateStatus(candidate)
  return (
    <div className={cn('border-b border-border/60 px-5 py-2.5', last && 'border-b-0')}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="min-w-0 truncate text-sm font-medium">{candidate.displayName}</span>
        <span className="text-muted-foreground text-xs">
          {translate(
            'auto.components.workspace.cleanup.WorkspaceCleanupDialog.352f15d6fc',
            'Last active'
          )}{' '}
          {formatRelativeTime(candidate.lastActivityAt)}
        </span>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        {reviewInfo.label ? (
          <StatusPill tone={getReviewPillTone(reviewInfo)}>{reviewInfo.label}</StatusPill>
        ) : null}
        {contextPillLabel ? <StatusPill>{contextPillLabel}</StatusPill> : null}
        {dirtyLabel && showGitMetadataChip ? (
          <StatusPill tone="destructive">{dirtyLabel}</StatusPill>
        ) : null}
      </div>
      <div className="text-muted-foreground mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs">
        <span className="min-w-0 truncate">{candidate.repoName}</span>
        {branchDiffersFromName ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="min-w-0 truncate font-mono">{candidate.branch}</span>
          </>
        ) : null}
      </div>
      <div className="text-muted-foreground/80 mt-0.5 min-w-0 truncate font-mono text-[11px]">
        {candidate.path}
      </div>
    </div>
  )
}

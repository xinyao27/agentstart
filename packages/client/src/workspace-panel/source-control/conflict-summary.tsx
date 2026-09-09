import type { GitConflictOperation } from '@yiru/protocol/git/status-types'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  Sparkle as Sparkles,
  GitMerge,
  GitPullRequest as GitPullRequestArrow,
  Warning as TriangleAlert
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

export function ConflictSummaryCard({
  conflictOperation,
  unresolvedCount,
  sourceControlAiActionsVisible,
  isResolvingWithAI,
  isAbortingOperation = false,
  onAbortOperation,
  onResolveWithAI,
  onReview
}: {
  conflictOperation: GitConflictOperation
  unresolvedCount: number
  sourceControlAiActionsVisible: boolean
  isResolvingWithAI: boolean
  isAbortingOperation?: boolean
  onAbortOperation?: (operation: GitConflictOperation) => void
  onResolveWithAI: () => void
  onReview: () => void
}): React.JSX.Element {
  const operationLabel =
    conflictOperation === 'merge'
      ? 'Merge conflicts'
      : conflictOperation === 'rebase'
        ? 'Rebase conflicts'
        : conflictOperation === 'cherry-pick'
          ? 'Cherry-pick conflicts'
          : 'Conflicts'

  return (
    <div className="border border-amber-500/25 bg-amber-500/5 px-3 py-2">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="text-foreground text-xs font-medium" aria-live="polite">
            {translate(
              'auto.components.right.sidebar.SourceControl.d7a5942e41',
              '{{value0}}: {{value1}} unresolved',
              { value0: operationLabel, value1: unresolvedCount }
            )}
          </div>
          <div className="text-muted-foreground mt-1 text-[11px]">
            {translate(
              'auto.components.right.sidebar.SourceControl.3eeccbb221',
              'Resolved files move back to normal changes after they leave the live conflict state.'
            )}
          </div>
        </div>
      </div>
      <div className="mt-2">
        {sourceControlAiActionsVisible ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-7 w-full text-xs"
            disabled={isResolvingWithAI}
            onClick={onResolveWithAI}
          >
            {isResolvingWithAI ? (
              <LoadingIndicator className="size-3.5" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {translate('auto.components.right.sidebar.SourceControl.f6cb48b6fe', 'Resolve with AI')}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(sourceControlAiActionsVisible && 'mt-1.5', 'h-7 w-full text-xs')}
          onClick={onReview}
        >
          <GitMerge className="size-3.5" />
          {translate('auto.components.right.sidebar.SourceControl.27a50fe970', 'Review conflicts')}
        </Button>
        {(conflictOperation === 'merge' || conflictOperation === 'rebase') && onAbortOperation ? (
          <Button
            type="button"
            // Why: abort is the escape hatch for this state, so match the quiet
            // outline conflict-review action instead of reading as destructive.
            variant="outline"
            size="sm"
            className="mt-1.5 h-7 w-full text-xs"
            disabled={isResolvingWithAI || isAbortingOperation}
            onClick={() => onAbortOperation(conflictOperation)}
          >
            {isAbortingOperation ? <LoadingIndicator className="size-3.5" /> : null}
            {conflictOperation === 'rebase'
              ? translate('auto.components.right.sidebar.SourceControl.425f138269', 'Abort rebase')
              : translate('auto.components.right.sidebar.SourceControl.540ca8f78c', 'Abort merge')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function OperationBanner({
  conflictOperation,
  isAbortingOperation = false,
  onAbortOperation
}: {
  conflictOperation: GitConflictOperation
  isAbortingOperation?: boolean
  onAbortOperation?: (operation: GitConflictOperation) => void
}): React.JSX.Element {
  const label =
    conflictOperation === 'merge'
      ? 'Merge in progress'
      : conflictOperation === 'rebase'
        ? 'Rebase in progress'
        : conflictOperation === 'cherry-pick'
          ? 'Cherry-pick in progress'
          : 'Operation in progress'

  const Icon = conflictOperation === 'rebase' ? GitPullRequestArrow : GitMerge

  return (
    <div className="border border-amber-500/25 bg-amber-500/5 px-3 py-2">
      <div className="flex items-center justify-center gap-2">
        <Icon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-foreground text-xs font-medium">{label}</span>
      </div>
      {(conflictOperation === 'merge' || conflictOperation === 'rebase') && onAbortOperation ? (
        <Button
          type="button"
          // Why: abort is the escape hatch for this state, so match the quiet
          // outline conflict-review action instead of reading as destructive.
          variant="outline"
          size="sm"
          className="mt-2 h-7 w-full text-xs"
          disabled={isAbortingOperation}
          onClick={() => onAbortOperation(conflictOperation)}
        >
          {isAbortingOperation ? <LoadingIndicator className="size-3.5" /> : null}
          {conflictOperation === 'rebase'
            ? translate('auto.components.right.sidebar.SourceControl.425f138269', 'Abort rebase')
            : translate('auto.components.right.sidebar.SourceControl.540ca8f78c', 'Abort merge')}
        </Button>
      ) : null}
    </div>
  )
}

export function TooManyChangesBanner({ limit }: { limit: number }): React.JSX.Element {
  return (
    <div className="border border-amber-500/25 bg-amber-500/5 px-3 py-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="text-foreground text-xs">
          {translate(
            'auto.components.right.sidebar.SourceControl.tooManyChanges',
            'Too many changes detected. Only the first {{value0}} are shown.',
            { value0: limit.toLocaleString() }
          )}
        </span>
      </div>
    </div>
  )
}

import type { PRInfo } from '@agentstart/protocol/hosted-review/pull-request-types'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import React from 'react'
import { presentGitHubPRMergeState } from '~renderer/github/pr-merge-state'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import {
  GitMerge,
  GitPullRequest as GitPullRequestClosed,
  CaretDown as ChevronDown
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '~renderer/ui/dropdown-menu'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '~renderer/ui/tooltip'

import { runWorktreeDelete } from '../sidebar/delete-worktree/flow'
import { resolveGitHubPRMergeMethods } from '../source-control/merge-methods'
import {
  ClosedReviewActions,
  HostedReviewActionError,
  MergedReviewActions
} from './hosted-review-state-actions'
import {
  RIGHT_SIDEBAR_MERGE_PRIMARY_BUTTON_CLASS,
  RIGHT_SIDEBAR_PRIMARY_BUTTON_LABEL_CLASS,
  RIGHT_SIDEBAR_SPLIT_ACTION_ROW_CLASS
} from './right-sidebar-primary-action-layout'
import { useHostedReviewActions, type HostedReviewActionInfo } from './use-hosted-review-actions'

export default function HostedReviewActions({
  review,
  githubPR,
  repo,
  worktree,
  onRefreshReview
}: {
  review: HostedReviewActionInfo
  githubPR?: PRInfo | null
  repo: Repo
  worktree: Worktree
  onRefreshReview: () => Promise<void>
}): React.JSX.Element | null {
  useUiLocale()
  const isDeletingWorktree = useAppStore(
    (s) => s.deleteStateByWorktreeId[worktree.id]?.isDeleting ?? false
  )
  const shortLabel = 'PR'
  const reviewLabel = 'pull request'
  const mergePresentation = presentGitHubPRMergeState({
    ...githubPR,
    state: review.state,
    mergeable: review.mergeable,
    mergeStateStatus: review.mergeStateStatus,
    reviewDecision: review.reviewDecision,
    checksStatus: review.status,
    autoMergeEnabled: review.autoMergeEnabled,
    autoMergeAllowed: review.autoMergeAllowed,
    mergeQueueRequired: review.mergeQueueRequired
  })
  const mergeMethods = resolveGitHubPRMergeMethods(githubPR?.mergeMethodSettings ?? null)
  const {
    merging,
    stateUpdating,
    actionError,
    handleMerge,
    handleAutoMerge,
    handleCloseReview,
    handleReopenReview
  } = useHostedReviewActions({
    review,
    githubPR,
    repo,
    defaultMergeMethod: mergeMethods.defaultMethod,
    autoMergeAction: mergePresentation.autoMergeAction,
    onRefreshReview
  })
  const isUpdatingReviewState = stateUpdating !== null
  const primaryMergeDisabled =
    merging ||
    isUpdatingReviewState ||
    (!mergePresentation.directMergeAvailable && !mergePresentation.autoMergeAction)
  const directMergeDisabled =
    merging || isUpdatingReviewState || !mergePresentation.directMergeAvailable
  const menuDisabled = merging || isUpdatingReviewState

  const handleDeleteWorktree = () => {
    // Why: route every UI delete entry point through the shared funnel so
    // skip-confirm, main-worktree, and child-workspace safeguards cannot drift.
    runWorktreeDelete(worktree.id)
  }

  if (review.state === 'open') {
    return (
      <div className="space-y-1.5">
        <TooltipProvider>
          <div className={RIGHT_SIDEBAR_SPLIT_ACTION_ROW_CLASS}>
            <Tooltip>
              {/* Why: wrapping in a <span> so the tooltip trigger receives pointer
                  events even when the merge button inside is disabled. */}
              <TooltipTrigger
                render={
                  <span
                    className={cn(
                      'inline-flex min-w-0 max-w-full shrink',
                      primaryMergeDisabled && 'cursor-not-allowed'
                    )}
                  >
                    <Button
                      type="button"
                      size="xs"
                      className={cn(
                        'px-3 text-[11px] rounded-r-none',
                        RIGHT_SIDEBAR_MERGE_PRIMARY_BUTTON_CLASS,
                        'bg-green-600 text-white hover:bg-green-700',
                        'disabled:opacity-50 disabled:cursor-not-allowed'
                      )}
                      onClick={() =>
                        mergePresentation.autoMergeAction && !mergePresentation.directMergeAvailable
                          ? void handleAutoMerge()
                          : void handleMerge(mergeMethods.defaultMethod)
                      }
                      disabled={primaryMergeDisabled}
                    >
                      {merging ? (
                        <LoadingIndicator className="size-3.5" />
                      ) : (
                        <GitMerge className="size-3.5" />
                      )}
                      <span className={RIGHT_SIDEBAR_PRIMARY_BUTTON_LABEL_CLASS}>
                        {merging
                          ? translate(
                              'auto.components.right.sidebar.HostedReviewActions.d2ca293f3d',
                              'Working...'
                            )
                          : mergePresentation.directMergeAvailable
                            ? mergeMethods.defaultLabel
                            : (mergePresentation.autoMergeAction?.label ?? mergePresentation.label)}
                      </span>
                    </Button>
                  </span>
                }
              />
              {primaryMergeDisabled && (
                <TooltipContent side="bottom" sideOffset={4}>
                  {mergePresentation.tooltip}
                </TooltipContent>
              )}
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="xs"
                    className={cn(
                      'rounded-l-none border-l border-green-700/50 px-1.5 shrink-0',
                      'bg-green-600 text-white hover:bg-green-700',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                    disabled={menuDisabled}
                    aria-label={translate(
                      'auto.components.right.sidebar.HostedReviewActions.2bfaf4379c',
                      'More {{value0}} actions',
                      { value0: reviewLabel }
                    )}
                    title={translate(
                      'auto.components.right.sidebar.HostedReviewActions.9845a71e17',
                      'More actions'
                    )}
                  >
                    {stateUpdating === 'closed' ? (
                      <LoadingIndicator className="size-3.5" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-52">
                {mergePresentation.autoMergeAction && (
                  <>
                    <DropdownMenuItem
                      disabled={menuDisabled}
                      onClick={() => void handleAutoMerge()}
                    >
                      <GitMerge className="size-3.5" />
                      {mergePresentation.autoMergeAction.label}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {mergeMethods.methods.map(({ method, label }) => (
                  <DropdownMenuItem
                    key={method}
                    disabled={directMergeDisabled}
                    onClick={() => void handleMerge(method)}
                  >
                    <GitMerge className="size-3.5" />
                    {label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={menuDisabled}
                  onClick={() => void handleCloseReview()}
                >
                  <GitPullRequestClosed className="size-3.5" />
                  {translate(
                    'auto.components.right.sidebar.HostedReviewActions.4d5fb5a284',
                    'Close'
                  )}{' '}
                  {shortLabel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TooltipProvider>
        <HostedReviewActionError message={actionError} />
      </div>
    )
  }

  if (review.state === 'closed') {
    return (
      <ClosedReviewActions
        shortLabel={shortLabel}
        stateUpdating={stateUpdating}
        actionError={actionError}
        onReopenReview={() => void handleReopenReview()}
      />
    )
  }
  if (review.state === 'merged') {
    return (
      <MergedReviewActions
        isDeletingWorktree={isDeletingWorktree}
        onDeleteWorktree={handleDeleteWorktree}
      />
    )
  }

  return null
}

import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { GitMerge } from '~renderer/icons/hugeicons'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'
import { getWorktreeStatusLabel, type WorktreeStatus } from '~renderer/worktree/status'

import { StatusIndicator } from '../status-indicator'
import { useWorktreeActivityStatus } from '../use-worktree-activity-status'
import { getReviewLabel, ReviewIcon } from '../worktree-review-presentation'
import type { WorktreeCardPrDisplay } from './pr-display'

type WorktreeCardStatusSlotProps = {
  worktreeId: string
  showStatus: boolean
  prDisplay?: WorktreeCardPrDisplay | null
  hasBranchIdentity?: boolean
  branchIdentityLabel?: string
  className?: string
}

const QUIET_REVIEW_REPLACEABLE_STATUSES = new Set<WorktreeStatus>([
  'active',
  'complete',
  'inactive'
])

// Why: a missing review display can also mean provider state is unavailable,
// so the passive label names the identity cue without claiming no review exists.
function getDefaultBranchIdentityLabel(): string {
  return translate('auto.components.sidebar.WorktreeCardStatusSlot.branchIdentity', 'Branch')
}

// Why: branch-style SVGs are optically left-heavy; this keeps them aligned with
// the centered activity dots in the shared status column.
const reviewAndBranchStatusIconClassName = 'size-[13px] translate-x-px'
const branchStatusIconClassName = cn(reviewAndBranchStatusIconClassName, 'text-muted-foreground/70')

function getReviewStatusTooltip(review: WorktreeCardPrDisplay): string {
  const label = getReviewLabel()
  if (review.state === 'merged') {
    return `${label}: Merged`
  }
  if (review.state === 'closed') {
    return `${label}: Closed`
  }
  if (review.state === 'draft') {
    return `${label}: Draft`
  }
  if (review.status === 'failure') {
    return `${label} checks: Failed`
  }
  if (review.status === 'pending') {
    return `${label} checks: Pending`
  }
  if (review.status === 'success') {
    return `${label} checks: Passing`
  }
  return `${label}: Open`
}

export function WorktreeCardStatusSlot(
  props: WorktreeCardStatusSlotProps
): React.JSX.Element | null {
  const {
    worktreeId,
    showStatus,
    prDisplay = null,
    hasBranchIdentity = false,
    branchIdentityLabel,
    className
  } = props
  const status = useWorktreeActivityStatus(worktreeId)
  const statusLabel = getWorktreeStatusLabel(status) || status
  const canShowReviewStatus =
    showStatus && prDisplay !== null && QUIET_REVIEW_REPLACEABLE_STATUSES.has(status)
  const canShowBranchStatus =
    showStatus &&
    hasBranchIdentity &&
    prDisplay === null &&
    QUIET_REVIEW_REPLACEABLE_STATUSES.has(status)
  const passiveStatusLabel =
    canShowReviewStatus && prDisplay
      ? getReviewStatusTooltip(prDisplay)
      : canShowBranchStatus
        ? (branchIdentityLabel ?? getDefaultBranchIdentityLabel())
        : statusLabel
  // Why: review or branch identity can own the visible glyph while activity
  // still changes underneath; keep that computed state observable on the slot.
  const activityStatusAttribute = { 'data-worktree-activity-status': status }
  const branchStatusIcon = <GitMerge className={branchStatusIconClassName} aria-hidden="true" />
  const passiveStatus =
    canShowReviewStatus && prDisplay ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn('inline-flex size-5 items-center justify-center p-0.5', className)}
              {...activityStatusAttribute}
            >
              <ReviewIcon review={prDisplay} className={reviewAndBranchStatusIconClassName} />
              <span className="sr-only">{passiveStatusLabel}</span>
            </span>
          }
        />
        <TooltipContent side="right" sideOffset={8}>
          <span>{passiveStatusLabel}</span>
        </TooltipContent>
      </Tooltip>
    ) : canShowBranchStatus ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn('inline-flex size-5 items-center justify-center p-0.5', className)}
              {...activityStatusAttribute}
            >
              {branchStatusIcon}
              <span className="sr-only">{passiveStatusLabel}</span>
            </span>
          }
        />
        <TooltipContent side="right" sideOffset={8}>
          <span>{passiveStatusLabel}</span>
        </TooltipContent>
      </Tooltip>
    ) : (
      <>
        <span className={cn('inline-flex size-5 items-center justify-center', className)}>
          <StatusIndicator status={status} aria-hidden="true" {...activityStatusAttribute} />
        </span>
        <span className="sr-only">{passiveStatusLabel}</span>
      </>
    )

  if (!showStatus) {
    return null
  }

  return passiveStatus
}

import { shouldForcePushWithLeaseForUpstream } from '~renderer/source-control/workflow/operation'

import { canSubmitCommit, resolveCommitDisabledReason } from './commit-eligibility'
import type { DropdownActionInputs } from './dropdown-items'

export function resolveDropdownActionContext(inputs: DropdownActionInputs) {
  const {
    stagedCount,
    hasPartiallyStagedChanges,
    hasMessage,
    hasUnresolvedConflicts,
    isCommitting,
    isRemoteOperationActive,
    upstreamStatus,
    prState,
    isPRStateLoading,
    hostedReviewCreation,
    conflictOperation = 'unknown',
    branchCommitsAhead,
    hasCurrentBranch = true,
    canPushLinkedReviewWithoutUpstream = false,
    rebaseBaseRef,
    isPullRequestOperationActive = false
  } = inputs
  const hasStaged = stagedCount > 0
  const hasDirtyLocalChanges = hasStaged || inputs.hasUnstagedChanges
  const upstreamLoading = upstreamStatus === undefined
  const hasUpstream = upstreamStatus?.hasUpstream ?? false
  const hasOpenHostedReview = prState === 'open' || prState === 'draft'
  const canPushUntrackedHostedReview =
    !hasUpstream &&
    hasOpenHostedReview &&
    hasCurrentBranch &&
    branchCommitsAhead !== 0 &&
    canPushLinkedReviewWithoutUpstream
  // Why: a linked review without a resolved head must never fall back to an unrelated upstream.
  const pushBlockedByOpenHostedReviewTarget =
    !hasUpstream && hasOpenHostedReview && !canPushLinkedReviewWithoutUpstream
  const publishBlockedByMergedPR = !hasUpstream && prState === 'merged'
  const publishBlockedByPRLoading = !hasUpstream && Boolean(isPRStateLoading)
  const publishBlockedByOpenHostedReview = !hasUpstream && hasOpenHostedReview
  const publishBlockedByDetachedHead = !hasUpstream && !hasCurrentBranch
  const ahead = upstreamStatus?.ahead ?? 0
  const behind = upstreamStatus?.behind ?? 0
  const shouldForcePushWithLease = shouldForcePushWithLeaseForUpstream(upstreamStatus)
  // Why: branch compare is the accurate count for unpublished and rewritten branches.
  const pushLabelCount =
    branchCommitsAhead !== undefined &&
    branchCommitsAhead > 0 &&
    (shouldForcePushWithLease || !hasUpstream)
      ? branchCommitsAhead
      : ahead
  const globalBusy = isCommitting || isRemoteOperationActive || isPullRequestOperationActive
  const commitDisabledReason = resolveCommitDisabledReason({
    stagedCount,
    hasPartiallyStagedChanges,
    hasMessage,
    hasUnresolvedConflicts
  })
  const canCommit =
    !globalBusy &&
    canSubmitCommit({
      stagedCount,
      hasPartiallyStagedChanges,
      hasMessage,
      hasUnresolvedConflicts,
      isCommitting,
      isRemoteOperationActive,
      isPullRequestOperationActive
    })

  return {
    ahead,
    behind,
    branchCommitsAhead,
    canCommit,
    canPushLinkedReviewWithoutUpstream,
    canPushUntrackedHostedReview,
    commitDisabledReason,
    conflictOperation,
    globalBusy,
    hasDirtyLocalChanges,
    hasOpenHostedReview,
    hasUpstream,
    hostedReviewCreation,
    isPullRequestOperationActive,
    publishBlockedByDetachedHead,
    publishBlockedByMergedPR,
    publishBlockedByOpenHostedReview,
    publishBlockedByPRLoading,
    pushBlockedByOpenHostedReviewTarget,
    pushLabelCount,
    rebaseBaseRef,
    shouldForcePushWithLease,
    upstreamLoading,
    upstreamStatus
  }
}

export type DropdownActionContext = ReturnType<typeof resolveDropdownActionContext>

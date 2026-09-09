import type { GitUpstreamStatus } from '@yiru/protocol/git/status-types'
import { supportsHostedReviewCreation } from '@yiru/protocol/hosted-review/creation-provider'
import type {
  CreateHostedReviewErrorCode,
  CreateHostedReviewResult,
  HostedReviewCreationBlockedReason,
  HostedReviewCreationEligibility
} from '@yiru/protocol/hosted-review/types'

import { isBehindOnlyUpstream, shouldForcePushWithLeaseForUpstream } from './operation'

export type CreateReviewIntentKind =
  | 'dirty'
  | 'message_required'
  | 'no_upstream'
  | 'needs_push'
  | 'needs_sync'
  | 'force_push'

export type CreateReviewIntentEligibility = {
  eligible: boolean
  kind: CreateReviewIntentKind | null
}

export type SourceControlReviewRemoteStep =
  | 'publish'
  | 'push'
  | 'force_push'
  | 'fast_forward'
  | 'blocked'
  | 'none'

export type SourceControlHostedReviewCreateOutcome =
  | { kind: 'created'; number: number; url: string }
  | { kind: 'existing'; number?: number; url: string; error: string }
  | { kind: 'failed'; code: CreateHostedReviewErrorCode; error: string }

export function resolveCreateReviewIntentEligibility({
  stagedCount,
  hasStageableChanges,
  hasMessage,
  hasUnresolvedConflicts,
  upstreamStatus,
  hostedReviewCreation,
  branchCommitsAhead,
  hasCurrentBranch = true
}: {
  stagedCount: number
  hasStageableChanges: boolean
  hasMessage: boolean
  hasUnresolvedConflicts: boolean
  upstreamStatus: GitUpstreamStatus | undefined
  hostedReviewCreation?: HostedReviewCreationEligibility | null
  branchCommitsAhead?: number
  hasCurrentBranch?: boolean
}): CreateReviewIntentEligibility {
  if (
    hasUnresolvedConflicts ||
    !hasCurrentBranch ||
    !hostedReviewCreation ||
    hostedReviewCreation.canCreate ||
    !supportsHostedReviewCreation(hostedReviewCreation.provider)
  ) {
    return { eligible: false, kind: null }
  }

  if (hostedReviewCreation.blockedReason === 'dirty') {
    if (stagedCount > 0 && !hasMessage) {
      return { eligible: true, kind: 'message_required' }
    }
    return { eligible: stagedCount > 0 || hasStageableChanges, kind: 'dirty' }
  }

  if (hostedReviewCreation.blockedReason === 'no_upstream') {
    const hasPublishableCommits = branchCommitsAhead === undefined ? false : branchCommitsAhead > 0
    return {
      eligible: hasPublishableCommits || stagedCount > 0 || hasStageableChanges,
      kind: 'no_upstream'
    }
  }

  if (hostedReviewCreation.blockedReason === 'needs_push') {
    return { eligible: true, kind: 'needs_push' }
  }

  if (
    hostedReviewCreation.blockedReason === 'needs_sync' &&
    shouldForcePushWithLeaseForUpstream(upstreamStatus)
  ) {
    return { eligible: true, kind: 'force_push' }
  }

  // Why: a behind-only branch can be prepared with `git pull --ff-only`.
  // Diverged branches remain ineligible because they need an explicit choice.
  if (hostedReviewCreation.blockedReason === 'needs_sync' && isBehindOnlyUpstream(upstreamStatus)) {
    return { eligible: true, kind: 'needs_sync' }
  }

  return { eligible: false, kind: null }
}

export function resolveSourceControlReviewRemoteStep({
  upstreamStatus,
  hostedReviewCreation,
  branchCommitsAhead,
  hasCurrentBranch = true,
  allowPublishWhenCommitCountUnknown = false
}: {
  upstreamStatus: GitUpstreamStatus | undefined
  hostedReviewCreation?: {
    canCreate?: boolean
    blockedReason?: HostedReviewCreationBlockedReason
  } | null
  branchCommitsAhead?: number
  hasCurrentBranch?: boolean
  allowPublishWhenCommitCountUnknown?: boolean
}): SourceControlReviewRemoteStep {
  if (!hasCurrentBranch || !hostedReviewCreation || hostedReviewCreation.canCreate === true) {
    return 'none'
  }
  if (hostedReviewCreation.blockedReason === 'no_upstream') {
    return branchCommitsAhead !== undefined
      ? branchCommitsAhead > 0
        ? 'publish'
        : 'blocked'
      : allowPublishWhenCommitCountUnknown
        ? 'publish'
        : 'blocked'
  }
  if (hostedReviewCreation.blockedReason === 'needs_push') {
    return 'push'
  }
  if (hostedReviewCreation.blockedReason === 'needs_sync') {
    if (shouldForcePushWithLeaseForUpstream(upstreamStatus)) {
      return 'force_push'
    }
    // Why: enforce the no-merge invariant at execution time, including when
    // upstream changes between status refresh and review preparation.
    return isBehindOnlyUpstream(upstreamStatus) ? 'fast_forward' : 'blocked'
  }
  return 'none'
}

export function interpretSourceControlHostedReviewCreateResult(
  result: CreateHostedReviewResult
): SourceControlHostedReviewCreateOutcome {
  if (result.ok) {
    return { kind: 'created', number: result.number, url: result.url }
  }
  if (result.existingReview?.url) {
    return {
      kind: 'existing',
      ...(result.existingReview.number ? { number: result.existingReview.number } : {}),
      url: result.existingReview.url,
      error: result.error
    }
  }
  return { kind: 'failed', code: result.code, error: result.error }
}

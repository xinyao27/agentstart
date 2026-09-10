import type { GitUpstreamStatus } from '@agentstart/protocol/git/status-types'

import type { SourceControlRemoteOpKind } from './types'

export type SourceControlRemoteOperationOutcome = 'succeeded' | 'failed' | 'rejected_push'

export type SourceControlOperationFollowUp = {
  statusRefresh: 'preserve_previous' | null
  refreshHostedReview: boolean
  recovery: 'fetch_then_refresh_upstream' | null
}

export type SourceControlSyncStep = 'pull' | 'push' | 'force_push' | 'complete'

const HOSTED_REVIEW_AFFECTING_OPERATIONS = new Set<SourceControlRemoteOpKind>([
  'push',
  'force_push',
  'pull',
  'fast_forward',
  'publish',
  'rebase'
])

const PUSH_CAPABLE_OPERATIONS = new Set<SourceControlRemoteOpKind>([
  'push',
  'force_push',
  'publish',
  'sync'
])

const NON_FAST_FORWARD_PATTERN =
  /non-fast-forward|fetch first|updates were rejected|stale info|remote contains work that you do not have|(?:Submodule '[^'\n]+'|A submodule) has remote changes/i

export function shouldForcePushWithLeaseForUpstream(
  status: GitUpstreamStatus | undefined
): boolean {
  return (
    status?.hasUpstream === true &&
    status.ahead > 0 &&
    status.behind > 0 &&
    status.behindCommitsArePatchEquivalent === true
  )
}

// Why: behind-only is the sole review-preparation case that can reconcile
// upstream without merging or rewriting local commits.
export function isBehindOnlyUpstream(status: GitUpstreamStatus | undefined): boolean {
  return status?.hasUpstream === true && status.ahead === 0 && status.behind > 0
}

export function resolveSourceControlSyncStart(status: GitUpstreamStatus): SourceControlSyncStep {
  return shouldForcePushWithLeaseForUpstream(status) ? 'force_push' : 'pull'
}

export function resolveSourceControlSyncAfterPull(
  status: GitUpstreamStatus
): SourceControlSyncStep {
  return status.ahead > 0 ? 'push' : 'complete'
}

function isSourceControlNonFastForwardError(error: unknown): boolean {
  return error instanceof Error && NON_FAST_FORWARD_PATTERN.test(error.message)
}

export function resolveSourceControlRemoteOperationFailureOutcome({
  operation,
  error,
  isPushStage = operation !== 'sync'
}: {
  operation: SourceControlRemoteOpKind
  error: unknown
  isPushStage?: boolean
}): SourceControlRemoteOperationOutcome {
  if (!PUSH_CAPABLE_OPERATIONS.has(operation) || !isPushStage) {
    return 'failed'
  }
  return isSourceControlNonFastForwardError(error) ? 'rejected_push' : 'failed'
}

export function resolveSourceControlOperationFollowUp({
  operation,
  outcome,
  syncPushed = false
}: {
  operation: SourceControlRemoteOpKind
  outcome: SourceControlRemoteOperationOutcome
  syncPushed?: boolean
}): SourceControlOperationFollowUp {
  if (outcome === 'rejected_push' && PUSH_CAPABLE_OPERATIONS.has(operation)) {
    return {
      statusRefresh: 'preserve_previous',
      refreshHostedReview: false,
      recovery: 'fetch_then_refresh_upstream'
    }
  }
  if (outcome !== 'succeeded') {
    return {
      statusRefresh: null,
      refreshHostedReview: false,
      recovery: null
    }
  }
  return {
    statusRefresh: 'preserve_previous',
    refreshHostedReview:
      HOSTED_REVIEW_AFFECTING_OPERATIONS.has(operation) || (operation === 'sync' && syncPushed),
    recovery: null
  }
}

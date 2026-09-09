import { supportsHostedReviewCreation } from '@yiru/protocol/hosted-review/creation-provider'

import { shouldForcePushWithLeaseForUpstream } from './operation'
import { resolveCreateReviewIntentEligibility } from './review'
import type {
  SourceControlCommitAreaPrimaryActionDecision,
  SourceControlPrimaryActionDecision,
  SourceControlPrimaryActionDecisionInputs
} from './types'

export function resolveSourceControlPrimaryActionDecision(
  inputs: SourceControlPrimaryActionDecisionInputs
): SourceControlPrimaryActionDecision {
  const {
    stagedCount,
    hasUnstagedChanges,
    hasStageableChanges,
    hasMessage,
    hasUnresolvedConflicts,
    isCommitting,
    isRemoteOperationActive,
    upstreamStatus,
    hostedReviewState,
    isHostedReviewStateLoading,
    hostedReviewCreation,
    branchCommitsAhead,
    hasCurrentBranch = true,
    canPushLinkedReviewWithoutUpstream = false,
    isReviewIntentInFlight = false,
    isHostedReviewCreationLoading = false
  } = inputs

  if (isReviewIntentInFlight) {
    return disabledDecision('create_review_intent', 'create_review', 'prepare_review')
  }
  if (isCommitting) {
    return disabledDecision('commit', 'commit', 'commit_in_progress')
  }
  if (isRemoteOperationActive) {
    return resolvePrimaryActionDuringRemoteOp(inputs)
  }
  if (hasUnresolvedConflicts) {
    return disabledDecision('commit', 'commit', 'resolve_conflicts_before_commit')
  }
  if (
    isHostedReviewCreationLoading &&
    hostedReviewCreation &&
    shouldOfferCreateReviewLoadingAction(hostedReviewCreation)
  ) {
    return disabledDecision('create_review', 'create_review', 'checking_review_creation')
  }

  const createReviewIntent = resolveCreateReviewIntentDecision(inputs)
  if (createReviewIntent) {
    return createReviewIntent
  }

  const hasStaged = stagedCount > 0
  const hasOpenHostedReview = hostedReviewState === 'open' || hostedReviewState === 'draft'
  if (hasStaged && hasMessage) {
    return enabledDecision('commit', 'commit', 'commit_staged_changes')
  }
  if (hasStaged) {
    return disabledDecision('commit', 'commit', 'enter_commit_message')
  }
  if (hasStageableChanges) {
    return enabledDecision('stage', 'stage', 'stage_all_changes')
  }
  if (!upstreamStatus) {
    return disabledDecision('commit', 'commit', 'stage_file_to_commit')
  }
  if (!upstreamStatus.hasUpstream) {
    const unpublishedAction = resolveUnpublishedPrimaryAction({
      hasCurrentBranch,
      isHostedReviewStateLoading,
      hostedReviewState
    })
    if (unpublishedAction.kind === 'publish') {
      const linkedReviewAction = resolveLinkedReviewPrimaryAction({
        hasOpenHostedReview,
        canPushLinkedReviewWithoutUpstream
      })
      if (linkedReviewAction) {
        return linkedReviewAction
      }
    }
    return unpublishedAction
  }
  if (upstreamStatus.ahead > 0 && upstreamStatus.behind > 0) {
    if (shouldForcePushWithLeaseForUpstream(upstreamStatus)) {
      return {
        kind: 'push',
        labelIntent: 'force_push',
        titleIntent: 'force_push_with_lease',
        disabled: false,
        count: branchCommitsAhead,
        upstreamName: upstreamStatus.upstreamName,
        requiresForceWithLease: true
      }
    }
    return {
      kind: 'sync',
      labelIntent: 'sync',
      titleIntent: 'sync_counts',
      disabled: false,
      ahead: upstreamStatus.ahead,
      behind: upstreamStatus.behind
    }
  }
  if (upstreamStatus.behind > 0) {
    return { ...enabledDecision('pull', 'pull', 'pull_count'), count: upstreamStatus.behind }
  }
  if (upstreamStatus.ahead > 0) {
    return { ...enabledDecision('push', 'push', 'push_count'), count: upstreamStatus.ahead }
  }
  if (hostedReviewCreation?.canCreate) {
    return enabledDecision('create_review', 'create_review', 'create_review')
  }
  return disabledDecision(
    'commit',
    'commit',
    hasUnstagedChanges ? 'stage_file_to_commit' : 'nothing_to_commit_up_to_date'
  )
}

export function resolveSourceControlCommitAreaPrimaryActionDecision(
  inputs: SourceControlPrimaryActionDecisionInputs
): SourceControlCommitAreaPrimaryActionDecision {
  // Why: review creation is additive chrome. Commit/mobile bottom areas keep
  // the local/remote action they would have without review eligibility.
  const decision = resolveSourceControlPrimaryActionDecision({
    ...inputs,
    hostedReviewCreation: null,
    isReviewIntentInFlight: false
  })
  if (
    decision.kind === 'create_review' ||
    decision.kind === 'create_review_intent' ||
    decision.labelIntent === 'create_review' ||
    decision.labelIntent === 'create_review_intent'
  ) {
    // Why: fail loudly if the shared ladder grows a review path that bypasses
    // the commit-area exclusions; a cast would silently leak it to mobile.
    throw new Error('Commit-area source-control decision cannot create a hosted review')
  }
  return { ...decision, kind: decision.kind, labelIntent: decision.labelIntent }
}

function resolvePrimaryActionDuringRemoteOp(
  inputs: SourceControlPrimaryActionDecisionInputs
): SourceControlPrimaryActionDecision {
  const { inFlightRemoteOpKind, hasUnresolvedConflicts } = inputs
  const candidate = resolveSourceControlPrimaryActionDecision({
    ...inputs,
    isRemoteOperationActive: false
  })
  const inFlightIsPrimaryKind =
    inFlightRemoteOpKind === 'push' ||
    inFlightRemoteOpKind === 'pull' ||
    inFlightRemoteOpKind === 'sync' ||
    inFlightRemoteOpKind === 'publish'

  if (inFlightRemoteOpKind === 'force_push') {
    return {
      ...disabledDecision('push', 'force_push', 'force_push_in_progress'),
      requiresForceWithLease: true
    }
  }
  if (inFlightIsPrimaryKind && candidate.kind !== inFlightRemoteOpKind) {
    return disabledDecision(inFlightRemoteOpKind, inFlightRemoteOpKind, 'action_in_progress')
  }
  return {
    ...candidate,
    titleIntent: hasUnresolvedConflicts
      ? 'resolve_conflicts_before_commit'
      : candidate.kind === 'commit'
        ? 'remote_operation_blocks_commit'
        : 'remote_operation_in_progress',
    disabled: true
  }
}

function resolveUnpublishedPrimaryAction({
  hasCurrentBranch,
  isHostedReviewStateLoading,
  hostedReviewState
}: Pick<
  SourceControlPrimaryActionDecisionInputs,
  'hasCurrentBranch' | 'isHostedReviewStateLoading' | 'hostedReviewState'
>): SourceControlPrimaryActionDecision {
  if (!hasCurrentBranch) {
    return disabledDecision('commit', 'commit', 'checkout_branch_before_publish')
  }
  if (isHostedReviewStateLoading) {
    return disabledDecision('commit', 'commit', 'checking_review_status')
  }
  if (hostedReviewState === 'merged') {
    return disabledDecision('commit', 'commit', 'review_already_merged')
  }
  return enabledDecision('publish', 'publish', 'publish_branch')
}

function resolveCreateReviewIntentDecision(
  inputs: SourceControlPrimaryActionDecisionInputs
): SourceControlPrimaryActionDecision | null {
  const eligibility = resolveCreateReviewIntentEligibility({
    stagedCount: inputs.stagedCount,
    hasStageableChanges: inputs.hasStageableChanges,
    hasMessage: inputs.hasMessage,
    hasUnresolvedConflicts: inputs.hasUnresolvedConflicts,
    upstreamStatus: inputs.upstreamStatus,
    hostedReviewCreation: inputs.hostedReviewCreation,
    branchCommitsAhead: inputs.branchCommitsAhead,
    hasCurrentBranch: inputs.hasCurrentBranch
  })
  return eligibility.eligible
    ? enabledDecision('create_review_intent', 'create_review', 'prepare_review')
    : null
}

function shouldOfferCreateReviewLoadingAction(
  hostedReviewCreation: NonNullable<
    SourceControlPrimaryActionDecisionInputs['hostedReviewCreation']
  >
): boolean {
  return (
    supportsHostedReviewCreation(hostedReviewCreation.provider) &&
    hostedReviewCreation.blockedReason !== 'existing_review' &&
    hostedReviewCreation.blockedReason !== 'unsupported_provider'
  )
}

function resolveLinkedReviewPrimaryAction({
  hasOpenHostedReview,
  canPushLinkedReviewWithoutUpstream
}: {
  hasOpenHostedReview: boolean
  canPushLinkedReviewWithoutUpstream: boolean
}): SourceControlPrimaryActionDecision | null {
  if (!hasOpenHostedReview) {
    return null
  }
  return canPushLinkedReviewWithoutUpstream
    ? enabledDecision('push', 'push', 'push_linked_review')
    : disabledDecision('commit', 'commit', 'linked_review_target_unavailable')
}

function enabledDecision(
  kind: SourceControlPrimaryActionDecision['kind'],
  labelIntent: SourceControlPrimaryActionDecision['labelIntent'],
  titleIntent: SourceControlPrimaryActionDecision['titleIntent']
): SourceControlPrimaryActionDecision {
  return { kind, labelIntent, titleIntent, disabled: false }
}

function disabledDecision(
  kind: SourceControlPrimaryActionDecision['kind'],
  labelIntent: SourceControlPrimaryActionDecision['labelIntent'],
  titleIntent: SourceControlPrimaryActionDecision['titleIntent']
): SourceControlPrimaryActionDecision {
  return { kind, labelIntent, titleIntent, disabled: true }
}

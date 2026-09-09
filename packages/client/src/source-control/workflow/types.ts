import type { GitUpstreamStatus } from '@yiru/protocol/git/status-types'
import type {
  HostedReviewCreationEligibility,
  HostedReviewState
} from '@yiru/protocol/hosted-review/types'

export type SourceControlPrimaryActionKind =
  | 'commit'
  | 'stage'
  | 'push'
  | 'pull'
  | 'sync'
  | 'publish'
  | 'create_review_intent'
  | 'create_review'

export type SourceControlRemoteOpKind =
  | 'push'
  | 'force_push'
  | 'pull'
  | 'sync'
  | 'fetch'
  | 'fast_forward'
  | 'publish'
  | 'rebase'

export type SourceControlPrimaryActionTitleIntent =
  | 'commit_in_progress'
  | 'force_push_in_progress'
  | 'action_in_progress'
  | 'remote_operation_in_progress'
  | 'remote_operation_blocks_commit'
  | 'resolve_conflicts_before_commit'
  | 'prepare_review'
  | 'commit_staged_changes'
  | 'enter_commit_message'
  | 'stage_all_changes'
  | 'stage_file_to_commit'
  | 'checkout_branch_before_publish'
  | 'checking_review_status'
  | 'review_already_merged'
  | 'publish_branch'
  | 'push_linked_review'
  | 'linked_review_target_unavailable'
  | 'force_push_with_lease'
  | 'sync_counts'
  | 'pull_count'
  | 'push_count'
  | 'create_review'
  | 'nothing_to_commit_up_to_date'
  | 'checking_review_creation'

export type SourceControlPrimaryActionDecision = {
  kind: SourceControlPrimaryActionKind
  disabled: boolean
  labelIntent: SourceControlPrimaryActionKind | 'force_push'
  titleIntent: SourceControlPrimaryActionTitleIntent
  count?: number
  ahead?: number
  behind?: number
  upstreamName?: string
  requiresForceWithLease?: boolean
}

export type SourceControlCommitAreaPrimaryActionKind = Exclude<
  SourceControlPrimaryActionKind,
  'create_review_intent' | 'create_review'
>

export type SourceControlCommitAreaPrimaryActionDecision = Omit<
  SourceControlPrimaryActionDecision,
  'kind' | 'labelIntent'
> & {
  kind: SourceControlCommitAreaPrimaryActionKind
  labelIntent: SourceControlCommitAreaPrimaryActionKind | 'force_push'
}

export type SourceControlPrimaryActionDecisionInputs = {
  stagedCount: number
  hasUnstagedChanges: boolean
  hasStageableChanges: boolean
  hasMessage: boolean
  hasUnresolvedConflicts: boolean
  isCommitting: boolean
  isRemoteOperationActive: boolean
  upstreamStatus: GitUpstreamStatus | undefined
  hostedReviewState?: HostedReviewState | null
  isHostedReviewStateLoading?: boolean
  inFlightRemoteOpKind?: SourceControlRemoteOpKind | null
  hostedReviewCreation?: HostedReviewCreationEligibility | null
  branchCommitsAhead?: number
  hasCurrentBranch?: boolean
  canPushLinkedReviewWithoutUpstream?: boolean
  isReviewIntentInFlight?: boolean
  isHostedReviewCreationLoading?: boolean
}

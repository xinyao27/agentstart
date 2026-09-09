import {
  GitBlockedReason,
  GitWriteStatus,
  type GitWriteOutcome as ProtocolWriteOutcome
} from '../../generated/yiru/runtime/v1/git_common_pb.js'

export type GitWriteBlockedReason =
  | 'dirty_working_tree'
  | 'operation_in_progress'
  | 'detached_head'
  | 'unborn_head'
  | 'invalid_commit'
  | 'merge_commit_requires_mainline'
  | 'not_a_merge_commit'
  | 'merge_commit_not_droppable'
  | 'name_exists'
  | 'invalid_name'

export type GitWriteBlockedResult = {
  status: 'blocked'
  reason: GitWriteBlockedReason
  message: string
}
export type GitWriteErrorResult = { status: 'error'; message: string }
export type GitWriteConflictResult = { status: 'conflicts'; paths: string[] }

export type GitAddTagResult =
  | { status: 'ok'; tag: string }
  | GitWriteBlockedResult
  | GitWriteErrorResult
export type GitCreateBranchResult =
  | { status: 'ok'; branch: string; checkedOut: boolean }
  | GitWriteBlockedResult
  | GitWriteErrorResult
export type GitCheckoutCommitResult =
  | { status: 'ok'; commit: string }
  | GitWriteBlockedResult
  | GitWriteErrorResult
export type GitConflictableWriteResult =
  | { status: 'ok' }
  | GitWriteConflictResult
  | GitWriteBlockedResult
  | GitWriteErrorResult
export type GitCherryPickResult = GitConflictableWriteResult
export type GitRevertResult = GitConflictableWriteResult
export type GitDropCommitResult = GitConflictableWriteResult
export type GitMergeCommitResult = GitConflictableWriteResult
export type GitRebaseOntoCommitResult = GitConflictableWriteResult
export type GitResetToCommitResult = { status: 'ok' } | GitWriteBlockedResult | GitWriteErrorResult

function blockedReasonFromProto(value: GitBlockedReason): GitWriteBlockedReason {
  switch (value) {
    case GitBlockedReason.INVALID_NAME:
      return 'invalid_name'
    case GitBlockedReason.NAME_EXISTS:
      return 'name_exists'
    case GitBlockedReason.DIRTY_WORKING_TREE:
      return 'dirty_working_tree'
    case GitBlockedReason.OPERATION_IN_PROGRESS:
      return 'operation_in_progress'
    case GitBlockedReason.INVALID_COMMIT:
      return 'invalid_commit'
    case GitBlockedReason.MERGE_COMMIT_NOT_DROPPABLE:
      return 'merge_commit_not_droppable'
    case GitBlockedReason.UNBORN_HEAD:
      return 'unborn_head'
    case GitBlockedReason.DETACHED_HEAD:
      return 'detached_head'
    case GitBlockedReason.MERGE_COMMIT_REQUIRES_MAINLINE:
      return 'merge_commit_requires_mainline'
    default:
      return 'not_a_merge_commit'
  }
}

export function gitWriteOutcomeFromProto(
  outcome: ProtocolWriteOutcome
): { status: 'ok' } | GitWriteBlockedResult | GitWriteConflictResult | GitWriteErrorResult {
  switch (outcome.status) {
    case GitWriteStatus.OK:
      return { status: 'ok' }
    case GitWriteStatus.BLOCKED:
      return {
        status: 'blocked',
        reason: blockedReasonFromProto(outcome.blockedReason ?? GitBlockedReason.UNSPECIFIED),
        message: outcome.message ?? ''
      }
    case GitWriteStatus.CONFLICTS:
      return { status: 'conflicts', paths: outcome.conflictPaths }
    default:
      return { status: 'error', message: outcome.message ?? 'git operation failed' }
  }
}

export function mustOutcome<T>(outcome: T | undefined): T {
  if (!outcome) {
    throw new Error('git_write_outcome_missing')
  }
  return outcome
}

// Why: every new git write operation (tag, branch-create, checkout-commit,
// cherry-pick, revert, drop, merge, rebase-onto-commit, reset) reports the
// same three families of outcome — success, a refused precondition, a raw
// failure — plus conflicts for the operations that can stop mid-way. Sharing
// one result vocabulary here (main/git/*, relay/git/*, and the renderer
// client) keeps every caller's switch exhaustive over the same reasons
// instead of each op inventing its own ad hoc shape.

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

export type GitWriteErrorResult = {
  status: 'error'
  message: string
}

export type GitWriteConflictResult = {
  status: 'conflicts'
  paths: string[]
}

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

// Why: cherry-pick, revert, drop, merge, and rebase-onto-commit can all stop
// with unresolved conflicts mid-operation — same three-way outcome shape.
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

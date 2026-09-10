import type { DiffComment } from '@agentstart/protocol/git/diff-review'

import type { AppState } from '../store/types'
import { getIndexedWorktreeById } from '../worktree/repo-index'

const EMPTY_DIFF_COMMENTS = Object.freeze([]) as unknown as DiffComment[]

export function selectWorktreeDiffComments(
  state: Pick<AppState, 'worktreesByRepo'>,
  worktreeId: string | null | undefined
): DiffComment[] | undefined {
  if (!worktreeId) {
    return undefined
  }
  // Why: mounted Monaco and diff surfaces rerun this selector on every store
  // write, so share the immutable-snapshot index instead of rescanning all worktrees.
  return getIndexedWorktreeById(state.worktreesByRepo, worktreeId)?.diffComments
}

export function selectWorktreeDiffCommentsOrEmpty(
  state: Pick<AppState, 'worktreesByRepo'>,
  worktreeId: string | null | undefined
): DiffComment[] {
  return selectWorktreeDiffComments(state, worktreeId) ?? EMPTY_DIFF_COMMENTS
}

import type { DiffComment } from '@yiru/protocol/git/diff-review'
import {
  readProjectCatalogWorktree,
  updateProjectCatalogWorktree
} from '~renderer/project-catalog/worktree-cache'

export type DiffCommentMutation = {
  previous: DiffComment[] | undefined
  next: DiffComment[]
}

export function mutateDiffComments(
  worktreeId: string,
  mutate: (existing: DiffComment[]) => DiffComment[] | null
): DiffCommentMutation | null {
  const worktree = readProjectCatalogWorktree(worktreeId)
  if (!worktree) {
    return null
  }
  const previous = worktree.diffComments
  const next = mutate(previous ?? [])
  if (next === null) {
    return null
  }
  updateProjectCatalogWorktree(worktreeId, { diffComments: next })
  return { previous, next }
}

export function rollbackDiffComments(
  worktreeId: string,
  previous: DiffComment[] | undefined,
  expectedCurrent: DiffComment[]
): void {
  const worktree = readProjectCatalogWorktree(worktreeId)
  // Why: identity proves no later optimistic mutation has replaced this snapshot.
  if (!worktree || worktree.diffComments !== expectedCurrent) {
    return
  }
  updateProjectCatalogWorktree(worktreeId, { diffComments: previous })
}

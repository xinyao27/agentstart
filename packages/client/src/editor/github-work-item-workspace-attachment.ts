import type { Worktree } from '@yiru/protocol/worktree/model'

export function findGithubPrWorkspaceAttachment(
  worktrees: readonly Worktree[],
  repoId: string | null | undefined,
  prNumber: number
): Worktree | null {
  if (!repoId) {
    return null
  }
  return (
    worktrees.find(
      (worktree) =>
        worktree.repoId === repoId && !worktree.isArchived && worktree.linkedPR === prNumber
    ) ?? null
  )
}

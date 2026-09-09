import { getWorktreeExecutionHostId } from '@yiru/protocol/host/identity'
import type { Repo } from '@yiru/protocol/project/repository'
import type { WorktreeLineage } from '@yiru/protocol/worktree/lineage'
import type { Worktree } from '@yiru/protocol/worktree/model'

import { canAssignWorktreeParent } from './worktree-parent-eligibility'

type ParentCandidateArgs = {
  child: Worktree
  worktrees: readonly Worktree[]
  lineageById: Record<string, WorktreeLineage>
  worktreeMap: Map<string, Worktree>
  repoMap: Map<string, Pick<Repo, 'connectionId' | 'executionHostId'>>
}

function getWorktreeOwnerHostId(
  worktree: Worktree,
  repoMap: Map<string, Pick<Repo, 'connectionId' | 'executionHostId'>>
): string | null {
  const repo = repoMap.get(worktree.repoId)
  return repo ? getWorktreeExecutionHostId(worktree, repo) : (worktree.hostId ?? null)
}

export function getEligibleWorktreeParents({
  child,
  worktrees,
  lineageById,
  worktreeMap,
  repoMap
}: ParentCandidateArgs): Worktree[] {
  const childHostId = getWorktreeOwnerHostId(child, repoMap)
  return worktrees.filter(
    (candidate) =>
      candidate.repoId === child.repoId &&
      childHostId !== null &&
      getWorktreeOwnerHostId(candidate, repoMap) === childHostId &&
      !candidate.isArchived &&
      canAssignWorktreeParent({
        child,
        candidateParent: candidate,
        lineageById,
        worktreeMap
      })
  )
}

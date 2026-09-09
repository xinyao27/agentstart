import type { WorkspaceCleanupCandidate } from '@yiru/protocol'
import type { WorktreeDeleteState } from '~renderer/worktree/state/slice'

type DeletionFlagState = Pick<WorktreeDeleteState, 'isDeleting'>

export function filterWorkspaceCleanupRemovalCandidates(
  candidates: readonly WorkspaceCleanupCandidate[],
  deleteStateByWorktreeId: Record<string, DeletionFlagState | undefined>
): WorkspaceCleanupCandidate[] {
  return candidates.filter(
    (candidate) => deleteStateByWorktreeId[candidate.worktreeId]?.isDeleting !== true
  )
}

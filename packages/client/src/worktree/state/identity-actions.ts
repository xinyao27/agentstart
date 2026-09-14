import type { StateCreator } from 'zustand'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { readProjectCatalogWorktree } from '~renderer/project-catalog/worktree-cache'
import { migrateHugeRepoWarningDismissal } from '~renderer/workspace-panel/source-control/tree/huge-repo-warning-dismissals'

import type { AppState } from '../../store/types'
import { findKnownWorktreeById } from './known-model'
import { buildWorktreePurgeState } from './purge-state'
import { buildWorktreeRenameState } from './rename-state'
import { migrateHostedReviewLinkMutationGeneration } from './review-state'
import type { WorktreeSlice } from './types'

export function createWorktreeIdentityActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0]
): Pick<
  WorktreeSlice,
  'allWorktrees' | 'getKnownWorktreeById' | 'purgeWorktreeTerminalState' | 'migrateWorktreeIdentity'
> {
  return {
    allWorktrees: () => Object.values(readProjectCatalogRuntimeState().worktreesByRepo).flat(),
    getKnownWorktreeById: (worktreeId) =>
      readProjectCatalogWorktree(worktreeId) ??
      findKnownWorktreeById(readProjectCatalogRuntimeState(), worktreeId),
    purgeWorktreeTerminalState: (worktreeIds: string[]) => {
      if (worktreeIds.length === 0) {
        return
      }
      set((s) => buildWorktreePurgeState(s, worktreeIds))
    },
    migrateWorktreeIdentity: (oldWorktreeId: string, newWorktreeId: string) => {
      if (oldWorktreeId === newWorktreeId) {
        return
      }
      // Why: invalidate pre-rename toast actions before publishing the new path,
      // while carrying the dismissal forward for the same logical worktree.
      migrateHugeRepoWarningDismissal(oldWorktreeId, newWorktreeId)
      set((s) => buildWorktreeRenameState(s, oldWorktreeId, newWorktreeId))
      migrateHostedReviewLinkMutationGeneration(oldWorktreeId, newWorktreeId)
    }
  }
}

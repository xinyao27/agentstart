import type { RepoSparsePresetValue } from '../repo-types.js'
import type {
  WorktreeRemoveResult,
  WorktreeForceDeleteBranchResult
} from '../worktree-operation-types.js'
import type { WorktreeCreateResult, WorktreeValue } from '../worktree-types.js'
import type { Worktree } from './model.js'

export type WorktreeSetupLaunch = NonNullable<WorktreeCreateResult['setup']>
export type WorktreeDefaultTabsLaunch = NonNullable<WorktreeCreateResult['defaultTabs']>
export type WorktreeCreateTiming = NonNullable<WorktreeCreateResult['timing']>
export type WorktreeCreateTimingPhase = WorktreeCreateTiming['phases'][number]
export type SparsePreset = RepoSparsePresetValue
export type CreateWorktreeResult = Omit<WorktreeCreateResult, 'worktree'> & {
  worktree: Worktree &
    Partial<
      Pick<
        WorktreeValue,
        'parentWorktreeId' | 'childWorktreeIds' | 'lineage' | 'workspaceLineage' | 'git'
      >
    >
}
export type PreservedWorktreeBranch = NonNullable<WorktreeRemoveResult['preservedBranch']>
export type RemoveWorktreeResult = Omit<WorktreeRemoveResult, 'removed'>
export type ForceDeleteWorktreeBranchResult = WorktreeForceDeleteBranchResult
export type LocalBaseRefRefreshResult = NonNullable<WorktreeCreateResult['localBaseRefRefresh']>
export type LocalBaseRefUpdateSuggestion = NonNullable<
  WorktreeCreateResult['localBaseRefUpdateSuggestion']
>
export type WorktreeBaseStatusEvent = NonNullable<WorktreeCreateResult['initialBaseStatus']>
export type WorktreeBaseStatusKind = WorktreeBaseStatusEvent['status']

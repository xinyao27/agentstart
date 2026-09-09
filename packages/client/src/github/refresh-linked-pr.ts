import type { GitHubPRRefreshAlias, PRInfo } from '@yiru/protocol/hosted-review/pull-request-types'
import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'

import {
  shouldApplyBranchMismatchedLinkedPRClear,
  shouldApplyDivergedLinkedPRClear,
  shouldClearBranchMismatchedLinkedOpenPR,
  shouldClearDivergedLinkedMergedPR
} from './linked-pr-policy'
import type { GitHubSlice } from './store-contract'
import { findUniqueWorktreeById, type WorktreeLookupIndex } from './worktree-lookup'

export type RefreshLinkedPRClear = {
  kind: 'diverged' | 'branch-mismatch'
  worktreeId: string
  linkedPRNumber: number
  branch: string
  requestHeadOid: string | null
  executionHostId: string
}

export function getRefreshLinkedPRClear(
  state: AppState,
  alias: GitHubPRRefreshAlias,
  executionHostId: string,
  pr: PRInfo,
  lookupIndex: WorktreeLookupIndex | undefined
): RefreshLinkedPRClear | null {
  const linkedPRNumber = alias.linkedPRNumber ?? null
  if (!alias.worktreeId || linkedPRNumber == null) {
    return null
  }
  const worktree = findUniqueWorktreeById(state, alias.worktreeId, executionHostId, lookupIndex)
  if (!worktree) {
    return null
  }
  const requestHeadOid = alias.currentHeadOid ?? null
  const base = {
    worktreeId: alias.worktreeId,
    linkedPRNumber,
    branch: alias.branch,
    requestHeadOid,
    executionHostId
  }
  if (shouldClearDivergedLinkedMergedPR({ pr, linkedPRNumber, requestHeadOid })) {
    return { kind: 'diverged', ...base }
  }
  if (
    shouldClearBranchMismatchedLinkedOpenPR({
      pr,
      linkedPRNumber,
      branch: alias.branch,
      requestHeadOid,
      pushTargetBranch: worktree.pushTarget?.branchName ?? null
    })
  ) {
    return { kind: 'branch-mismatch', ...base }
  }
  return null
}

export function applyRefreshLinkedPRClears(
  get: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[1],
  clears: RefreshLinkedPRClear[]
): void {
  for (const clear of clears) {
    void get().updateWorktreeMeta(
      clear.worktreeId,
      { linkedPR: null },
      {
        shouldApply: () => {
          const worktree =
            findUniqueWorktreeById(get(), clear.worktreeId, clear.executionHostId) ?? undefined
          return clear.kind === 'diverged'
            ? shouldApplyDivergedLinkedPRClear({
                worktree,
                linkedPRNumber: clear.linkedPRNumber,
                branch: clear.branch,
                requestHeadOid: clear.requestHeadOid
              })
            : shouldApplyBranchMismatchedLinkedPRClear({
                worktree,
                linkedPRNumber: clear.linkedPRNumber,
                branch: clear.branch,
                requestHeadOid: clear.requestHeadOid
              })
        }
      }
    )
  }
}

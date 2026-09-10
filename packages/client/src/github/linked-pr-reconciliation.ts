import type { PRInfo } from '@agentstart/protocol/hosted-review/pull-request-types'
import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'

import {
  shouldApplyBranchMismatchedLinkedPRClear,
  shouldApplyDivergedLinkedPRClear,
  shouldClearBranchMismatchedLinkedOpenPR,
  shouldClearDivergedLinkedMergedPR
} from './linked-pr-policy'
import type { GitHubSlice } from './store-contract'
import { findUniqueWorktreeById } from './worktree-lookup'

type GitHubSliceGet = Parameters<StateCreator<AppState, [], [], GitHubSlice>>[1]

export function clearCachedDivergedLinkedPR(
  get: GitHubSliceGet,
  args: {
    pr: PRInfo
    worktreeId?: string
    executionHostId?: string
    linkedPRNumber: number | null
    branch: string
  }
): void {
  if (
    !args.worktreeId ||
    args.linkedPRNumber == null ||
    args.pr.headDivergedFromMergedPRAtOid == null
  ) {
    return
  }
  const linkedPRNumber = args.linkedPRNumber
  const currentHeadOid =
    findUniqueWorktreeById(get(), args.worktreeId, args.executionHostId)?.head ?? null
  if (
    !shouldClearDivergedLinkedMergedPR({
      pr: args.pr,
      linkedPRNumber,
      requestHeadOid: currentHeadOid
    })
  ) {
    return
  }
  void get().updateWorktreeMeta(
    args.worktreeId,
    { linkedPR: null },
    {
      shouldApply: (worktree) =>
        shouldApplyDivergedLinkedPRClear({
          worktree,
          linkedPRNumber,
          branch: args.branch,
          requestHeadOid: currentHeadOid
        })
    }
  )
}

export function reconcileLinkedPRResult(
  get: GitHubSliceGet,
  args: {
    pr: PRInfo | null
    repoPath: string
    repoId?: string
    repoExecutionHostId: string
    branch: string
    requestHeadOid: string | null
    worktreeId?: string
    linkedPRNumber: number | null
    executionHostId?: string
  }
): void {
  if (!args.worktreeId || args.linkedPRNumber == null) {
    return
  }
  const linkedPRNumber = args.linkedPRNumber
  const linkedPRWorktree = findUniqueWorktreeById(get(), args.worktreeId, args.repoExecutionHostId)
  if (!linkedPRWorktree) {
    return
  }
  if (
    shouldClearDivergedLinkedMergedPR({
      pr: args.pr,
      linkedPRNumber,
      requestHeadOid: args.requestHeadOid
    })
  ) {
    // Why: only clear the durable link that produced this exact probe;
    // branch/head drift means the stale result no longer owns the worktree.
    void get().updateWorktreeMeta(
      args.worktreeId,
      { linkedPR: null },
      {
        shouldApply: () =>
          shouldApplyDivergedLinkedPRClear({
            worktree:
              findUniqueWorktreeById(get(), args.worktreeId!, args.repoExecutionHostId) ??
              undefined,
            linkedPRNumber,
            branch: args.branch,
            requestHeadOid: args.requestHeadOid
          })
      }
    )
  }
  if (
    !shouldClearBranchMismatchedLinkedOpenPR({
      pr: args.pr,
      linkedPRNumber,
      branch: args.branch,
      requestHeadOid: args.requestHeadOid,
      pushTargetBranch: linkedPRWorktree.pushTarget?.branchName ?? null
    })
  ) {
    return
  }
  void get().updateWorktreeMeta(
    args.worktreeId,
    { linkedPR: null },
    {
      // Why: the branch-scoped PR refetch below updates both GitHub caches;
      // the generic metadata refresh would duplicate provider work.
      suppressHostedReviewRefresh: true,
      shouldApply: () =>
        shouldApplyBranchMismatchedLinkedPRClear({
          worktree:
            findUniqueWorktreeById(get(), args.worktreeId!, args.repoExecutionHostId) ?? undefined,
          linkedPRNumber,
          branch: args.branch,
          requestHeadOid: args.requestHeadOid
        })
    }
  )
  // Re-resolve by branch right away so visible Checks recover on this refresh.
  void get().fetchPRForBranch(args.repoPath, args.branch, {
    force: true,
    repoId: args.repoId,
    worktreeId: args.worktreeId,
    executionHostId: args.executionHostId
  })
}

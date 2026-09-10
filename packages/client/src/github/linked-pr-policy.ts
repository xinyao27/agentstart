import type { PRInfo } from '@agentstart/protocol/hosted-review/pull-request-types'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import type { AppState } from '~renderer/store/types'

import {
  findUniqueWorktreeById,
  findWorktreeById,
  type WorktreeLookupIndex
} from './worktree-lookup'

export function isStaleExactLinkedPRLookup(
  state: AppState,
  worktreeId: string | undefined,
  linkedPRNumber: number | null | undefined,
  executionHostId?: string,
  lookupIndex?: WorktreeLookupIndex
): boolean {
  if (!worktreeId || linkedPRNumber == null) {
    return false
  }
  const worktree = executionHostId
    ? findUniqueWorktreeById(state, worktreeId, executionHostId, lookupIndex)
    : lookupIndex
      ? (lookupIndex.byId.get(worktreeId)?.first ?? null)
      : findWorktreeById(state, worktreeId)
  return worktree?.linkedPR !== linkedPRNumber
}

export function shouldClearDivergedLinkedMergedPR(args: {
  pr: PRInfo | null
  linkedPRNumber: number | null
  requestHeadOid: string | null
}): boolean {
  const { pr, linkedPRNumber, requestHeadOid } = args
  return (
    linkedPRNumber != null &&
    requestHeadOid !== null &&
    pr?.number === linkedPRNumber &&
    pr.state === 'merged' &&
    pr.headDivergedFromMergedPRAtOid === requestHeadOid &&
    pr.headSha !== requestHeadOid &&
    pr.confirmedContainedHeadOid !== requestHeadOid
  )
}

type LinkedPRClearTarget = {
  worktree: Pick<Worktree, 'linkedPR' | 'branch' | 'head' | 'isBare' | 'isArchived'> | undefined
  linkedPRNumber: number
  branch: string
  requestHeadOid: string | null
}

export function shouldApplyDivergedLinkedPRClear(args: LinkedPRClearTarget): boolean {
  const { worktree, linkedPRNumber, branch, requestHeadOid } = args
  return (
    Boolean(worktree) &&
    requestHeadOid !== null &&
    worktree?.linkedPR === linkedPRNumber &&
    worktree.branch.replace(/^refs\/heads\//, '') === branch &&
    worktree.head === requestHeadOid &&
    worktree.isBare !== true &&
    worktree.isArchived !== true
  )
}

export function shouldClearBranchMismatchedLinkedOpenPR(args: {
  pr: PRInfo | null
  linkedPRNumber: number | null
  branch: string
  requestHeadOid: string | null
  pushTargetBranch: string | null
}): boolean {
  const { pr, linkedPRNumber, branch, requestHeadOid, pushTargetBranch } = args
  const headRefName = pr?.headRefName?.trim() ?? ''
  const currentBranch = branch.replace(/^refs\/heads\//, '').trim()
  return (
    linkedPRNumber != null &&
    pr?.number === linkedPRNumber &&
    (pr.state === 'open' || pr.state === 'draft') &&
    requestHeadOid !== null &&
    headRefName !== '' &&
    currentBranch !== '' &&
    headRefName !== currentBranch &&
    (pushTargetBranch === null || pushTargetBranch !== headRefName) &&
    !(pr.headSha != null && pr.headSha === requestHeadOid)
  )
}

export function shouldApplyBranchMismatchedLinkedPRClear(args: LinkedPRClearTarget): boolean {
  const { worktree, linkedPRNumber, branch, requestHeadOid } = args
  return (
    Boolean(worktree) &&
    requestHeadOid !== null &&
    worktree?.linkedPR === linkedPRNumber &&
    worktree.branch.replace(/^refs\/heads\//, '') === branch.replace(/^refs\/heads\//, '') &&
    worktree.head === requestHeadOid &&
    worktree.isBare !== true &&
    worktree.isArchived !== true
  )
}

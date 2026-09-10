import type { PRInfo } from '@agentstart/protocol/hosted-review/pull-request-types'
import type { AppState } from '~renderer/store/types'

import { withBoundedCacheEntry } from './cache-policy'
import type { GitHubPRFallbackSource } from './store-contract'
import { findUniqueWorktreeById, findWorktreeById } from './worktree-lookup'

export function shouldWritePRCacheForHostedReviewSync(args: {
  hostedReviewSyncAccepted: boolean
  hostedReviewEntry: AppState['hostedReviewCache'][string] | undefined
  pr: PRInfo | null
  linkedPRNumber?: number | null
  fallbackPRNumber?: number | null
}): boolean {
  // Why: PR-status grouping reads prCache while cards read hostedReviewCache.
  // If a GitHub PR result was rejected for the card, don't let grouping drift.
  if (args.hostedReviewSyncAccepted) {
    return true
  }
  const exactPRNumber = args.linkedPRNumber ?? args.fallbackPRNumber ?? null
  return (
    exactPRNumber !== null &&
    args.pr?.number === exactPRNumber &&
    args.hostedReviewEntry?.data?.provider === 'github' &&
    args.hostedReviewEntry.data.number === exactPRNumber
  )
}

export function shouldPreserveExistingPRForFallbackMiss(args: {
  currentPR: PRInfo | null | undefined
  nextPR: PRInfo | null
  state: AppState
  worktreeId?: string
  linkedPRNumber?: number | null
  fallbackPRNumber?: number | null
  fallbackPRSource?: GitHubPRFallbackSource | null
  executionHostId?: string
}): boolean {
  if (
    args.nextPR !== null ||
    args.linkedPRNumber != null ||
    args.currentPR?.state !== 'merged' ||
    typeof args.currentPR.headSha !== 'string' ||
    args.currentPR.headSha.length === 0
  ) {
    return false
  }
  // Why: the common found/non-merged paths do not depend on worktree state.
  // Gate the global lookup so batched refresh aliases do not multiply full scans.
  const worktree = args.worktreeId
    ? args.executionHostId
      ? findUniqueWorktreeById(args.state, args.worktreeId, args.executionHostId)
      : findWorktreeById(args.state, args.worktreeId)
    : null
  const worktreeHead = worktree?.head
  // Why: merged branch PRs are only safe to keep when cached PR metadata still
  // matches the commit this stored worktree is actually on — exactly, or via a
  // head confirmed to be part of the merged PR.
  return (
    typeof worktreeHead === 'string' &&
    worktreeHead.length > 0 &&
    (args.currentPR.headSha === worktreeHead ||
      args.currentPR.confirmedContainedHeadOid === worktreeHead)
  )
}

export function applyPRCacheResult(
  cache: AppState['prCache'],
  cacheKey: string,
  pr: PRInfo | null,
  fetchedAt: number,
  accepted: boolean,
  preserveExisting: boolean
): AppState['prCache'] {
  if (preserveExisting) {
    return cache
  }
  if (accepted) {
    return withBoundedCacheEntry(cache, cacheKey, { data: pr, fetchedAt })
  }
  if (!cache[cacheKey]) {
    return cache
  }
  const next = { ...cache }
  delete next[cacheKey]
  return next
}

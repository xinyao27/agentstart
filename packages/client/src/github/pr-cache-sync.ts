import type { PRInfo } from '@yiru/protocol/hosted-review/pull-request-types'
import { getHostedReviewCacheKey } from '~renderer/source-control/hosted-review-state/cache-identity'
import type { AppState } from '~renderer/store/types'

import { syncHostedReviewCacheFromGitHubPRResult } from './hosted-review-sync'
import {
  applyPRCacheResult,
  shouldPreserveExistingPRForFallbackMiss,
  shouldWritePRCacheForHostedReviewSync
} from './pr-cache-policy'
import type { GitHubPRFallbackSource } from './store-contract'

type GitHubPRCacheResult = {
  prCacheKey: string
  repoPath: string
  branch: string
  settings: AppState['settings']
  repoId?: string
  executionHostId?: string | null
  hasRepoOwner?: boolean
  pr: PRInfo | null
  fetchedAt: number
  worktreeId?: string
  linkedPRNumber?: number | null
  fallbackPRNumber?: number | null
  fallbackPRSource?: GitHubPRFallbackSource | null
  requestStartedAt?: number
  requestStartedEntry?: AppState['hostedReviewCache'][string]
}

function resolveGitHubPRCaches(
  state: AppState,
  prCache: AppState['prCache'],
  hostedReviewCache: AppState['hostedReviewCache'],
  args: GitHubPRCacheResult
): { prCache: AppState['prCache']; hostedReviewCache: AppState['hostedReviewCache'] } {
  const preserveExistingPRForFallbackMiss = shouldPreserveExistingPRForFallbackMiss({
    currentPR: prCache[args.prCacheKey]?.data,
    nextPR: args.pr,
    state,
    worktreeId: args.worktreeId,
    linkedPRNumber: args.linkedPRNumber,
    fallbackPRNumber: args.fallbackPRNumber,
    fallbackPRSource: args.fallbackPRSource
  })
  const hostedReviewSync = syncHostedReviewCacheFromGitHubPRResult({
    cache: hostedReviewCache,
    repoPath: args.repoPath,
    branch: args.branch,
    settings: args.settings,
    repoId: args.repoId,
    executionHostId: args.executionHostId,
    hasRepoOwner: args.hasRepoOwner,
    pr: args.pr,
    fetchedAt: args.fetchedAt,
    linkedPRNumber: args.linkedPRNumber,
    fallbackPRNumber: args.fallbackPRNumber,
    fallbackPRSource: args.fallbackPRSource,
    preserveExistingPRForFallbackMiss,
    requestStartedAt: args.requestStartedAt,
    requestStartedEntry: args.requestStartedEntry
  })
  const hostedReviewCacheKey = getHostedReviewCacheKey(
    args.repoPath,
    args.branch,
    args.settings,
    args.repoId,
    args.executionHostId,
    args.hasRepoOwner === true
  )
  return {
    prCache: applyPRCacheResult(
      prCache,
      args.prCacheKey,
      args.pr,
      args.fetchedAt,
      shouldWritePRCacheForHostedReviewSync({
        hostedReviewSyncAccepted: hostedReviewSync.accepted,
        hostedReviewEntry: hostedReviewCache[hostedReviewCacheKey],
        pr: args.pr,
        linkedPRNumber: args.linkedPRNumber,
        fallbackPRNumber: args.fallbackPRNumber
      }),
      preserveExistingPRForFallbackMiss
    ),
    hostedReviewCache: hostedReviewSync.cache
  }
}

export function setGitHubPRResultCaches(
  state: AppState,
  args: GitHubPRCacheResult
): Partial<AppState> {
  const next = resolveGitHubPRCaches(state, state.prCache, state.hostedReviewCache, args)
  return {
    ...(next.prCache === state.prCache ? {} : { prCache: next.prCache }),
    ...(next.hostedReviewCache === state.hostedReviewCache
      ? {}
      : { hostedReviewCache: next.hostedReviewCache })
  }
}

export function applyGitHubPRResultToCaches(
  args: GitHubPRCacheResult & {
    state: AppState
    prCache: AppState['prCache']
    hostedReviewCache: AppState['hostedReviewCache']
  }
): { prCache: AppState['prCache']; hostedReviewCache: AppState['hostedReviewCache'] } {
  return resolveGitHubPRCaches(args.state, args.prCache, args.hostedReviewCache, args)
}

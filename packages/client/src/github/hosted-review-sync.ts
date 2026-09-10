import { hostedReviewInfoFromGitHubPRInfo } from '@agentstart/protocol/hosted-review/github-mapping'
import type { PRInfo } from '@agentstart/protocol/hosted-review/pull-request-types'
import {
  getHostedReviewCacheKey,
  linkedReviewHintKey
} from '~renderer/source-control/hosted-review-state/cache-identity'
import type { AppState } from '~renderer/store/types'

import type { GitHubPRFallbackSource } from './store-contract'

function isGitHubLinkedReviewHintKey(hintKey: string | undefined): boolean {
  return hintKey?.split('|').some((key) => key.startsWith('github:')) ?? false
}

function shouldClearHostedReviewForNoGitHubPR(
  entry: AppState['hostedReviewCache'][string] | undefined
): boolean {
  // Why: a GitHub-only miss should not create or refresh provider-neutral
  // branch misses that suppress preserved non-GitHub review records.
  if (!entry) {
    return false
  }
  if (entry.data?.provider === 'github') {
    return true
  }
  return entry.data === null && isGitHubLinkedReviewHintKey(entry.linkedReviewHintKey)
}

function linkedReviewHintKeyForNoGitHubPR(
  entry: AppState['hostedReviewCache'][string] | undefined
): string | undefined {
  if (entry?.data?.provider === 'github') {
    return isGitHubLinkedReviewHintKey(entry.linkedReviewHintKey)
      ? entry.linkedReviewHintKey
      : linkedReviewHintKey({ linkedGitHubPR: entry.data.number })
  }
  return entry?.linkedReviewHintKey
}

function hasNewerHostedReviewCacheEntry(
  cache: AppState['hostedReviewCache'],
  cacheKey: string,
  requestStartedAt: number,
  requestStartedEntry: AppState['hostedReviewCache'][string] | undefined
): boolean {
  const entry = cache[cacheKey]
  return (
    entry !== undefined &&
    (entry.fetchedAt > requestStartedAt ||
      (entry.fetchedAt === requestStartedAt && entry !== requestStartedEntry))
  )
}

function canPreserveReviewForFallbackMiss(state: PRInfo['state'] | undefined): boolean {
  return state === 'closed' || state === 'merged'
}

export function prLookupHintKey(
  linkedPRNumber: number | null,
  fallbackPRNumber: number | null
): string {
  if (linkedPRNumber !== null) {
    return `linked:${linkedPRNumber}`
  }
  return fallbackPRNumber !== null ? `fallback:${fallbackPRNumber}` : ''
}

export function syncHostedReviewCacheFromGitHubPRResult(args: {
  cache: AppState['hostedReviewCache']
  repoPath: string
  branch: string
  settings: AppState['settings']
  repoId?: string
  executionHostId?: string | null
  hasRepoOwner?: boolean
  pr: PRInfo | null
  fetchedAt: number
  linkedPRNumber?: number | null
  fallbackPRNumber?: number | null
  fallbackPRSource?: GitHubPRFallbackSource | null
  preserveExistingPRForFallbackMiss?: boolean
  requestStartedAt?: number
  requestStartedEntry?: AppState['hostedReviewCache'][string]
}): { cache: AppState['hostedReviewCache']; accepted: boolean } {
  const hostedReviewCacheKey = getHostedReviewCacheKey(
    args.repoPath,
    args.branch,
    args.settings,
    args.repoId,
    args.executionHostId,
    args.hasRepoOwner === true
  )
  if (
    args.requestStartedAt !== undefined &&
    hasNewerHostedReviewCacheEntry(
      args.cache,
      hostedReviewCacheKey,
      args.requestStartedAt,
      args.requestStartedEntry
    )
  ) {
    return { cache: args.cache, accepted: false }
  }
  const hostedReviewEntry = args.cache[hostedReviewCacheKey]
  if (
    args.requestStartedAt === undefined &&
    hostedReviewEntry !== undefined &&
    hostedReviewEntry.fetchedAt >= args.fetchedAt
  ) {
    return { cache: args.cache, accepted: false }
  }
  if (args.pr && hostedReviewEntry?.data && hostedReviewEntry.data.provider !== 'github') {
    return { cache: args.cache, accepted: false }
  }
  // Why: a hosted-review row may only protect itself from an authoritative
  // miss when the paired PR cache is preserving a terminal, head-current PR.
  if (
    !args.pr &&
    args.linkedPRNumber == null &&
    args.fallbackPRNumber != null &&
    args.fallbackPRSource !== 'hosted-review' &&
    hostedReviewEntry?.data?.provider === 'github' &&
    hostedReviewEntry.data.number === args.fallbackPRNumber &&
    args.preserveExistingPRForFallbackMiss === true &&
    canPreserveReviewForFallbackMiss(hostedReviewEntry.data.state)
  ) {
    return { cache: args.cache, accepted: false }
  }
  if (!args.pr && !shouldClearHostedReviewForNoGitHubPR(hostedReviewEntry)) {
    return { cache: args.cache, accepted: hostedReviewEntry?.data == null }
  }
  return {
    cache: {
      ...args.cache,
      [hostedReviewCacheKey]: {
        data: args.pr ? hostedReviewInfoFromGitHubPRInfo(args.pr) : null,
        fetchedAt: args.fetchedAt,
        linkedReviewHintKey: args.pr
          ? linkedReviewHintKey({ linkedGitHubPR: args.pr.number })
          : linkedReviewHintKeyForNoGitHubPR(hostedReviewEntry)
      }
    },
    accepted: true
  }
}

import type { HostedReviewInfo } from '@yiru/protocol/hosted-review/types'

export type HostedReviewCacheEntry = {
  data: HostedReviewInfo | null
  fetchedAt: number
  linkedReviewHintKey?: string
}

export type HostedReviewCache = Record<string, HostedReviewCacheEntry>

type InflightHostedReviewRequest = {
  promise: Promise<HostedReviewInfo | null>
  force: boolean
  generation: number
  linkedReviewHintKey: string
}

const CACHE_TTL_MS = 60_000
const HOSTED_REVIEW_CACHE_MAX = 500
const inflightRequests = new Map<string, InflightHostedReviewRequest>()
const requestGenerations = new Map<string, number>()

export function isHostedReviewCacheFresh(entry: HostedReviewCacheEntry | undefined): boolean {
  return entry !== undefined && Date.now() - entry.fetchedAt < CACHE_TTL_MS
}

export function shouldRefetchHostedReviewForLinkedHint(
  cached: HostedReviewCacheEntry | undefined,
  hintKey: string
): boolean {
  return cached !== undefined && hintKey !== '' && (cached.linkedReviewHintKey ?? '') !== hintKey
}

export function shouldRefetchGitHubScopedResultForNoHint(
  cached: HostedReviewCacheEntry | undefined,
  hintKey: string
): boolean {
  // Why: a GitHub-scoped result does not prove the publishing remote has no other review.
  return (
    cached !== undefined &&
    hintKey === '' &&
    (cached.linkedReviewHintKey?.split('|').some((key) => key.startsWith('github:')) ?? false)
  )
}

export function isStaleMergedGitHubReviewForHead(
  cached: HostedReviewCacheEntry | undefined,
  currentHeadOid: string | null | undefined
): boolean {
  const head = typeof currentHeadOid === 'string' ? currentHeadOid.trim() : ''
  if (head.length === 0) {
    return false
  }
  const data = cached?.data
  return (
    data?.provider === 'github' &&
    data.state === 'merged' &&
    typeof data.headSha === 'string' &&
    data.headSha.length > 0 &&
    data.headSha !== head &&
    data.confirmedContainedHeadOid !== head
  )
}

export function hasNewerHostedReviewCacheEntry(
  cache: HostedReviewCache,
  cacheKey: string,
  requestStartedAt: number,
  requestStartedEntry: HostedReviewCacheEntry | undefined
): boolean {
  const entry = cache[cacheKey]
  return (
    entry !== undefined &&
    (entry.fetchedAt > requestStartedAt ||
      (entry.fetchedAt === requestStartedAt && entry !== requestStartedEntry))
  )
}

export function withHostedReviewCacheEntry(
  cache: HostedReviewCache,
  cacheKey: string,
  entry: HostedReviewCacheEntry
): HostedReviewCache {
  const next = { ...cache, [cacheKey]: entry }
  const keys = Object.keys(next)
  if (keys.length <= HOSTED_REVIEW_CACHE_MAX) {
    return next
  }
  const keep = new Set(
    keys
      .map((key) => ({ key, fetchedAt: next[key].fetchedAt }))
      .sort((left, right) => right.fetchedAt - left.fetchedAt)
      .slice(0, HOSTED_REVIEW_CACHE_MAX)
      .map((item) => item.key)
  )
  return Object.fromEntries([...keep].map((key) => [key, next[key]]))
}

export function getInflightHostedReviewRequest(
  cacheKey: string
): InflightHostedReviewRequest | undefined {
  return inflightRequests.get(cacheKey)
}

export function setInflightHostedReviewRequest(
  cacheKey: string,
  request: InflightHostedReviewRequest
): void {
  inflightRequests.set(cacheKey, request)
}

export function nextHostedReviewRequestGeneration(cacheKey: string): number {
  const generation = (requestGenerations.get(cacheKey) ?? 0) + 1
  requestGenerations.set(cacheKey, generation)
  return generation
}

export function isCurrentHostedReviewRequest(cacheKey: string, generation: number): boolean {
  return requestGenerations.get(cacheKey) === generation
}

export function finishHostedReviewRequest(cacheKey: string, generation: number): void {
  if (inflightRequests.get(cacheKey)?.generation === generation) {
    inflightRequests.delete(cacheKey)
  }
  if (requestGenerations.get(cacheKey) === generation) {
    requestGenerations.delete(cacheKey)
  }
}

import { LOCAL_EXECUTION_HOST_ID, normalizeExecutionHostId } from '@yiru/protocol/host/identity'
import type {
  GitHubCommentResult,
  GitHubOwnerRepo,
  PRCheckDetail,
  PRComment
} from '@yiru/protocol/hosted-review/review-types'
import {
  getProjectSourceCacheScope,
  type ProjectSourceContext
} from '@yiru/protocol/project/source-context'
import type { AppState } from '~renderer/store/types'

import { getGitHubPRCacheKey, getGitHubRepoCacheKey } from './cache-key'
import type { CacheEntry } from './store-contract'

export const CACHE_TTL_MS = 300_000
const CHECKS_CACHE_TTL_MS = 60_000
const EMPTY_CHECKS_CACHE_TTL_MS = 10_000
const MAX_CACHE_ENTRIES = 500
export const WORK_ITEMS_CACHE_TTL_MS = 60_000

export function workItemsCacheKey(
  repoId: string,
  limit: number,
  query: string,
  executionHostId?: string | null
): string {
  const scope = executionHostId?.trim() ?? ''
  const hostId = normalizeExecutionHostId(scope)
  const owner = `${repoId}::${limit}::${query}`
  if (hostId) {
    return hostId !== LOCAL_EXECUTION_HOST_ID ? `${hostId}::${owner}` : owner
  }
  return scope ? `${scope}::${owner}` : owner
}

export function runtimeScopedRepoCacheKey(
  repoPath: string,
  repoId: string | undefined,
  suffix: string,
  settings?: AppState['settings'],
  executionHostId?: string | null,
  hasRepoOwner = false
): string {
  return getGitHubRepoCacheKey(repoPath, repoId, suffix, settings, executionHostId, hasRepoOwner)
}

export function sourceScopedRepoCacheKey(
  repoPath: string,
  repoId: string | undefined,
  suffix: string,
  settings?: AppState['settings'],
  executionHostId?: string | null,
  sourceContext?: ProjectSourceContext | null,
  hasRepoOwner = false
): string {
  return sourceContext?.provider === 'github'
    ? `${getProjectSourceCacheScope(sourceContext)}::${repoId ?? repoPath}::${suffix}`
    : runtimeScopedRepoCacheKey(repoPath, repoId, suffix, settings, executionHostId, hasRepoOwner)
}

export function prCacheKey(
  repoPath: string,
  repoId: string | undefined,
  branch: string,
  settings?: AppState['settings'],
  executionHostId?: string | null,
  hasRepoOwner = false
): string {
  return getGitHubPRCacheKey(repoPath, repoId, branch, settings, executionHostId, hasRepoOwner)
}

export function repoCacheKeyPrefixes(repoId: string, repoPath?: string): string[] {
  return repoPath && repoPath !== repoId ? [`${repoId}::`, `${repoPath}::`] : [`${repoId}::`]
}

export function matchesRepoCacheKey(key: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => key.startsWith(prefix))
}

export function evictRepoCacheEntries<T>(
  cache: Record<string, CacheEntry<T>>,
  prefixes: readonly string[]
): { cache: Record<string, CacheEntry<T>>; evicted: boolean } {
  let next: Record<string, CacheEntry<T>> | null = null
  for (const key of Object.keys(cache)) {
    if (!matchesRepoCacheKey(key, prefixes)) {
      continue
    }
    next ??= { ...cache }
    delete next[key]
  }
  return next ? { cache: next, evicted: true } : { cache, evicted: false }
}

function normalizedRepoIdentity(repo: GitHubOwnerRepo): string {
  return `${repo.owner.toLowerCase()}/${repo.repo.toLowerCase()}`
}

export function prChecksCacheSuffix(
  prNumber: number,
  prRepo?: GitHubOwnerRepo | null,
  headSha?: string
): string {
  const trimmedHeadSha = headSha?.trim().toLowerCase()
  const base = prRepo
    ? `pr-checks::${normalizedRepoIdentity(prRepo)}::${prNumber}`
    : `pr-checks::${prNumber}`
  return trimmedHeadSha ? `${base}::head::${trimmedHeadSha}` : base
}

export function prCommentsCacheSuffix(prNumber: number, prRepo?: GitHubOwnerRepo | null): string {
  return prRepo
    ? `pr-comments::${normalizedRepoIdentity(prRepo)}::${prNumber}`
    : `pr-comments::${prNumber}`
}

export function mergePRCommentIntoList(
  comments: readonly PRComment[] | null | undefined,
  incoming: PRComment
): PRComment[] {
  const byId = new Map<number, PRComment>((comments ?? []).map((comment) => [comment.id, comment]))
  const previous = byId.get(incoming.id)
  byId.set(incoming.id, {
    ...previous,
    ...incoming,
    threadId: incoming.threadId ?? previous?.threadId,
    path: incoming.path ?? previous?.path,
    line: incoming.line ?? previous?.line,
    startLine: incoming.startLine ?? previous?.startLine,
    isResolved: incoming.isResolved ?? previous?.isResolved,
    isOutdated: incoming.isOutdated ?? previous?.isOutdated
  })
  const timestamp = (comment: PRComment): number => {
    const value = new Date(comment.createdAt).getTime()
    return Number.isFinite(value) ? value : 0
  }
  return Array.from(byId.values()).sort((a, b) => timestamp(a) - timestamp(b))
}

export function hasUsableCommentPayload(result: GitHubCommentResult): result is {
  ok: true
  comment: PRComment
} {
  return (
    result.ok &&
    typeof result.comment?.id === 'number' &&
    Number.isSafeInteger(result.comment.id) &&
    result.comment.id > 0 &&
    typeof result.comment.body === 'string' &&
    typeof result.comment.createdAt === 'string'
  )
}

export function isFresh<T>(
  entry: CacheEntry<T> | undefined,
  ttlMs = CACHE_TTL_MS
): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() - entry.fetchedAt < ttlMs
}

export function getPRChecksCacheTtl(entry: CacheEntry<PRCheckDetail[]> | undefined): number {
  return entry?.data?.length === 0 ? EMPTY_CHECKS_CACHE_TTL_MS : CHECKS_CACHE_TTL_MS
}

export function withBoundedCacheEntry<T extends { fetchedAt: number }>(
  cache: Record<string, T>,
  key: string,
  entry: T
): Record<string, T> {
  return evictStaleEntries({ ...cache, [key]: entry })
}

export function evictStaleEntries<T extends { fetchedAt: number }>(
  cache: Record<string, T>
): Record<string, T> {
  const keys = Object.keys(cache)
  if (keys.length <= MAX_CACHE_ENTRIES) {
    return cache
  }
  const keep = new Set(
    keys
      .map((candidate) => ({ key: candidate, fetchedAt: cache[candidate].fetchedAt }))
      .sort((a, b) => b.fetchedAt - a.fetchedAt)
      .slice(0, MAX_CACHE_ENTRIES)
      .map((candidate) => candidate.key)
  )
  return Object.fromEntries(Array.from(keep, (candidate) => [candidate, cache[candidate]]))
}

export function capPrRefreshSequences(sequences: Record<string, number>): Record<string, number> {
  const keys = Object.keys(sequences)
  return keys.length <= MAX_CACHE_ENTRIES
    ? sequences
    : Object.fromEntries(
        keys.slice(keys.length - MAX_CACHE_ENTRIES).map((key) => [key, sequences[key]])
      )
}

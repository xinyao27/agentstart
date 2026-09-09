import type { GitHubWorkItem } from '@yiru/protocol/hosted-review/review-types'
import { getProjectSourceCacheScope } from '@yiru/protocol/project/source-context'
import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'
import {
  isGitHubWorkItemsSshRemoteRequiredError,
  sortWorkItemsByNumber,
  PER_REPO_FETCH_LIMIT
} from '~renderer/work-items'

import {
  WORK_ITEMS_CACHE_TTL_MS as WORK_ITEMS_CACHE_TTL,
  isFresh,
  withBoundedCacheEntry,
  workItemsCacheKey
} from './cache-policy'
import { findRepoForGitHubOwner } from './repo-owner'
import type { GitHubSlice } from './store-contract'
import { workItemRequests } from './work-item-requests'
import { isGitHubWorkItemsQueryTooLarge } from './work-items-query-bounds'
import {
  getGitHubWorkItemRequestContext,
  getGitHubWorkItemSourceCacheScope,
  getGitHubWorkItemSourceHostId,
  getGitHubWorkItemSourceSettings,
  getWorkItemsCacheKeyForOwner,
  listGitHubWorkItemsForRepo
} from './work-items-request'

type GitHubWorkItemActions = Pick<
  GitHubSlice,
  'getCachedWorkItems' | 'fetchWorkItems' | 'fetchWorkItemsAcrossRepos' | 'prefetchWorkItems'
>

export function createGitHubWorkItemActions(
  set: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[1]
): GitHubWorkItemActions {
  return {
    getCachedWorkItems: (repoId, limit, query, repoPath, sourceContext) => {
      if (isGitHubWorkItemsQueryTooLarge(query)) {
        return null
      }
      const state = get()
      const key =
        sourceContext?.provider === 'github'
          ? workItemsCacheKey(repoId, limit, query, getProjectSourceCacheScope(sourceContext))
          : getWorkItemsCacheKeyForOwner(state, repoId, limit, query, repoPath)
      return get().workItemsCache[key]?.data ?? null
    },

    fetchWorkItems: async (repoId, repoPath, limit, query, options): Promise<GitHubWorkItem[]> => {
      if (isGitHubWorkItemsQueryTooLarge(query)) {
        return []
      }
      const requestState = get()
      const repo = findRepoForGitHubOwner(requestState, repoId, repoPath)
      const requestSettings = getGitHubWorkItemSourceSettings(
        requestState.settings,
        repo,
        options?.sourceContext
      )
      const ownerHostId = getGitHubWorkItemSourceHostId(requestState, repo, options?.sourceContext)
      const cacheScope = getGitHubWorkItemSourceCacheScope(
        requestState,
        repo,
        options?.sourceContext
      )
      const key = workItemsCacheKey(repoId, limit, query, cacheScope)
      const cached = get().workItemsCache[key]
      if (!options?.force && isFresh(cached, WORK_ITEMS_CACHE_TTL)) {
        return cached.data ?? []
      }

      const requestContext = getGitHubWorkItemRequestContext(
        requestState,
        requestSettings,
        repoId,
        repoPath,
        options?.sourceContext
      )
      return workItemRequests.execute({
        cacheKey: key,
        target: requestContext.target,
        force: Boolean(options?.force),
        noCache: Boolean(options?.noCache),
        load: async () => {
          try {
            const envelope = await listGitHubWorkItemsForRepo(requestContext, {
              limit,
              query: query || undefined,
              ...(options?.noCache ? { noCache: true } : {})
            })
            // Why: main does not know Yiru's Repo.id, so stamp it at the renderer boundary.
            const items: GitHubWorkItem[] = envelope.items.map((item) => ({ ...item, repoId }))
            const currentRepo = findRepoForGitHubOwner(get(), repoId, repoPath)
            const currentHostId = getGitHubWorkItemSourceHostId(
              get(),
              currentRepo,
              options?.sourceContext
            )
            // Why: host focus changes are allowed, but repo ownership changes mean
            // this response belongs to an older execution host bucket.
            if ((currentHostId ?? null) !== (ownerHostId ?? null)) {
              return items
            }
            set((s) => ({
              workItemsCache: withBoundedCacheEntry(s.workItemsCache, key, {
                data: items,
                fetchedAt: Date.now()
              })
            }))
            return items
          } catch (err) {
            // Why: surface the error to the caller; keep stale cache entry so the
            // UI can continue to render something useful while the user retries.
            if (!isGitHubWorkItemsSshRemoteRequiredError(err)) {
              console.error('Failed to fetch GitHub work items:', err)
            }
            throw err
          }
        }
      })
    },

    fetchWorkItemsAcrossRepos: async (repos, perRepoLimit, displayLimit, query, options) => {
      if (isGitHubWorkItemsQueryTooLarge(query)) {
        return { items: [], failedCount: 0 }
      }
      const state = get()
      let failedCount = 0
      const perProjectResults = await Promise.all(
        repos.map(async (r) => {
          try {
            return await state.fetchWorkItems(r.repoId, r.path, perRepoLimit, query, {
              ...options,
              sourceContext: r.sourceContext ?? options?.sourceContext
            })
          } catch (err) {
            // Why: fall back to any cache entry (stale or not) before declaring
            // this repo failed. Matches single-repo behavior of silently serving
            // stale data on error. A repo is only counted as failed when it has
            // nothing at all to contribute.
            // Why: must use perRepoLimit (not displayLimit) so the cache key
            // matches what fetchWorkItems wrote.
            if (isGitHubWorkItemsSshRemoteRequiredError(err)) {
              return [] as GitHubWorkItem[]
            }
            const key =
              r.sourceContext?.provider === 'github'
                ? workItemsCacheKey(
                    r.repoId,
                    perRepoLimit,
                    query,
                    getProjectSourceCacheScope(r.sourceContext)
                  )
                : getWorkItemsCacheKeyForOwner(get(), r.repoId, perRepoLimit, query, r.path)
            const cached = get().workItemsCache[key]?.data
            if (cached) {
              console.warn(`[workItems] ${r.repoId} failed, serving cached:`, err)
              return cached
            }
            console.warn(`[workItems] ${r.repoId} failed:`, err)
            failedCount += 1
            return [] as GitHubWorkItem[]
          }
        })
      )
      const merged = sortWorkItemsByNumber(perProjectResults.flat()).slice(0, displayLimit)
      return { items: merged, failedCount }
    },

    prefetchWorkItems: (repoId, repoPath, limit = PER_REPO_FETCH_LIMIT, query = '', options) => {
      if (isGitHubWorkItemsQueryTooLarge(query)) {
        return
      }
      const requestState = get()
      const repo = findRepoForGitHubOwner(requestState, repoId, repoPath)
      const key =
        options?.sourceContext?.provider === 'github'
          ? workItemsCacheKey(
              repoId,
              limit,
              query,
              getProjectSourceCacheScope(options.sourceContext)
            )
          : getWorkItemsCacheKeyForOwner(requestState, repoId, limit, query, repoPath)
      const cached = get().workItemsCache[key]
      const requestSettings = getGitHubWorkItemSourceSettings(
        requestState.settings,
        repo,
        options?.sourceContext
      )
      const requestContext = getGitHubWorkItemRequestContext(
        requestState,
        requestSettings,
        repoId,
        repoPath,
        options?.sourceContext
      )
      // Skip when the cache is fresh or a request is already in flight.
      if (
        isFresh(cached, WORK_ITEMS_CACHE_TTL) ||
        workItemRequests.has(key, requestContext.target)
      ) {
        return
      }
      void get()
        .fetchWorkItems(repoId, repoPath, limit, query, { sourceContext: options?.sourceContext })
        .catch(() => {})
    }
  }
}

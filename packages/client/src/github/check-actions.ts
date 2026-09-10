import type {
  PRCheckDetail,
  PRCheckRunDetails
} from '@agentstart/protocol/hosted-review/review-types'
import type { StateCreator } from 'zustand'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { runtimeCallDestination } from '~renderer/runtime/github-runtime-destination'
import { openGitHubTarget } from '~renderer/runtime/github-target'
import type { AppState } from '~renderer/store/types'

import {
  getPRChecksCacheTtl,
  isFresh,
  prChecksCacheSuffix,
  sourceScopedRepoCacheKey,
  withBoundedCacheEntry
} from './cache-policy'
import { syncPRChecksStatus } from './checks'
import { saveGitHubPRCache } from './pr-cache-persistence'
import type { GitHubSlice } from './store-contract'
import {
  getGitHubRepoSourceSettings,
  getGitHubWorkItemRequestContext,
  githubRuntimeRequest
} from './work-items-request'

type InflightChecks = {
  promise: Promise<PRCheckDetail[]>
  force: boolean
  noCache: boolean
}

const inflightRequests = new Map<string, InflightChecks>()

type GitHubCheckActions = Pick<GitHubSlice, 'fetchPRChecks' | 'fetchPRCheckDetails'>

export function createGitHubCheckActions(
  set: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[1]
): GitHubCheckActions {
  return {
    fetchPRChecks: async (
      repoPath,
      prNumber,
      branch,
      headSha,
      prRepo,
      options
    ): Promise<PRCheckDetail[]> => {
      const repo = readProjectCatalogRuntimeState().repos.find((candidate) =>
        options?.repoId ? candidate.id === options.repoId : candidate.path === repoPath
      )
      const repoId = options?.repoId ?? repo?.id
      const requestSettings = getGitHubRepoSourceSettings(
        get().settings,
        repo,
        options?.sourceContext
      )
      const cacheKey = sourceScopedRepoCacheKey(
        repoPath,
        repoId,
        prChecksCacheSuffix(prNumber, prRepo, headSha),
        requestSettings,
        repo?.executionHostId,
        options?.sourceContext,
        repo !== undefined
      )
      const legacyCacheKey = headSha
        ? sourceScopedRepoCacheKey(
            repoPath,
            repoId,
            prChecksCacheSuffix(prNumber, prRepo),
            requestSettings,
            repo?.executionHostId,
            options?.sourceContext,
            repo !== undefined
          )
        : cacheKey
      const inflightKey = cacheKey
      const cached = get().checksCache[cacheKey] ?? get().checksCache[legacyCacheKey]
      if (
        !options?.force &&
        !options?.noCache &&
        isFresh(cached, getPRChecksCacheTtl(cached)) &&
        (!headSha || cached.headSha === headSha)
      ) {
        const cachedChecks = cached.data ?? []
        const prStatusUpdate = syncPRChecksStatus(
          get(),
          repoPath,
          repoId,
          branch,
          cachedChecks,
          cached.headSha,
          prRepo,
          requestSettings,
          repo?.executionHostId,
          repo !== undefined
        )
        if (prStatusUpdate) {
          set(prStatusUpdate)
          saveGitHubPRCache(get())
        }
        return cachedChecks
      }

      const inflightRequest = inflightRequests.get(inflightKey)
      if (inflightRequest) {
        if (
          (options?.force && !inflightRequest.force) ||
          (options?.noCache && !inflightRequest.noCache)
        ) {
          await inflightRequest.promise.catch(() => {})
        } else {
          return inflightRequest.promise
        }
      }

      const request = (async () => {
        try {
          const requestContext = getGitHubWorkItemRequestContext(
            get(),
            requestSettings,
            repoId ?? repoPath,
            repoPath,
            options?.sourceContext
          )
          const ghRequest = githubRuntimeRequest(requestContext)
          const client = await openGitHubTarget()
          if (!client) {
            throw new Error('GitHub protocol capability is unavailable')
          }
          const checks = await client.getPrChecks(
            {
              repo: ghRequest.repo,
              prNumber,
              headSha,
              prRepo: prRepo ?? undefined,
              noCache: Boolean(options?.force || options?.noCache)
            },
            { timeoutMs: 30_000, ...runtimeCallDestination(ghRequest.target) }
          )
          set((s) => {
            const nextState: Partial<AppState> = {
              checksCache: withBoundedCacheEntry(s.checksCache, cacheKey, {
                data: checks,
                fetchedAt: Date.now(),
                headSha
              })
            }

            const prStatusUpdate = syncPRChecksStatus(
              s,
              repoPath,
              repoId,
              branch,
              checks,
              headSha,
              prRepo,
              requestSettings,
              repo?.executionHostId,
              repo !== undefined
            )
            if (prStatusUpdate?.prCache) {
              nextState.prCache = prStatusUpdate.prCache
            }

            return nextState
          })
          saveGitHubPRCache(get())
          return checks
        } catch (err) {
          console.error('Failed to fetch PR checks:', err)
          const latestCached = get().checksCache[cacheKey] ?? get().checksCache[legacyCacheKey]
          if (latestCached?.data && (!headSha || latestCached.headSha === headSha)) {
            return latestCached.data
          }
          return []
        } finally {
          inflightRequests.delete(inflightKey)
        }
      })()

      inflightRequests.set(inflightKey, {
        promise: request,
        force: Boolean(options?.force),
        noCache: Boolean(options?.force || options?.noCache)
      })
      return request
    },

    fetchPRCheckDetails: async (repoPath, args, options): Promise<PRCheckRunDetails | null> => {
      const repo = readProjectCatalogRuntimeState().repos.find((candidate) =>
        options?.repoId ? candidate.id === options.repoId : candidate.path === repoPath
      )
      const repoId = options?.repoId ?? repo?.id
      const requestSettings = getGitHubRepoSourceSettings(
        get().settings,
        repo,
        options?.sourceContext
      )
      const requestContext = getGitHubWorkItemRequestContext(
        get(),
        requestSettings,
        repoId ?? repoPath,
        repoPath,
        options?.sourceContext
      )
      const ghRequest = githubRuntimeRequest(requestContext)
      const client = await openGitHubTarget()
      if (!client) {
        throw new Error('GitHub protocol capability is unavailable')
      }
      return await client.getPrCheckDetails(
        {
          repo: ghRequest.repo,
          checkRunId: args.checkRunId,
          workflowRunId: args.workflowRunId,
          checkName: args.checkName,
          url: args.url,
          prRepo: args.prRepo ?? undefined
        },
        { timeoutMs: 30_000, ...runtimeCallDestination(ghRequest.target) }
      )
    }
  }
}

import { LOCAL_EXECUTION_HOST_ID, getRepoExecutionHostId } from '@agentstart/protocol/host/identity'
import type { PRInfo } from '@agentstart/protocol/hosted-review/pull-request-types'
import type { StateCreator } from 'zustand'
import { runtimeCallDestination } from '~renderer/runtime/github-runtime-destination'
import { openGitHubTarget } from '~renderer/runtime/github-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import type { AppState } from '~renderer/store/types'

import { isStaleExactLinkedPRLookup } from './linked-pr-policy'
import { clearCachedDivergedLinkedPR, reconcileLinkedPRResult } from './linked-pr-reconciliation'
import { saveGitHubPRCache } from './pr-cache-persistence'
import { shouldPreserveExistingPRForFallbackMiss } from './pr-cache-policy'
import { setGitHubPRResultCaches } from './pr-cache-sync'
import { resolveGitHubPRRequestContext } from './pr-request-context'
import { buildGitHubPRRefreshStateClearToken } from './refresh-state'
import { getRuntimeRepoTarget } from './repo-owner'
import type { GitHubSlice } from './store-contract'
import { findUniqueWorktreeById } from './worktree-lookup'

const inflightRequests = new Map<
  string,
  { promise: Promise<PRInfo | null>; force: boolean; generation: number; lookupHintKey: string }
>()
const requestGenerations = new Map<string, number>()

type GitHubPRActions = Pick<GitHubSlice, 'fetchPRForBranch'>

export function createGitHubPRActions(
  set: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[1]
): GitHubPRActions {
  return {
    fetchPRForBranch: async (repoPath, branch, options): Promise<PRInfo | null> => {
      const context = resolveGitHubPRRequestContext(get(), repoPath, branch, options)
      if (!context) {
        return null
      }
      const {
        repo,
        repoId,
        requestSettings,
        cacheKey,
        cached,
        hostedReviewCacheKey,
        linkedPRNumber,
        fallbackPRNumber,
        fallbackPRSource,
        lookupHintKey,
        linkedRefetch
      } = context
      if (context.canUseCache) {
        if (cached?.data) {
          clearCachedDivergedLinkedPR(get, {
            pr: cached.data,
            worktreeId: options?.worktreeId,
            executionHostId: options?.executionHostId,
            linkedPRNumber,
            branch
          })
        }
        return cached?.data ?? null
      }

      const inflightRequest = inflightRequests.get(cacheKey)
      if (
        inflightRequest &&
        (!options?.force || inflightRequest.force) &&
        inflightRequest.lookupHintKey === lookupHintKey &&
        !linkedRefetch
      ) {
        return inflightRequest.promise
      }

      const generation = (requestGenerations.get(cacheKey) ?? 0) + 1
      const requestStartedAt = Date.now()
      const requestStartedHostedReviewEntry = get().hostedReviewCache[hostedReviewCacheKey]
      const requestStartedPRRefreshState = get().prRefreshStates[cacheKey]
      const requestStartedPRRefreshToken = buildGitHubPRRefreshStateClearToken(
        requestStartedPRRefreshState,
        get().prRefreshSequences,
        cacheKey
      )
      requestGenerations.set(cacheKey, generation)

      const request = (async () => {
        try {
          const runtimeRepo = getRuntimeRepoTarget(get(), repoPath, requestSettings, repo)
          const candidateWorktree = options?.worktreeId
            ? findUniqueWorktreeById(get(), options.worktreeId, options.executionHostId)
            : null
          const requestHeadOid = candidateWorktree?.head ?? null
          const ghRequest: { target: RuntimeClientTarget; repo: string } = runtimeRepo
            ? { target: runtimeRepo.target, repo: runtimeRepo.repo.id }
            : { target: { kind: 'local' }, repo: repoId ?? repoPath }
          const client = await openGitHubTarget()
          if (!client) {
            throw new Error('GitHub protocol capability is unavailable')
          }
          const outcome = await client.refreshPrForBranch(
            ghRequest.repo,
            branch,
            {
              linkedPRNumber,
              currentHeadOid: requestHeadOid,
              ...(fallbackPRNumber !== null
                ? { fallbackPRNumber, acceptMergedFallbackPR: fallbackPRSource !== null }
                : {})
            },
            { timeoutMs: 30_000, ...runtimeCallDestination(ghRequest.target) }
          )
          const pr: PRInfo | null = outcome.kind === 'found' ? outcome.pr : null
          if (outcome.kind === 'upstream-error') {
            return cached?.data ?? null
          }
          if (requestGenerations.get(cacheKey) === generation) {
            let skippedStaleLinkedPRLookup = false
            let didUpdatePRCache = false
            set((s) => {
              // Why: unlinking a PR while an exact linked-PR lookup is in flight
              // must prevent that older result from restoring the manual link UI.
              if (
                isStaleExactLinkedPRLookup(
                  s,
                  options?.worktreeId,
                  linkedPRNumber,
                  options?.executionHostId
                )
              ) {
                skippedStaleLinkedPRLookup = true
                return {}
              }
              const updates = setGitHubPRResultCaches(s, {
                prCacheKey: cacheKey,
                repoPath,
                branch,
                settings: requestSettings,
                repoId,
                executionHostId: repo?.executionHostId,
                hasRepoOwner: repo !== undefined,
                pr,
                fetchedAt: outcome.fetchedAt,
                worktreeId: options?.worktreeId,
                linkedPRNumber,
                fallbackPRNumber,
                fallbackPRSource,
                requestStartedAt,
                requestStartedEntry: requestStartedHostedReviewEntry
              })
              didUpdatePRCache = updates.prCache !== undefined
              return updates
            })
            if (skippedStaleLinkedPRLookup) {
              return null
            }
            if (didUpdatePRCache) {
              saveGitHubPRCache(get())
            }
            reconcileLinkedPRResult(get, {
              pr,
              repoPath,
              repoId,
              repoExecutionHostId: repo ? getRepoExecutionHostId(repo) : LOCAL_EXECUTION_HOST_ID,
              branch,
              requestHeadOid,
              worktreeId: options?.worktreeId,
              linkedPRNumber,
              executionHostId: options?.executionHostId
            })
          }
          if (
            shouldPreserveExistingPRForFallbackMiss({
              currentPR: get().prCache[cacheKey]?.data,
              nextPR: pr,
              state: get(),
              worktreeId: options?.worktreeId,
              linkedPRNumber,
              fallbackPRNumber,
              fallbackPRSource,
              executionHostId: options?.executionHostId
            })
          ) {
            return get().prCache[cacheKey]?.data ?? null
          }
          return pr ?? null
        } catch (err) {
          console.error('Failed to fetch PR:', err)
          return null
        } finally {
          const activeRequest = inflightRequests.get(cacheKey)
          if (activeRequest?.generation === generation) {
            inflightRequests.delete(cacheKey)
            if (requestGenerations.get(cacheKey) === generation) {
              requestGenerations.delete(cacheKey)
            }
          }
          if (requestStartedPRRefreshToken) {
            get().expireGitHubPRRefreshState(cacheKey, requestStartedPRRefreshToken)
          }
        }
      })()

      inflightRequests.set(cacheKey, {
        promise: request,
        force: Boolean(options?.force),
        generation,
        lookupHintKey
      })
      return request
    }
  }
}

import { getRepoExecutionHostId, type ExecutionHostId } from '@agentstart/protocol/host/identity'
import type {
  CreateHostedReviewInput,
  CreateHostedReviewResult,
  HostedReviewCreationEligibility,
  HostedReviewCreationEligibilityArgs,
  HostedReviewInfo
} from '@agentstart/protocol/hosted-review/types'
import type { StateCreator } from 'zustand'
import { readProjectCatalogRuntimeState } from '~renderer/project-catalog/runtime-state'
import { runtimeCallDestination } from '~renderer/runtime/github-runtime-destination'
import { openGitHubTarget } from '~renderer/runtime/github-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

import type { AppState } from '../../store/types'
import {
  finishHostedReviewRequest,
  getInflightHostedReviewRequest,
  hasNewerHostedReviewCacheEntry,
  isCurrentHostedReviewRequest,
  isHostedReviewCacheFresh,
  isStaleMergedGitHubReviewForHead,
  nextHostedReviewRequestGeneration,
  setInflightHostedReviewRequest,
  shouldRefetchGitHubScopedResultForNoHint,
  shouldRefetchHostedReviewForLinkedHint,
  withHostedReviewCacheEntry,
  type HostedReviewCache
} from './cache'
import {
  getHostedReviewCacheKey,
  linkedReviewHintKey,
  type LinkedReviewHints
} from './cache-identity'
import {
  findHostedReviewRepoByPath,
  settingsForHostedReviewActionOwner,
  settingsForHostedReviewRepoOwner
} from './owner'

export { getHostedReviewCacheKey, linkedReviewHintKey } from './cache-identity'

type FetchOptions = {
  force?: boolean
  repoId?: string
  executionHostId?: ExecutionHostId
  staleWhileRevalidate?: boolean
  currentHeadOid?: string | null
}
type CreateHostedReviewStoreInput = CreateHostedReviewInput & { repoId?: string | null }

export type HostedReviewSlice = {
  hostedReviewCache: HostedReviewCache
  getHostedReviewCreationEligibility: (
    args: HostedReviewCreationEligibilityArgs
  ) => Promise<HostedReviewCreationEligibility>
  createHostedReview: (
    repoPath: string,
    input: CreateHostedReviewStoreInput
  ) => Promise<CreateHostedReviewResult>
  fetchHostedReviewForBranch: (
    repoPath: string,
    branch: string,
    options?: FetchOptions & LinkedReviewHints
  ) => Promise<HostedReviewInfo | null>
}

type RefreshHostedReviewCardArgs = {
  repoPath: string
  repoId: string
  branch: string
  linkedGitHubPR?: number | null
  fallbackGitHubPR?: number | null
}

export function refreshHostedReviewCard(
  fetchHostedReviewForBranch: HostedReviewSlice['fetchHostedReviewForBranch'],
  args: RefreshHostedReviewCardArgs
): Promise<HostedReviewInfo | null> {
  const fallbackGitHubPR = args.linkedGitHubPR == null ? (args.fallbackGitHubPR ?? null) : null
  return fetchHostedReviewForBranch(args.repoPath, args.branch, {
    force: true,
    repoId: args.repoId,
    linkedGitHubPR: args.linkedGitHubPR ?? null,
    ...(fallbackGitHubPR !== null ? { fallbackGitHubPR } : {})
  })
}

export const createHostedReviewSlice: StateCreator<AppState, [], [], HostedReviewSlice> = (
  set,
  get
) => ({
  hostedReviewCache: {},

  getHostedReviewCreationEligibility: async (args) => {
    const settings = get().settings
    const repo = findHostedReviewRepoByPath(
      readProjectCatalogRuntimeState().repos,
      args.repoPath,
      args.repoId
    )
    const ownerSettings = settingsForHostedReviewActionOwner(settings, repo)
    const target = getActiveRuntimeTarget(ownerSettings)
    const { repoPath: _repoPath, worktreePath, ...runtimeArgs } = args
    void _repoPath
    const client = await openGitHubTarget()
    if (!client) {
      throw new Error('GitHub protocol capability is unavailable')
    }
    return client.getHostedReviewCreationEligibility(
      {
        repo: repo?.id ?? args.repoPath,
        ...(worktreePath ? { worktree: `path:${worktreePath}` } : {}),
        ...runtimeArgs
      },
      { timeoutMs: 30_000, ...runtimeCallDestination(target) }
    )
  },

  createHostedReview: async (repoPath, input) => {
    const settings = get().settings
    const repo = findHostedReviewRepoByPath(
      readProjectCatalogRuntimeState().repos,
      repoPath,
      input.repoId
    )
    const ownerSettings = settingsForHostedReviewActionOwner(settings, repo)
    const target = getActiveRuntimeTarget(ownerSettings)
    const { repoId: _inputRepoId, ...hostedReviewInput } = input
    void _inputRepoId
    const { worktreePath, ...runtimeInput } = hostedReviewInput
    const client = await openGitHubTarget()
    if (!client) {
      throw new Error('GitHub protocol capability is unavailable')
    }
    return client.createHostedReview(
      {
        repo: repo?.id ?? repoPath,
        ...(worktreePath ? { worktree: `path:${worktreePath}` } : {}),
        ...runtimeInput
      },
      { timeoutMs: 60_000, ...runtimeCallDestination(target) }
    )
  },

  fetchHostedReviewForBranch: async (
    repoPath,
    branch,
    options
  ): Promise<HostedReviewInfo | null> => {
    const settings = get().settings
    const repo = readProjectCatalogRuntimeState().repos.find((candidate) => {
      const matchesRepo = options?.repoId
        ? candidate.id === options.repoId
        : candidate.path === repoPath
      return (
        matchesRepo &&
        (!options?.executionHostId || getRepoExecutionHostId(candidate) === options.executionHostId)
      )
    })
    const ownerSettings = settingsForHostedReviewRepoOwner(settings, repo)
    const target = getActiveRuntimeTarget(ownerSettings)
    const repoId = options?.repoId ?? repo?.id
    const cacheKey = getHostedReviewCacheKey(
      repoPath,
      branch,
      ownerSettings,
      repoId,
      repo?.executionHostId,
      repo !== undefined
    )
    const cached = get().hostedReviewCache[cacheKey]
    const hintKey = linkedReviewHintKey(options)
    const linkedRefetch = shouldRefetchHostedReviewForLinkedHint(cached, hintKey)
    const scopedResultRefetch = shouldRefetchGitHubScopedResultForNoHint(cached, hintKey)
    const staleMergedHeadRefetch = isStaleMergedGitHubReviewForHead(cached, options?.currentHeadOid)
    if (
      !options?.force &&
      !linkedRefetch &&
      !scopedResultRefetch &&
      !staleMergedHeadRefetch &&
      isHostedReviewCacheFresh(cached)
    ) {
      return cached.data
    }

    const inflightRequest = getInflightHostedReviewRequest(cacheKey)
    const inflightHasRequestedHint = inflightRequest?.linkedReviewHintKey === hintKey
    const startRequest = (): Promise<HostedReviewInfo | null> => {
      const generation = nextHostedReviewRequestGeneration(cacheKey)
      const requestStartedAt = Date.now()
      const requestStartedEntry = get().hostedReviewCache[cacheKey]
      const request = (async () => {
        try {
          const fallbackGitHubPR =
            options?.linkedGitHubPR == null ? (options?.fallbackGitHubPR ?? null) : null
          const args = {
            branch,
            ...(options?.repoId !== undefined ? { repoId: options.repoId } : {}),
            currentHeadOid: options?.currentHeadOid ?? null,
            linkedGitHubPR: options?.linkedGitHubPR ?? null,
            ...(fallbackGitHubPR !== null ? { fallbackGitHubPR } : {})
          }
          const client = await openGitHubTarget()
          if (!client) {
            throw new Error('GitHub protocol capability is unavailable')
          }
          const pr = await client.getHostedReviewForBranch(
            repo?.id ?? options?.repoId ?? repoPath,
            branch,
            {
              linkedPRNumber: args.linkedGitHubPR,
              fallbackPRNumber: fallbackGitHubPR,
              currentHeadOid: args.currentHeadOid
            },
            // Why: remote dev boxes can be slower at `git`/`gh` lookups than
            // local desktop repos, especially on Windows filesystem paths. The
            // main-process queue caps concurrency, so a longer timeout no
            // longer risks a background socket stampede.
            { timeoutMs: 30_000, ...runtimeCallDestination(target) }
          )
          const review: HostedReviewInfo | null = pr
            ? {
                provider: 'github',
                number: pr.number,
                title: pr.title,
                state: pr.state,
                url: pr.url,
                status: pr.checksStatus,
                updatedAt: pr.updatedAt,
                mergeable: pr.mergeable,
                reviewDecision: pr.reviewDecision,
                autoMergeEnabled: pr.autoMergeEnabled,
                autoMergeAllowed: pr.autoMergeAllowed,
                mergeQueueRequired: pr.mergeQueueRequired,
                mergeStateStatus: pr.mergeStateStatus,
                headSha: pr.headSha,
                confirmedContainedHeadOid: pr.confirmedContainedHeadOid,
                baseRefName: pr.baseRefName,
                conflictSummary: pr.conflictSummary
              }
            : null
          if (isCurrentHostedReviewRequest(cacheKey, generation)) {
            set((state) => {
              if (
                hasNewerHostedReviewCacheEntry(
                  state.hostedReviewCache,
                  cacheKey,
                  requestStartedAt,
                  requestStartedEntry
                )
              ) {
                return {}
              }
              return {
                hostedReviewCache: withHostedReviewCacheEntry(state.hostedReviewCache, cacheKey, {
                  data: review,
                  fetchedAt: Date.now(),
                  linkedReviewHintKey: hintKey
                })
              }
            })
          }
          return review
        } catch (error) {
          // Why: a transient lookup failure (timeout, rate limit, gh/git error)
          // must not be cached as a definitive "no review" miss — that blanks
          // the sidebar card to branch-only and suppresses retry for the full
          // cache TTL. Preserve the last known review and let the next visible
          // poll retry instead.
          console.error('Failed to fetch hosted review:', error)
          const preserved = get().hostedReviewCache[cacheKey]
          // Why: don't preserve a merged GitHub review the worktree has moved
          // off of; that PR is only valid while checked out at its head.
          if (isStaleMergedGitHubReviewForHead(preserved, options?.currentHeadOid)) {
            return null
          }
          return preserved?.data ?? null
        } finally {
          finishHostedReviewRequest(cacheKey, generation)
        }
      })()

      setInflightHostedReviewRequest(cacheKey, {
        promise: request,
        force: Boolean(options?.force),
        generation,
        linkedReviewHintKey: hintKey
      })
      return request
    }

    if (
      !options?.force &&
      !linkedRefetch &&
      !scopedResultRefetch &&
      options?.staleWhileRevalidate &&
      cached !== undefined &&
      cached.data !== null
    ) {
      // Why: sidebar PR metadata can stay visible while a quiet refresh updates
      // it; don't block card rendering on a quota-bound GitHub round trip.
      if (!inflightRequest || !inflightHasRequestedHint) {
        void startRequest()
      }
      return cached.data
    }

    if (inflightRequest && (!options?.force || inflightRequest.force) && inflightHasRequestedHint) {
      return inflightRequest.promise
    }

    return startRequest()
  }
})

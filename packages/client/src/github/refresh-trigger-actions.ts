import {
  LOCAL_EXECUTION_HOST_ID,
  getRepoExecutionHostId,
  normalizeExecutionHostId
} from '@yiru/protocol/host/identity'
import type { GitHubPRRefreshCandidate } from '@yiru/protocol/hosted-review/pull-request-types'
import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'
import { rightSidebarShowsPullRequestData } from '~renderer/workspace-panel/right-sidebar-visibility'

import {
  CACHE_TTL_MS as CACHE_TTL,
  evictRepoCacheEntries,
  evictStaleEntries,
  prCacheKey,
  repoCacheKeyPrefixes
} from './cache-policy'
import { buildPRRefreshCandidate } from './refresh-candidate'
import { pruneExpiredPRRefreshStates } from './refresh-state'
import {
  enqueueLocalGitHubPRRefresh,
  getPRRefreshRuntimeRepoTarget,
  settingsForGitHubRepoOwner,
  shouldEnqueueLocalPRRefresh
} from './repo-owner'
import type { GitHubSlice } from './store-contract'
import { workItemRequests } from './work-item-requests'
import { findUniqueWorktreeById } from './worktree-lookup'

type GitHubRefreshTriggerActions = Pick<
  GitHubSlice,
  | 'refreshAllGitHub'
  | 'refreshGitHubForWorktree'
  | 'evictGitHubRepoCaches'
  | 'refreshGitHubForWorktreeIfStale'
>

export function createGitHubRefreshTriggerActions(
  set: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[1]
): GitHubRefreshTriggerActions {
  return {
    refreshAllGitHub: () => {
      set((state) => ({
        commentsCache: {},
        prCache: evictStaleEntries(state.prCache),
        checksCache: evictStaleEntries(state.checksCache),
        workItemsCache: evictStaleEntries(state.workItemsCache),
        prRefreshStates: pruneExpiredPRRefreshStates(state.prRefreshStates)
      }))

      const state = get()
      const now = Date.now()
      const stalePRCandidates: { candidate: GitHubPRRefreshCandidate; score: number }[] = []
      const cardProps = state.worktreeCardProperties ?? []
      const isPRStatusGrouping = state.groupBy === 'pr-status'
      const shouldRefreshPRs =
        isPRStatusGrouping ||
        rightSidebarShowsPullRequestData(state) ||
        cardProps.includes('status')

      for (const worktrees of Object.values(state.worktreesByRepo)) {
        for (const worktree of worktrees) {
          const repo = state.repos.find((candidate) => candidate.id === worktree.repoId)
          if (!repo) {
            continue
          }

          const branch = worktree.branch.replace(/^refs\/heads\//, '')
          if (!shouldRefreshPRs || worktree.isBare || !branch) {
            continue
          }

          const ownerSettings = settingsForGitHubRepoOwner(state.settings, repo)
          const cacheKey = prCacheKey(
            repo.path,
            repo.id,
            branch,
            ownerSettings,
            repo.executionHostId
          )
          const entry = state.prCache[cacheKey]
          if (!entry || now - entry.fetchedAt >= CACHE_TTL) {
            const candidate = buildPRRefreshCandidate(state, worktree)
            if (candidate) {
              stalePRCandidates.push({
                candidate,
                score:
                  (state.activeWorktreeId === worktree.id ? Number.MAX_SAFE_INTEGER : 0) +
                  worktree.lastActivityAt
              })
            }
          }
        }
      }

      for (const { candidate } of stalePRCandidates
        .sort((a, b) => b.score - a.score)
        .slice(0, isPRStatusGrouping ? stalePRCandidates.length : 5)) {
        if (getPRRefreshRuntimeRepoTarget(state, candidate)) {
          void get().fetchPRForBranch(candidate.repoPath, candidate.branch, {
            repoId: candidate.repoId,
            worktreeId: candidate.worktreeId,
            linkedPRNumber: candidate.linkedPRNumber ?? null,
            fallbackPRNumber: candidate.fallbackPRNumber ?? null,
            fallbackPRSource: candidate.fallbackPRSource ?? null
          })
        } else if (shouldEnqueueLocalPRRefresh(candidate)) {
          enqueueLocalGitHubPRRefresh({ candidate, reason: 'swr', priority: 10 })
        }
      }
    },

    refreshGitHubForWorktree: (worktreeId, executionHostId) => {
      const state = get()
      const worktree = findUniqueWorktreeById(state, worktreeId, executionHostId)
      if (!worktree) {
        return
      }

      const expectedHostId =
        executionHostId === undefined
          ? normalizeExecutionHostId(worktree.hostId)
          : (normalizeExecutionHostId(executionHostId) ?? LOCAL_EXECUTION_HOST_ID)
      const matchingRepos = state.repos.filter(
        (repo) =>
          repo.id === worktree.repoId &&
          (!expectedHostId || getRepoExecutionHostId(repo) === expectedHostId)
      )
      if (matchingRepos.length !== 1) {
        return
      }
      const repo = matchingRepos[0]

      const branch = worktree.branch.replace(/^refs\/heads\//, '')
      const ownerSettings = settingsForGitHubRepoOwner(state.settings, repo)
      const cacheKey = prCacheKey(repo.path, repo.id, branch, ownerSettings, repo.executionHostId)
      set((current) =>
        current.prCache[cacheKey]
          ? {
              prCache: {
                ...current.prCache,
                [cacheKey]: { ...current.prCache[cacheKey], fetchedAt: 0 }
              }
            }
          : current
      )

      if (worktree.isBare || !branch) {
        return
      }
      const candidate = buildPRRefreshCandidate(get(), worktree, undefined, repo)
      if (!candidate) {
        return
      }

      if (getPRRefreshRuntimeRepoTarget(get(), candidate)) {
        void get().fetchPRForBranch(candidate.repoPath, candidate.branch, {
          force: true,
          repoId: candidate.repoId,
          executionHostId: getRepoExecutionHostId(repo),
          worktreeId: candidate.worktreeId,
          linkedPRNumber: candidate.linkedPRNumber ?? null,
          fallbackPRNumber: candidate.fallbackPRNumber ?? null,
          fallbackPRSource: candidate.fallbackPRSource ?? null
        })
      } else if (shouldEnqueueLocalPRRefresh(candidate)) {
        enqueueLocalGitHubPRRefresh({ candidate, reason: 'post-push', priority: 100 })
      }
    },

    evictGitHubRepoCaches: (repoId, repoPath) => {
      workItemRequests.clearRepo(repoId, repoPath)
      set((state) => {
        const prefixes = repoCacheKeyPrefixes(repoId, repoPath)
        const workItems = evictRepoCacheEntries(state.workItemsCache, prefixes)
        const prs = evictRepoCacheEntries(state.prCache, prefixes)
        const checks = evictRepoCacheEntries(state.checksCache, prefixes)
        const comments = evictRepoCacheEntries(state.commentsCache, prefixes)
        const updates: Partial<AppState> = {}

        if (workItems.evicted) {
          updates.workItemsCache = workItems.cache
        }
        if (prs.evicted) {
          updates.prCache = prs.cache
        }
        if (checks.evicted) {
          updates.checksCache = checks.cache
        }
        if (comments.evicted) {
          updates.commentsCache = comments.cache
        }
        return updates
      })
    },

    // Why: activation is the strongest freshness signal; route it through the
    // coordinator so clicks revalidate PR state without bypassing coalescing.
    refreshGitHubForWorktreeIfStale: (worktreeId) => {
      const state = get()
      const worktree = Object.values(state.worktreesByRepo)
        .flat()
        .find((candidate) => candidate.id === worktreeId)
      if (!worktree) {
        return
      }

      const shouldRefreshPR =
        state.groupBy === 'pr-status' ||
        (state.worktreeCardProperties ?? []).includes('status') ||
        rightSidebarShowsPullRequestData(state)
      const branch = worktree.branch.replace(/^refs\/heads\//, '')
      if (!shouldRefreshPR || worktree.isBare || !branch) {
        return
      }

      const candidate = buildPRRefreshCandidate(state, worktree)
      if (!candidate) {
        return
      }

      if (getPRRefreshRuntimeRepoTarget(state, candidate)) {
        void get().fetchPRForBranch(candidate.repoPath, candidate.branch, {
          force: true,
          repoId: candidate.repoId,
          worktreeId: candidate.worktreeId,
          linkedPRNumber: candidate.linkedPRNumber ?? null,
          fallbackPRNumber: candidate.fallbackPRNumber ?? null,
          fallbackPRSource: candidate.fallbackPRSource ?? null
        })
      } else if (shouldEnqueueLocalPRRefresh(candidate)) {
        enqueueLocalGitHubPRRefresh({ candidate, reason: 'active', priority: 80 })
      }
    }
  }
}

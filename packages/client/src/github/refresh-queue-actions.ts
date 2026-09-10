import type { GitHubPRRefreshCandidate } from '@agentstart/protocol/hosted-review/pull-request-types'
import type { StateCreator } from 'zustand'
import { reportShellVisibleGitHubPRRefreshCandidates } from '~renderer/runtime/github-shell-client'
import type { AppState } from '~renderer/store/types'

import { buildPRRefreshCandidate } from './refresh-candidate'
import { bypassesGitHubPRRefreshFreshness } from './refresh-state'
import {
  enqueueLocalGitHubPRRefresh,
  getPRRefreshRuntimeRepoTarget,
  shouldEnqueueLocalPRRefresh
} from './repo-owner'
import type { GitHubSlice } from './store-contract'
import { findWorktreeById } from './worktree-lookup'

type GitHubRefreshQueueActions = Pick<
  GitHubSlice,
  | 'enqueueGitHubPRRefresh'
  | 'reportVisibleGitHubPRRefreshCandidates'
  | 'bumpGitHubPRVisibleRefreshGeneration'
>

export function createGitHubRefreshQueueActions(
  set: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], GitHubSlice>>[1]
): GitHubRefreshQueueActions {
  return {
    enqueueGitHubPRRefresh: (worktreeId, reason, priority = 0) => {
      const state = get()
      const worktree = findWorktreeById(state, worktreeId)
      const candidate = worktree ? buildPRRefreshCandidate(state, worktree) : null
      if (!candidate) {
        return
      }
      if (getPRRefreshRuntimeRepoTarget(state, candidate)) {
        void get().fetchPRForBranch(candidate.repoPath, candidate.branch, {
          force: bypassesGitHubPRRefreshFreshness(reason),
          repoId: candidate.repoId,
          worktreeId: candidate.worktreeId,
          linkedPRNumber: candidate.linkedPRNumber ?? null,
          fallbackPRNumber: candidate.fallbackPRNumber ?? null,
          fallbackPRSource: candidate.fallbackPRSource ?? null
        })
        return
      }
      if (!shouldEnqueueLocalPRRefresh(candidate)) {
        return
      }
      enqueueLocalGitHubPRRefresh({ candidate, reason, priority }, async () => {
        await get().fetchPRForBranch(candidate.repoPath, candidate.branch, {
          force: bypassesGitHubPRRefreshFreshness(reason),
          repoId: candidate.repoId,
          worktreeId: candidate.worktreeId,
          linkedPRNumber: candidate.linkedPRNumber ?? null,
          fallbackPRNumber: candidate.fallbackPRNumber ?? null,
          fallbackPRSource: candidate.fallbackPRSource ?? null
        })
      })
    },

    reportVisibleGitHubPRRefreshCandidates: (worktreeIds, generation) => {
      const state = get()
      const candidates = worktreeIds
        .map((id) => {
          const worktree = findWorktreeById(state, id)
          return worktree ? buildPRRefreshCandidate(state, worktree) : null
        })
        .filter((candidate): candidate is GitHubPRRefreshCandidate => candidate !== null)
      const localCandidates: GitHubPRRefreshCandidate[] = []
      for (const candidate of candidates) {
        if (getPRRefreshRuntimeRepoTarget(state, candidate)) {
          void get().fetchPRForBranch(candidate.repoPath, candidate.branch, {
            repoId: candidate.repoId,
            worktreeId: candidate.worktreeId,
            linkedPRNumber: candidate.linkedPRNumber ?? null,
            fallbackPRNumber: candidate.fallbackPRNumber ?? null,
            fallbackPRSource: candidate.fallbackPRSource ?? null
          })
          continue
        }
        if (shouldEnqueueLocalPRRefresh(candidate)) {
          localCandidates.push(candidate)
        }
      }
      void reportShellVisibleGitHubPRRefreshCandidates({
        candidates: localCandidates,
        generation
      }).catch((err) => {
        console.warn('Failed to report visible PR refresh candidates:', err)
      })
    },

    bumpGitHubPRVisibleRefreshGeneration: () => {
      set((s) => ({ prVisibleRefreshGeneration: s.prVisibleRefreshGeneration + 1 }))
    }
  }
}

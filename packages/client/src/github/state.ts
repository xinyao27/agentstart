import type { StateCreator } from 'zustand'
import { shellClient } from '~renderer/runtime/shell-client'
import type { AppState } from '~renderer/store/types'

import { evictStaleEntries } from './cache-policy'
import { createGitHubCheckActions } from './check-actions'
import { createGitHubCommentActions } from './comment-actions'
import { createGitHubPRActions } from './pr-actions'
import { createGitHubRefreshEventActions } from './refresh-event-actions'
import { createGitHubRefreshQueueActions } from './refresh-queue-actions'
import {
  ACTIVE_PR_REFRESH_STATUSES,
  getEffectiveGitHubPRRefreshState,
  isExpiredActivePRRefreshState
} from './refresh-state'
import { createGitHubRefreshTriggerActions } from './refresh-trigger-actions'
import type { GitHubSlice } from './store-contract'
import { createGitHubWorkItemActions } from './work-item-actions'

export type { GitHubSlice, PRRefreshState } from './store-contract'
export {
  buildGitHubPRRefreshStateClearToken,
  getGitHubPRRefreshStateExpiryAt
} from './refresh-state'
export { mergePRCommentIntoList, prChecksCacheSuffix, prCommentsCacheSuffix } from './cache-policy'
export const createGitHubSlice: StateCreator<AppState, [], [], GitHubSlice> = (set, get) => ({
  prCache: {},
  checksCache: {},
  commentsCache: {},
  prRefreshSequences: {},
  prRefreshStates: {},
  prVisibleRefreshGeneration: 0,
  workItemsCache: {},

  ...createGitHubCheckActions(set, get),
  ...createGitHubCommentActions(set, get),
  ...createGitHubPRActions(set, get),
  ...createGitHubRefreshEventActions(set, get),
  ...createGitHubRefreshQueueActions(set, get),
  ...createGitHubRefreshTriggerActions(set, get),
  ...createGitHubWorkItemActions(set, get),

  getEffectiveGitHubPRRefreshState: (cacheKey, now) =>
    getEffectiveGitHubPRRefreshState(get().prRefreshStates, cacheKey, now),

  expireGitHubPRRefreshState: (cacheKey, token, now = Date.now()) => {
    const currentState = get()
    const currentRefreshState = currentState.prRefreshStates[cacheKey]
    if (
      !currentRefreshState ||
      !ACTIVE_PR_REFRESH_STATUSES.has(currentRefreshState.status) ||
      !isExpiredActivePRRefreshState(currentRefreshState, now) ||
      (currentState.prRefreshSequences[cacheKey] ?? 0) !== token.sequence ||
      currentRefreshState.status !== token.status ||
      currentRefreshState.updatedAt !== token.updatedAt
    ) {
      return
    }
    set((s) => {
      const state = s.prRefreshStates[cacheKey]
      if (
        !state ||
        !ACTIVE_PR_REFRESH_STATUSES.has(state.status) ||
        !isExpiredActivePRRefreshState(state, now) ||
        (s.prRefreshSequences[cacheKey] ?? 0) !== token.sequence ||
        state.status !== token.status ||
        state.updatedAt !== token.updatedAt
      ) {
        return s
      }
      const nextStates = { ...s.prRefreshStates }
      delete nextStates[cacheKey]
      return { prRefreshStates: nextStates }
    })
  },

  initGitHubCache: async () => {
    try {
      const persisted = await shellClient.cache.getGitHub()
      if (persisted) {
        set({
          prCache: evictStaleEntries(persisted.pr || {})
        })
      }
    } catch (err) {
      console.error('Failed to load GitHub cache from disk:', err)
    }
  }
})

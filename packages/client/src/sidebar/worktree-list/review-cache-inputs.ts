import type { WorktreeCardProperty } from '@agentstart/protocol/settings/ui-state'
import type { AppState } from '~renderer/store/types'

import type { WorktreeGroupBy } from './groups'

export type WorktreeListReviewCacheState = Pick<
  AppState,
  'folderWorkspaces' | 'hostedReviewCache' | 'prCache'
>

export type WorktreeListReviewCacheInputs = {
  prCache: AppState['prCache'] | null
  hostedReviewCache: AppState['hostedReviewCache'] | null
}

const EMPTY_WORKTREE_LIST_REVIEW_CACHE_INPUTS: WorktreeListReviewCacheInputs = Object.freeze({
  prCache: null,
  hostedReviewCache: null
})

export function selectWorktreeListReviewCacheInputs(
  state: WorktreeListReviewCacheState,
  groupBy: WorktreeGroupBy,
  cardProperties: readonly WorktreeCardProperty[]
): WorktreeListReviewCacheInputs {
  const folderCardsNeedReview =
    state.folderWorkspaces.length > 0 && cardProperties.includes('status')
  const needsPrCache = groupBy === 'pr-status' || folderCardsNeedReview
  const needsHostedReviewCache = folderCardsNeedReview

  // Why: ordinary git worktree cards own entry-level subscriptions. The list
  // needs whole caches only for PR grouping or synthetic folder-card displays.
  if (!needsPrCache && !needsHostedReviewCache) {
    return EMPTY_WORKTREE_LIST_REVIEW_CACHE_INPUTS
  }
  return {
    prCache: needsPrCache ? state.prCache : null,
    hostedReviewCache: needsHostedReviewCache ? state.hostedReviewCache : null
  }
}

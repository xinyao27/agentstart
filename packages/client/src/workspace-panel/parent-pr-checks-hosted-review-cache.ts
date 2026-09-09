import type { PRInfo } from '@yiru/protocol/hosted-review/pull-request-types'
import type { HostedReviewInfo } from '@yiru/protocol/hosted-review/types'
import type { Worktree } from '@yiru/protocol/worktree/model'

import {
  getWorktreeCardPrDisplay,
  isCachedMergedBranchPRCurrentForWorktree
} from '../sidebar/worktree-card/pr-display'
import type { ParentPrChecksCacheEntry } from './parent-pr-checks-row-types'

export function canUseParentPrChecksHostedReviewCacheEntry(
  worktree: Worktree,
  review: HostedReviewInfo,
  entry: ParentPrChecksCacheEntry<HostedReviewInfo>
): boolean {
  if (review.state === 'merged' && !mergedReviewMatchesHead(review, worktree)) {
    return false
  }
  const linkedReviewNumber = getLinkedReviewNumberForProvider(worktree, review.provider)
  if (hasLinkedReview(worktree)) {
    return linkedReviewNumber === review.number
  }
  if ((entry.linkedReviewHintKey ?? '') !== '') {
    return false
  }
  const display = getWorktreeCardPrDisplay(review, worktree.linkedPR, {
    reviewHintKey: entry.linkedReviewHintKey
  })
  return display?.provider === review.provider && display.number === review.number
}

function mergedReviewMatchesHead(review: HostedReviewInfo, worktree: Worktree): boolean {
  return isCachedMergedBranchPRCurrentForWorktree(
    {
      number: review.number,
      title: review.title,
      state: review.state,
      url: review.url,
      checksStatus: review.status,
      updatedAt: review.updatedAt,
      mergeable: review.mergeable,
      ...(review.headSha ? { headSha: review.headSha } : {}),
      ...(review.confirmedContainedHeadOid
        ? { confirmedContainedHeadOid: review.confirmedContainedHeadOid }
        : {})
    } satisfies PRInfo,
    worktree
  )
}

function getLinkedReviewNumberForProvider(
  worktree: Worktree,
  provider: HostedReviewInfo['provider']
): number | null {
  return provider === 'github' ? worktree.linkedPR : null
}

function hasLinkedReview(worktree: Worktree): boolean {
  return worktree.linkedPR != null
}

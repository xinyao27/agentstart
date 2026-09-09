import type { PRInfo } from '@yiru/protocol/hosted-review/pull-request-types'
import type { HostedReviewInfo } from '@yiru/protocol/hosted-review/types'
import type { Worktree } from '@yiru/protocol/worktree/model'

type LinkedReviewMetadataProvider = Exclude<HostedReviewInfo['provider'], 'unsupported'>

export function isCachedMergedBranchPRCurrentForWorktree(
  cachedPR: PRInfo | null | undefined,
  worktree: Pick<Worktree, 'head'>
): boolean {
  return (
    cachedPR?.state === 'merged' &&
    typeof cachedPR.headSha === 'string' &&
    cachedPR.headSha.length > 0 &&
    typeof worktree.head === 'string' &&
    worktree.head.length > 0 &&
    // Why: a worktree behind its own merged PR (update-branch/web commits) is
    // still that PR's line of work; match the main-process visibility rule.
    (cachedPR.headSha === worktree.head || cachedPR.confirmedContainedHeadOid === worktree.head)
  )
}

type LinkedReviewNumbers = {
  linkedPR: number | null
}

export type WorktreeCardPrDisplay =
  | HostedReviewInfo
  | {
      provider: LinkedReviewMetadataProvider
      number: number
      title: string
      state?: HostedReviewInfo['state']
      url?: string
      status?: HostedReviewInfo['status']
    }

type WorktreeCardPrDisplayOptions = {
  reviewHintKey?: string
}

function getLinkedReviewNumber(links: LinkedReviewNumbers): number | null {
  return links.linkedPR
}

function makeLinkedReviewFallback(
  provider: LinkedReviewMetadataProvider,
  number: number,
  review: HostedReviewInfo | null | undefined
): WorktreeCardPrDisplay {
  return {
    provider,
    number,
    // Why: linked review metadata is persisted before provider details are cached.
    // Keep the row visible on cold first render while the lookup catches up.
    title: review === null ? 'PR details unavailable' : 'Loading PR...'
  }
}

export function getWorktreeCardPrDisplay(
  review: HostedReviewInfo | null | undefined,
  linkedPR: number | null,
  options: WorktreeCardPrDisplayOptions = {}
): WorktreeCardPrDisplay | null {
  const links = { linkedPR }
  if (review) {
    if (review.provider === 'unsupported') {
      return review
    }
    const linkedReviewNumber = getLinkedReviewNumber(links)
    if (linkedReviewNumber === null) {
      // Why: GitHub linked lookups can outlive the worktree metadata
      // that requested them. A neutral branch lookup is safe to show unlinked.
      return options.reviewHintKey === '' ? review : null
    }
    if (review.number === linkedReviewNumber) {
      return review
    }
    return makeLinkedReviewFallback(review.provider, linkedReviewNumber, undefined)
  }

  if (linkedPR !== null) {
    return makeLinkedReviewFallback('github', linkedPR, review)
  }

  return null
}

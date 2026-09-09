import { LOCAL_EXECUTION_HOST_ID, normalizeExecutionHostId } from '@yiru/protocol/host/identity'
import type { PRInfo } from '@yiru/protocol/hosted-review/pull-request-types'
import type { HostedReviewInfo } from '@yiru/protocol/hosted-review/types'
import type { Repo } from '@yiru/protocol/project/repository'
import type { Worktree } from '@yiru/protocol/worktree/model'
import { getGitHubPRCacheKey, getLegacyGitHubPRCacheKey } from '~renderer/github/cache-key'
import type { AppState } from '~renderer/store/types'

import { isCachedMergedBranchPRCurrentForWorktree } from '../sidebar/worktree-card/pr-display'
import type { ParentPrChecksCacheEntry } from './parent-pr-checks-row-types'

export function canUseParentPrChecksGitHubPRCacheEntry(
  worktree: Worktree,
  prEntry: ParentPrChecksCacheEntry<PRInfo> | undefined,
  hostedReviewEntry: ParentPrChecksCacheEntry<HostedReviewInfo> | undefined
): prEntry is ParentPrChecksCacheEntry<PRInfo> & {
  data: NonNullable<ParentPrChecksCacheEntry<PRInfo>['data']>
} {
  const pr = prEntry?.data
  if (!pr) {
    return false
  }
  const prFetchedAt = prEntry.fetchedAt
  const hasLinkedGitHubPR = worktree.linkedPR !== null
  if (hasLinkedGitHubPR && pr.number !== worktree.linkedPR) {
    return false
  }
  const mergedPrMatchesCurrentHead = isCachedMergedBranchPRCurrentForWorktree(pr, worktree)
  if (pr.state === 'merged' && !mergedPrMatchesCurrentHead) {
    return false
  }
  // Why: a newer hosted-review miss should suppress older branch PR cache unless
  // a merged PR is proven to still describe the checked-out worktree head.
  if (
    hostedReviewEntry?.data === null &&
    !mergedPrMatchesCurrentHead &&
    prFetchedAt <= hostedReviewEntry.fetchedAt
  ) {
    return false
  }
  return true
}

export function getParentPrChecksGitHubPRCacheEntry({
  prCache,
  repo,
  branch,
  settings
}: {
  prCache: Record<string, ParentPrChecksCacheEntry<PRInfo>>
  repo: Repo
  branch: string
  settings: AppState['settings']
}): ParentPrChecksCacheEntry<PRInfo> | undefined {
  const currentKey = getGitHubPRCacheKey(
    repo.path,
    repo.id,
    branch,
    settings,
    repo.executionHostId,
    true
  )
  const executionHostId = normalizeExecutionHostId(repo.executionHostId)
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — only executionHostId can still make a repo non-local.
  const canUseLegacyPRCache = !executionHostId || executionHostId === LOCAL_EXECUTION_HOST_ID
  const legacyRepoKey = canUseLegacyPRCache
    ? getLegacyGitHubPRCacheKey(repo.path, repo.id, branch)
    : ''
  const legacyPathKey = canUseLegacyPRCache
    ? getLegacyGitHubPRCacheKey(repo.path, undefined, branch)
    : ''
  return (
    prCache[currentKey] ??
    (legacyRepoKey ? prCache[legacyRepoKey] : undefined) ??
    (legacyPathKey ? prCache[legacyPathKey] : undefined)
  )
}

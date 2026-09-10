import {
  getRepoExecutionHostId,
  normalizeExecutionHostId
} from '@agentstart/protocol/host/identity'
import type { GitHubPRRefreshCandidate } from '@agentstart/protocol/hosted-review/pull-request-types'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import { getHostedReviewCacheKey } from '~renderer/source-control/hosted-review-state/cache-identity'
import { isMacAppDataPath } from '~renderer/source-control/macos-data-access'
import type { AppState } from '~renderer/store/types'

import { prCacheKey } from './cache-policy'
import { settingsForGitHubRepoOwner } from './repo-owner'
import type { GitHubPRFallbackSource } from './store-contract'

export function githubHostedReviewFallbackPRNumber(
  state: AppState,
  repoPath: string,
  repoId: string | undefined,
  branch: string,
  executionHostId?: string | null,
  hasRepoOwner = false
): number | null {
  const cacheKey = getHostedReviewCacheKey(
    repoPath,
    branch,
    state.settings,
    repoId,
    executionHostId,
    hasRepoOwner
  )
  const hostedReview = state.hostedReviewCache[cacheKey]?.data
  return hostedReview?.provider === 'github' ? hostedReview.number : null
}

export function buildPRRefreshCandidate(
  state: AppState,
  worktree: Worktree,
  repoPath?: string,
  repoOwner?: Repo
): GitHubPRRefreshCandidate | null {
  const worktreeHostId = normalizeExecutionHostId(worktree.hostId)
  const matchingRepos = state.repos.filter(
    (repo) =>
      repo.id === worktree.repoId &&
      (!worktreeHostId || getRepoExecutionHostId(repo) === worktreeHostId)
  )
  const repo = repoOwner ?? (matchingRepos.length === 1 ? matchingRepos[0] : undefined)
  if (!repo || isMacAppDataPath(repoPath ?? repo.path)) {
    return null
  }
  const branch = worktree.branch.replace(/^refs\/heads\//, '')
  const cacheKey = prCacheKey(
    repoPath ?? repo.path,
    repo.id,
    branch,
    settingsForGitHubRepoOwner(state.settings, repo),
    repo.executionHostId,
    true
  )
  const cachedPR = state.prCache[cacheKey]?.data ?? null
  const hostedReviewFallbackPRNumber = githubHostedReviewFallbackPRNumber(
    state,
    repoPath ?? repo.path,
    repo.id,
    branch,
    repo.executionHostId,
    true
  )
  const cachedFallbackPRNumber = cachedPR?.number ?? null
  const cachedMergedPRMovedPastHead =
    worktree.linkedPR == null &&
    cachedPR?.state === 'merged' &&
    cachedPR.headSha !== worktree.head &&
    cachedPR.confirmedContainedHeadOid !== worktree.head
  const fallbackPRNumber =
    worktree.linkedPR == null && !cachedMergedPRMovedPastHead
      ? (cachedFallbackPRNumber ?? hostedReviewFallbackPRNumber)
      : null
  const fallbackPRSource: GitHubPRFallbackSource | null =
    worktree.linkedPR != null || fallbackPRNumber == null
      ? null
      : cachedFallbackPRNumber != null
        ? 'pr-cache'
        : 'hosted-review'
  return {
    repoId: repo.id,
    repoPath: repoPath ?? repo.path,
    repoKind: repo.kind ?? 'git',
    branch,
    cacheKey,
    worktreeId: worktree.id,
    currentHeadOid: worktree.head ?? null,
    linkedPRNumber: worktree.linkedPR ?? null,
    fallbackPRNumber,
    fallbackPRSource,
    isBare: worktree.isBare,
    isArchived: worktree.isArchived,
    connectionId: null,
    executionHostId: repo.executionHostId ?? null,
    connectionState: 'unknown',
    cachedFetchedAt: state.prCache[cacheKey]?.fetchedAt ?? null,
    cachedHasPR: cachedPR ? true : state.prCache[cacheKey] ? false : null,
    cachedPRState: cachedPR?.state ?? null,
    cachedChecksStatus: cachedPR?.checksStatus ?? null,
    cachedMergeable: cachedPR?.mergeable ?? null,
    cachedMergeStateStatus: cachedPR?.mergeStateStatus ?? null
  }
}

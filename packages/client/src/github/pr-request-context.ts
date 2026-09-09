import {
  LOCAL_EXECUTION_HOST_ID,
  getRepoExecutionHostId,
  normalizeExecutionHostId
} from '@yiru/protocol/host/identity'
import { getHostedReviewCacheKey } from '~renderer/source-control/hosted-review-state/cache-identity'
import type { AppState } from '~renderer/store/types'

import { isFresh, prCacheKey } from './cache-policy'
import { prLookupHintKey } from './hosted-review-sync'
import { githubHostedReviewFallbackPRNumber } from './refresh-candidate'
import { settingsForGitHubRepoOwner } from './repo-owner'
import type { GitHubPRFallbackSource, GitHubSlice } from './store-contract'

type GitHubPRFetchOptions = Parameters<GitHubSlice['fetchPRForBranch']>[2]

export function resolveGitHubPRRequestContext(
  state: AppState,
  repoPath: string,
  branch: string,
  options: GitHubPRFetchOptions
) {
  const repoCandidates = (state.repos ?? []).filter((candidate) =>
    options?.repoId ? candidate.id === options.repoId : candidate.path === repoPath
  )
  const expectedHostId = options?.executionHostId
    ? (normalizeExecutionHostId(options.executionHostId) ?? LOCAL_EXECUTION_HOST_ID)
    : undefined
  const scopedRepoCandidates = expectedHostId
    ? repoCandidates.filter(
        (candidate) =>
          candidate.path === repoPath && getRepoExecutionHostId(candidate) === expectedHostId
      )
    : repoCandidates
  const repo = expectedHostId
    ? scopedRepoCandidates.length === 1
      ? scopedRepoCandidates[0]
      : undefined
    : repoCandidates[0]
  if (expectedHostId && !repo) {
    return null
  }

  const repoId = options?.repoId ?? repo?.id
  const requestSettings = settingsForGitHubRepoOwner(state.settings, repo)
  const cacheKey = prCacheKey(
    repoPath,
    repoId,
    branch,
    requestSettings,
    repo?.executionHostId,
    repo !== undefined
  )
  const cached = state.prCache[cacheKey]
  const hostedReviewCacheKey = getHostedReviewCacheKey(
    repoPath,
    branch,
    requestSettings,
    repoId,
    repo?.executionHostId,
    repo !== undefined
  )
  const linkedPRNumber = options?.linkedPRNumber ?? null
  const explicitFallbackPRNumber = options?.fallbackPRNumber ?? null
  const hostedReviewFallbackPRNumber = githubHostedReviewFallbackPRNumber(
    state,
    repoPath,
    repoId,
    branch,
    repo?.executionHostId,
    repo !== undefined
  )
  const fallbackPRNumber =
    linkedPRNumber == null ? (explicitFallbackPRNumber ?? hostedReviewFallbackPRNumber) : null
  const fallbackPRSource: GitHubPRFallbackSource | null =
    linkedPRNumber != null || fallbackPRNumber == null
      ? null
      : (options?.fallbackPRSource ??
        (explicitFallbackPRNumber != null ? 'explicit' : 'hosted-review'))
  const linkedRefetch =
    cached?.data === null && (linkedPRNumber !== null || fallbackPRNumber !== null)

  return {
    repo,
    repoId,
    requestSettings,
    cacheKey,
    cached,
    hostedReviewCacheKey,
    linkedPRNumber,
    fallbackPRNumber,
    fallbackPRSource,
    lookupHintKey: prLookupHintKey(linkedPRNumber, fallbackPRNumber),
    canUseCache: !options?.force && !linkedRefetch && isFresh(cached),
    linkedRefetch
  }
}

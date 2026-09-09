import type { GitHubPRRefreshAlias, PRInfo } from '@yiru/protocol/hosted-review/pull-request-types'
import type { AppState } from '~renderer/store/types'

import { getPRChecksCacheTtl, prChecksCacheSuffix, runtimeScopedRepoCacheKey } from './cache-policy'
import { deriveCheckStatusFromChecks } from './checks'

export function mergeCachedCheckStatus(
  state: AppState,
  alias: GitHubPRRefreshAlias,
  executionHostId: string,
  pr: PRInfo,
  fetchedAt: number
): PRInfo {
  const checksCacheKeys = [
    ...(alias.repoId
      ? [
          ...(pr.headSha
            ? [
                runtimeScopedRepoCacheKey(
                  alias.repoPath,
                  alias.repoId,
                  prChecksCacheSuffix(pr.number, pr.prRepo, pr.headSha),
                  state.settings,
                  executionHostId,
                  true
                )
              ]
            : []),
          runtimeScopedRepoCacheKey(
            alias.repoPath,
            alias.repoId,
            prChecksCacheSuffix(pr.number, pr.prRepo),
            state.settings,
            executionHostId,
            true
          )
        ]
      : []),
    ...(pr.headSha
      ? [
          runtimeScopedRepoCacheKey(
            alias.repoPath,
            undefined,
            prChecksCacheSuffix(pr.number, pr.prRepo, pr.headSha),
            state.settings,
            executionHostId,
            true
          )
        ]
      : []),
    runtimeScopedRepoCacheKey(
      alias.repoPath,
      undefined,
      prChecksCacheSuffix(pr.number, pr.prRepo),
      state.settings,
      executionHostId,
      true
    ),
    `${alias.repoPath}::pr-checks::${pr.number}`
  ]
  const checksEntry = checksCacheKeys
    .map((key) => state.checksCache[key])
    .find((entry) => entry?.data)
  if (
    checksEntry?.data &&
    checksEntry.headSha &&
    pr.headSha &&
    checksEntry.headSha === pr.headSha &&
    fetchedAt - checksEntry.fetchedAt < getPRChecksCacheTtl(checksEntry)
  ) {
    return { ...pr, checksStatus: deriveCheckStatusFromChecks(checksEntry.data) }
  }
  return pr
}

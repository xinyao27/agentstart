import type { GitHubOwnerRepo } from '@agentstart/protocol/hosted-review/review-types'
import type { ProjectSourceContext } from '@agentstart/protocol/project/source-context'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import type { AppState } from '~renderer/store/types'

import { prCommentsCacheSuffix, sourceScopedRepoCacheKey } from './cache-policy'
import {
  getGitHubRepoSourceSettings,
  getGitHubWorkItemRequestContext,
  githubRuntimeRequest
} from './work-items-request'

type GitHubCommentRequestOptions = {
  repoId?: string
  sourceContext?: ProjectSourceContext | null
  prRepo?: GitHubOwnerRepo | null
}

export function resolveGitHubCommentRequest(
  state: AppState,
  repoPath: string,
  prNumber: number,
  options?: GitHubCommentRequestOptions
): { cacheKey: string; target: RuntimeClientTarget; repo: string } {
  const repo = state.repos?.find((candidate) =>
    options?.repoId ? candidate.id === options.repoId : candidate.path === repoPath
  )
  const repoId = options?.repoId ?? repo?.id
  const requestSettings = getGitHubRepoSourceSettings(state.settings, repo, options?.sourceContext)
  const cacheKey = sourceScopedRepoCacheKey(
    repoPath,
    repoId,
    prCommentsCacheSuffix(prNumber, options?.prRepo),
    requestSettings,
    repo?.executionHostId,
    options?.sourceContext,
    repo !== undefined
  )
  const requestContext = getGitHubWorkItemRequestContext(
    state,
    requestSettings,
    repoId ?? repoPath,
    repoPath,
    options?.sourceContext
  )
  return { cacheKey, ...githubRuntimeRequest(requestContext) }
}

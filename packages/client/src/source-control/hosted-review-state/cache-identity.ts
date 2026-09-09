import {
  getSettingsFocusedExecutionHostId,
  normalizeExecutionHostId
} from '@yiru/protocol/host/identity'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'

export type LinkedReviewHints = {
  linkedGitHubPR?: number | null
  fallbackGitHubPR?: number | null
}

export function getHostedReviewCacheKey(
  repoPath: string,
  branch: string,
  settings?: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null,
  repoId?: string | null,
  executionHostId?: string | null,
  hasRepoOwner = false
): string {
  const scope = getHostedReviewCacheHostScope(settings, executionHostId, hasRepoOwner)
  return `${scope}::${repoId ?? repoPath}::${branch}`
}

function getHostedReviewCacheHostScope(
  settings?: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null,
  executionHostId?: string | null,
  hasRepoOwner = false
): string {
  const hostId = normalizeExecutionHostId(executionHostId)
  if (hostId) {
    return hostId
  }
  // Why: a known repo owner with no runtime marker is local; absent owner
  // context keeps the focused-runtime fallback for active-host operations.
  if (hasRepoOwner) {
    return 'local'
  }
  return getSettingsFocusedExecutionHostId(settings)
}

// Why: a branch-keyed lookup can describe a different PR than the persisted
// linked review number. Track that distinction without changing the cache key.
export function linkedReviewHintKey(options?: LinkedReviewHints): string {
  const number = options?.linkedGitHubPR ?? options?.fallbackGitHubPR ?? null
  return number === null ? '' : `github:${number}`
}

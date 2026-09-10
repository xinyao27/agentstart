import type { GitHubRateLimitBucket as ProtocolRateLimitBucket } from '../../generated/agent_start/runtime/v1/github_pb.js'

type GitHubRateLimitBucket = { remaining: number; limit: number; resetAt: number }
type GitHubRateLimitSnapshot = {
  core: GitHubRateLimitBucket
  search: GitHubRateLimitBucket
  graphql: GitHubRateLimitBucket
  fetchedAt: number
}
export type GetRateLimitResult =
  | { ok: true; snapshot: GitHubRateLimitSnapshot }
  | { ok: false; error: string }

function bucket(value: ProtocolRateLimitBucket | undefined): GitHubRateLimitBucket {
  return {
    remaining: value ? Number(value.remaining) : 0,
    limit: value ? Number(value.limit) : 0,
    resetAt: value ? Number(value.resetAt) : 0
  }
}

export function githubRateLimit(response: {
  ok: boolean
  error?: string
  snapshot?: {
    core?: ProtocolRateLimitBucket
    search?: ProtocolRateLimitBucket
    graphql?: ProtocolRateLimitBucket
    fetchedAtMs: number
  }
}): GetRateLimitResult {
  if (!response.ok || !response.snapshot) {
    return { ok: false, error: response.error || 'GitHub rate limit is unavailable' }
  }
  return {
    ok: true,
    snapshot: {
      core: bucket(response.snapshot.core),
      search: bucket(response.snapshot.search),
      graphql: bucket(response.snapshot.graphql),
      fetchedAt: Math.round(response.snapshot.fetchedAtMs)
    }
  }
}

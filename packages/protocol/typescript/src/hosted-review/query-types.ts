import type { GitHubOwnerRepo } from './review-types'

export type GitHubRateLimitBucket = {
  remaining: number
  limit: number
  /** Unix epoch seconds when the window resets. */
  resetAt: number
}

export type GitHubRateLimitSnapshot = {
  core: GitHubRateLimitBucket
  search: GitHubRateLimitBucket
  graphql: GitHubRateLimitBucket
  /** Unix epoch ms the snapshot was produced (for "fetched Xs ago" copy). */
  fetchedAt: number
}

export type GetRateLimitResult =
  | { ok: true; snapshot: GitHubRateLimitSnapshot }
  | { ok: false; error: string }

export type ListWorkItemsResult<T> = {
  items: T[]
  source: GitHubOwnerRepo | null
}

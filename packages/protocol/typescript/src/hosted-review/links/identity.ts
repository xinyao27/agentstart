import { parseGitHubPullRequestLink } from './pull-request'

export type GitHubWorkItemIdentity = {
  type: 'pr'
  number: number
}

export function resolveGitHubWorkItemIdentity(item: {
  type: 'pr'
  number: number
  url?: string | null
}): GitHubWorkItemIdentity {
  const link = item.url ? parseGitHubPullRequestLink(item.url) : null
  return { type: 'pr', number: link?.number ?? item.number }
}

import { parseGitHubPullRequestLink, parseGitHubPullRequestNumber } from './pull-request'

const GITHUB_PR_URL_IN_TEXT_RE = /https?:\/\/[^\s/]+\/[^\s/]+\/[^\s/]+\/pull\/\d+[^\s]*/i
const TRAILING_URL_PUNCTUATION_RE = /[),.;:!?]+$/

function hasGitHubPullRequestLookup(value: string): boolean {
  if (parseGitHubPullRequestNumber(value) !== null || parseGitHubPullRequestLink(value) !== null) {
    return true
  }
  const embedded = GITHUB_PR_URL_IN_TEXT_RE.exec(value)?.[0]
  return embedded
    ? parseGitHubPullRequestLink(embedded.replace(TRAILING_URL_PUNCTUATION_RE, '')) !== null
    : false
}

/** Review references may be replaced by an auto-name; deliberate names may not. */
export function isWorkItemLookupText(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length > 0 && hasGitHubPullRequestLookup(trimmed)
}

// Why shared: main and renderer both detect pull-request links from terminal and composer input.
const GITHUB_PULL_REQUEST_PATH_RE = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/i

export type RepoSlug = {
  owner: string
  repo: string
}

export type GitHubPullRequestLink = {
  slug: RepoSlug
  number: number
  type: 'pr'
}

export function buildGitHubRepoUrl(slug: RepoSlug | null | undefined): string | null {
  if (!slug?.owner || !slug.repo) {
    return null
  }
  return `https://github.com/${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.repo)}`
}

function parsePositiveNumber(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  return parsed > 0 ? parsed : null
}

export function parseGitHubPullRequestNumber(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const numeric = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
  if (/^\d+$/.test(numeric)) {
    return parsePositiveNumber(numeric)
  }
  return parseGitHubPullRequestLink(trimmed)?.number ?? null
}

export function parseGitHubPullRequestLink(input: string): GitHubPullRequestLink | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null
  }

  const match = GITHUB_PULL_REQUEST_PATH_RE.exec(url.pathname.replace(/\/+$/, ''))
  const number = match ? parsePositiveNumber(match[3]) : null
  if (!match || number === null) {
    return null
  }

  return {
    slug: { owner: match[1], repo: match[2] },
    type: 'pr',
    number
  }
}

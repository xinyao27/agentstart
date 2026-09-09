export type ForgePageIdentity = {
  canonicalKey: string
  kind: 'issue' | 'pull-request'
  number: number
  title: string
  url: string
}

export type LocalPageIdentity = {
  port: number
  title: string
  url: string
}

export function identifyForgePage(rawUrl: string): ForgePageIdentity | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') {
    return null
  }
  const segments = url.pathname.split('/').filter(Boolean)
  if (url.hostname.toLowerCase() !== 'github.com') {
    return null
  }
  return identifyGitHubPage(url, segments)
}

export function identifyLocalPage(rawUrl: string): LocalPageIdentity | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  ) {
    return null
  }
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    return null
  }
  return { port, title: `${url.hostname}:${port}`, url: url.href }
}

function identifyGitHubPage(url: URL, segments: string[]): ForgePageIdentity | null {
  if (segments.length !== 4) {
    return null
  }
  const [owner, repo, route, numberText] = segments
  const kind = route === 'pull' ? 'pull-request' : route === 'issues' ? 'issue' : null
  return createIdentity(url, owner, repo, kind, numberText)
}

function createIdentity(
  url: URL,
  owner: string,
  repo: string,
  kind: ForgePageIdentity['kind'] | null,
  numberText: string
): ForgePageIdentity | null {
  if (!owner || !repo || !kind || !/^\d+$/.test(numberText)) {
    return null
  }
  const number = Number(numberText)
  if (!Number.isSafeInteger(number) || number < 1) {
    return null
  }
  return {
    canonicalKey: `${url.hostname.toLowerCase()}/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    kind,
    number,
    title: `${owner}/${repo} #${number}`,
    url: url.href
  }
}

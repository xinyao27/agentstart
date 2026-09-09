const LOOPBACK_LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '::'])

function normalizeLocalhostHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

// Why: only http(s) loopback URLs with an explicit port can be attributed to a
// scanned workspace port and labeled; everything else stays as-is.
export function parseLoopbackUrlWithPort(rawUrl: string): URL | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null
  }
  if (!url.port || !LOOPBACK_LOCALHOST_HOSTS.has(normalizeLocalhostHostname(url.hostname))) {
    return null
  }
  return url
}

export type LocalhostWorktreeLabelRoute = {
  targetUrl: string
  projectName: string
  worktreeName: string
  worktreePath?: string | null
  repoId?: string | null
  worktreeId?: string | null
}

export type LocalhostWorktreeLabelResult = {
  url: string
  label: string
}

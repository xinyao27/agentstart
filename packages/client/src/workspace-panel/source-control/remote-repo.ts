import type { HostedReviewProvider } from '@agentstart/protocol/hosted-review/types'

export type ManualReviewProvider = Exclude<HostedReviewProvider, 'unsupported'>

export type RemoteRepoRef = {
  provider: ManualReviewProvider | null
  webBaseUrl: string
  path: string
}

export type ParsedUpstream = { remoteName: string; branchName: string }

export function parseUpstream(name: string | null | undefined): ParsedUpstream | null {
  const trimmed = name?.trim()
  if (!trimmed) {
    return null
  }
  const slash = trimmed.indexOf('/')
  if (slash <= 0 || slash === trimmed.length - 1) {
    return null
  }
  return { remoteName: trimmed.slice(0, slash), branchName: trimmed.slice(slash + 1) }
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function cleanPath(path: string): string | null {
  const parts = path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(decodeSegment)
  return parts.length >= 2 ? parts.join('/') : null
}

function providerForHost(host: string): ManualReviewProvider | null {
  const normalized = host.toLowerCase()
  if (normalized === 'github.com' || normalized === 'ssh.github.com') {
    return 'github'
  }
  return null
}

export function normalizeProvider(
  provider: HostedReviewProvider | null | undefined
): ManualReviewProvider | null {
  return provider && provider !== 'unsupported' ? provider : null
}

function buildWebOrigin(protocol: string, host: string, hostname: string): string {
  return protocol === 'http:' || protocol === 'https:'
    ? `${protocol}//${host}`
    : `https://${hostname}`
}

export function parseRemoteRepo(
  remoteUrl: string,
  providerHint?: HostedReviewProvider | null
): RemoteRepoRef | null {
  const trimmed = remoteUrl.trim().replace(/^git\+/, '')
  if (!trimmed || /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith('/')) {
    return null
  }

  const scpLike = !trimmed.includes('://')
    ? trimmed.match(/^(?:[^@/:]+@)?([^:\s/]+):([^\s]+?)(?:\.git)?$/)
    : null
  if (scpLike) {
    const host = scpLike[1].toLowerCase()
    const path = cleanPath(scpLike[2])
    if (!path) {
      return null
    }
    const hintedProvider = normalizeProvider(providerHint)
    return {
      provider: hintedProvider ?? providerForHost(host) ?? null,
      path,
      webBaseUrl: `https://${host}/${encodePath(path)}`
    }
  }

  try {
    const url = new URL(trimmed)
    const protocol = url.protocol.toLowerCase()
    if (!['git:', 'http:', 'https:', 'ssh:'].includes(protocol)) {
      return null
    }
    const path = cleanPath(url.pathname)
    if (!path) {
      return null
    }
    const host = url.hostname.toLowerCase()
    const hintedProvider = normalizeProvider(providerHint)
    const inferredProvider = providerForHost(host)
    const provider = hintedProvider ?? inferredProvider
    const webOrigin =
      host === 'ssh.github.com'
        ? 'https://github.com'
        : buildWebOrigin(protocol, url.host, url.hostname).replace(/\/+$/, '')
    return {
      provider,
      path,
      webBaseUrl: `${webOrigin}/${encodePath(path)}`
    }
  } catch {
    return null
  }
}

export function branchFromRef(
  ref: string | null | undefined,
  remoteName?: string | null
): string | null {
  const trimmed = ref?.trim()
  if (!trimmed) {
    return null
  }
  const prefixes = remoteName
    ? [`refs/remotes/${remoteName}/`, `remotes/${remoteName}/`, `${remoteName}/`]
    : ['refs/heads/']
  for (const prefix of prefixes) {
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length) || null
    }
  }
  if (trimmed.startsWith('refs/remotes/')) {
    const remoteAndBranch = trimmed.slice('refs/remotes/'.length)
    const slashIndex = remoteAndBranch.indexOf('/')
    return slashIndex > 0 ? remoteAndBranch.slice(slashIndex + 1) : null
  }
  if (trimmed.startsWith('remotes/')) {
    const remoteAndBranch = trimmed.slice('remotes/'.length)
    const slashIndex = remoteAndBranch.indexOf('/')
    return slashIndex > 0 ? remoteAndBranch.slice(slashIndex + 1) : null
  }
  if (trimmed.startsWith('refs/heads/')) {
    return trimmed.slice('refs/heads/'.length) || null
  }
  return trimmed
}

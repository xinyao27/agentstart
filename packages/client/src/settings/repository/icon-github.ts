import type { GitHubRepositoryIdentity } from '@yiru/protocol/hosted-review/pull-request-types'
import { githubAvatarIcon, type RepoIcon } from '@yiru/protocol/project/icon'
import type { Repo } from '@yiru/protocol/project/repository'
import { runtimeCallDestination } from '~renderer/runtime/github-runtime-destination'
import { openGitHubTarget } from '~renderer/runtime/github-target'
import type { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

type RuntimeTarget = ReturnType<typeof getActiveRuntimeTarget>
type ResolveRepositoryGitHubAvatarOptions = {
  forceLive?: boolean
}

export type RepositoryGitHubAvatarResolution = {
  repoIcon: RepoIcon | null
  upstream: GitHubRepositoryIdentity | null
}

// Why: `runtime:` hosts are the only non-local execution host (SSH was removed
// from the product), so one runtime call serves both — no local/environment
// fork is needed.
async function resolveRepositoryIdentityLive(
  runtimeTarget: RuntimeTarget,
  repo: Repo,
  method: 'github.repoUpstream' | 'github.repoSlug'
): Promise<GitHubRepositoryIdentity | null> {
  const client = await openGitHubTarget()
  if (!client) {
    throw new Error('GitHub protocol capability is unavailable')
  }
  const options = { timeoutMs: 30_000, ...runtimeCallDestination(runtimeTarget) }
  return method === 'github.repoUpstream'
    ? client.getRepoUpstream(repo.id, options)
    : client.getRepoSlug(repo.id, options)
}

export function resolveRepositoryUpstreamLive(
  runtimeTarget: RuntimeTarget,
  repo: Repo
): Promise<GitHubRepositoryIdentity | null> {
  return resolveRepositoryIdentityLive(runtimeTarget, repo, 'github.repoUpstream')
}

function resolveRepositorySlugLive(
  runtimeTarget: RuntimeTarget,
  repo: Repo
): Promise<GitHubRepositoryIdentity | null> {
  return resolveRepositoryIdentityLive(runtimeTarget, repo, 'github.repoSlug')
}

export async function resolveRepositoryGitHubAvatar(
  runtimeTarget: RuntimeTarget,
  repo: Repo,
  options: ResolveRepositoryGitHubAvatarOptions = {}
): Promise<RepositoryGitHubAvatarResolution> {
  const upstream =
    !options.forceLive && repo.upstream !== undefined
      ? repo.upstream
      : await resolveRepositoryUpstreamLive(runtimeTarget, repo).catch(() => null)
  if (upstream) {
    return { repoIcon: githubAvatarIcon(upstream), upstream }
  }
  // Why: a null live upstream is ambiguous (offline/unauthed vs. not-a-fork). Keep
  // the last-known parent avatar so a transient failure can't clobber fork identity.
  if (repo.upstream) {
    return { repoIcon: githubAvatarIcon(repo.upstream), upstream: repo.upstream }
  }
  const slug = await resolveRepositorySlugLive(runtimeTarget, repo)
  return { repoIcon: slug ? githubAvatarIcon(slug) : null, upstream: null }
}

function sameRepositoryIdentity(
  a: GitHubRepositoryIdentity | null | undefined,
  b: GitHubRepositoryIdentity | null | undefined
): boolean {
  if (!a || !b) {
    return a === b
  }
  return a.owner === b.owner && a.repo === b.repo
}

function sameRepoIcon(a: RepoIcon | null | undefined, b: RepoIcon | null | undefined): boolean {
  if (!a || !b) {
    return a === b
  }
  if (a.type !== b.type) {
    return false
  }
  if (a.type === 'image' && b.type === 'image') {
    return a.src === b.src && a.source === b.source && a.label === b.label
  }
  if (a.type === 'emoji' && b.type === 'emoji') {
    return a.emoji === b.emoji
  }
  return a.type === 'lucide' && b.type === 'lucide' && a.name === b.name
}

export function buildRepositoryGitHubAvatarUpdate(
  repo: Repo,
  resolution: RepositoryGitHubAvatarResolution,
  options: { clearMissingIcon?: boolean } = {}
): Partial<Repo> | null {
  const updates: Partial<Repo> = {}

  if (!sameRepositoryIdentity(repo.upstream, resolution.upstream)) {
    updates.upstream = resolution.upstream
  }

  if (
    (resolution.repoIcon || options.clearMissingIcon) &&
    !sameRepoIcon(repo.repoIcon, resolution.repoIcon)
  ) {
    updates.repoIcon = resolution.repoIcon
  }

  return Object.keys(updates).length > 0 ? updates : null
}

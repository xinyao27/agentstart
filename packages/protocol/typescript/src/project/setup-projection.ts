import { getRepoExecutionHostId } from '../host/identity.js'
import type { WorktreeMeta } from '../worktree/model.js'
import type { Project, ProjectHostSetup, ProjectProviderIdentity } from './model.js'
import type { Repo } from './repository.js'

type ProjectAccumulator = {
  project: Project
}

export type ProjectHostSetupProjection = {
  projects: Project[]
  setups: ProjectHostSetup[]
}

function normalizeIdentityPart(value: string): string {
  return value.trim().toLowerCase()
}

export function getPortableProjectIdentityKey(
  project: Pick<Project, 'providerIdentity' | 'gitRemoteIdentity'> & Partial<Pick<Project, 'id'>>
): string | null {
  const providerIdentity = project.providerIdentity
  if (providerIdentity?.owner.trim() && providerIdentity.repo.trim()) {
    return `${providerIdentity.provider}:${normalizeIdentityPart(providerIdentity.owner)}/${normalizeIdentityPart(providerIdentity.repo)}`
  }
  const canonicalKey = project.gitRemoteIdentity?.canonicalKey.trim()
  if (canonicalKey) {
    return `git:${canonicalKey}`
  }
  const projectId = project.id?.trim()
  // Why: projected Project IDs already encode portable identity; legacy/random
  // IDs remain host-local and must never become cross-desktop join keys.
  return projectId?.startsWith('github:') || projectId?.startsWith('git:') ? projectId : null
}

function getProjectProviderIdentity(
  repo: Pick<Repo, 'upstream' | 'repoIcon' | 'gitRemoteIdentity'>
): ProjectProviderIdentity | null {
  const owner = typeof repo.upstream?.owner === 'string' ? repo.upstream.owner.trim() : ''
  const name = typeof repo.upstream?.repo === 'string' ? repo.upstream.repo.trim() : ''
  if (owner && name) {
    return { provider: 'github', owner, repo: name }
  }
  if (repo.repoIcon?.type === 'image' && repo.repoIcon.source === 'github') {
    const parts = (repo.repoIcon.label?.trim() ?? '').split('/')
    const iconOwner = parts[0]?.trim()
    const iconRepo = parts[1]?.trim()
    // Why: repo auto-detect can know the GitHub slug through the generated
    // avatar icon even when legacy `upstream` has not been backfilled yet.
    if (iconOwner && iconRepo && parts.length === 2) {
      return { provider: 'github', owner: iconOwner, repo: iconRepo }
    }
  }
  const canonicalKey = repo.gitRemoteIdentity?.canonicalKey.trim()
  if (canonicalKey?.startsWith('github.com/')) {
    const [, remoteOwner, remoteRepo, ...rest] = canonicalKey.split('/')
    if (remoteOwner?.trim() && remoteRepo?.trim() && rest.length === 0) {
      return { provider: 'github', owner: remoteOwner.trim(), repo: remoteRepo.trim() }
    }
  }
  return parseGitHubRemoteUrl(repo.gitRemoteIdentity?.remoteUrl)
}

function getProjectGitRemoteIdentity(
  repo: Pick<Repo, 'gitRemoteIdentity'>
): NonNullable<Repo['gitRemoteIdentity']> | null {
  const identity = repo.gitRemoteIdentity
  const canonicalKey =
    typeof identity?.canonicalKey === 'string' ? identity.canonicalKey.trim() : ''
  const remoteName = typeof identity?.remoteName === 'string' ? identity.remoteName.trim() : ''
  const remoteUrl = typeof identity?.remoteUrl === 'string' ? identity.remoteUrl.trim() : ''
  return canonicalKey && remoteName && remoteUrl ? { canonicalKey, remoteName, remoteUrl } : null
}

/** True when the repo resolves to a GitHub provider identity (via explicit
 *  upstream or a GitHub-sourced avatar icon). Used to scope GitHub-CLI setup
 *  prompts to users who actually have GitHub-backed projects. */
export function isGitHubBackedRepo(
  repo: Pick<Repo, 'upstream' | 'repoIcon' | 'gitRemoteIdentity'>
): boolean {
  return getProjectProviderIdentity(repo) !== null
}

export function getProjectIdentityKey(
  repo: Pick<Repo, 'id' | 'upstream' | 'repoIcon' | 'gitRemoteIdentity'>
): string {
  const identity = getProjectProviderIdentity(repo)
  if (identity) {
    return `github:${normalizeIdentityPart(identity.owner)}/${normalizeIdentityPart(identity.repo)}`
  }
  const gitRemoteIdentity = getProjectGitRemoteIdentity(repo)
  if (gitRemoteIdentity) {
    return `git:${gitRemoteIdentity.canonicalKey}`
  }
  return `repo:${repo.id}`
}

function getProjectId(
  repo: Pick<Repo, 'id' | 'upstream' | 'repoIcon' | 'gitRemoteIdentity'>
): string {
  return getProjectIdentityKey(repo)
}

function parseGitHubRemoteUrl(remoteUrl: string | undefined): ProjectProviderIdentity | null {
  const trimmed = remoteUrl?.trim()
  if (!trimmed) {
    return null
  }
  const match =
    trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i) ??
    trimmed.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i)
  if (!match?.[1] || !match[2]) {
    return null
  }
  return { provider: 'github', owner: match[1], repo: match[2] }
}

function createProjectFromRepo(repo: Repo, now: number): Project {
  const identity = getProjectProviderIdentity(repo)
  const gitRemoteIdentity = getProjectGitRemoteIdentity(repo)
  return {
    id: getProjectId(repo),
    displayName: repo.displayName,
    badgeColor: repo.badgeColor,
    ...(repo.repoIcon !== undefined ? { repoIcon: repo.repoIcon } : {}),
    ...(repo.kind ? { kind: repo.kind } : {}),
    ...(identity ? { providerIdentity: identity } : {}),
    ...(gitRemoteIdentity ? { gitRemoteIdentity } : {}),
    sourceRepoIds: [repo.id],
    createdAt: repo.addedAt || now,
    updatedAt: repo.addedAt || now
  }
}

function mergeProjectRepo(project: Project, repo: Repo): Project {
  const sourceRepoIds = project.sourceRepoIds.includes(repo.id)
    ? project.sourceRepoIds
    : [...project.sourceRepoIds, repo.id]
  return {
    ...project,
    sourceRepoIds,
    createdAt: Math.min(project.createdAt, repo.addedAt || project.createdAt),
    updatedAt: Math.max(project.updatedAt, repo.addedAt || project.updatedAt)
  }
}

function createSetupFromRepo(repo: Repo, projectId: string, now: number): ProjectHostSetup {
  const hostId = getRepoExecutionHostId(repo)
  const createdAt = repo.addedAt || now
  const setupMethod = repo.projectHostSetupMethod ?? 'legacy-repo'
  return {
    id: repo.id,
    projectId,
    hostId,
    repoId: repo.id,
    path: repo.path,
    displayName: repo.displayName,
    ...(repo.kind ? { kind: repo.kind } : {}),
    ...(repo.connectionId !== undefined ? { connectionId: repo.connectionId } : {}),
    ...(repo.executionHostId !== undefined ? { executionHostId: repo.executionHostId } : {}),
    ...(repo.worktreeBasePath ? { worktreeBasePath: repo.worktreeBasePath } : {}),
    ...(repo.hookSettings ? { hookSettings: repo.hookSettings } : {}),
    ...(repo.gitUsername ? { gitUsername: repo.gitUsername } : {}),
    ...(repo.sourceControlAi ? { sourceControlAi: repo.sourceControlAi } : {}),
    setupState: 'ready',
    setupMethod,
    createdAt,
    updatedAt: createdAt
  }
}

export function projectHostSetupProjectionFromRepos(
  repos: readonly Repo[],
  now: number
): ProjectHostSetupProjection {
  const projectById = new Map<string, ProjectAccumulator>()
  const setups: ProjectHostSetup[] = []

  for (const repo of repos) {
    const projectId = getProjectId(repo)
    const existing = projectById.get(projectId)
    const project = existing
      ? mergeProjectRepo(existing.project, repo)
      : createProjectFromRepo(repo, now)
    const setup = createSetupFromRepo(repo, projectId, now)
    projectById.set(projectId, {
      project
    })
    setups.push(setup)
  }

  return {
    projects: [...projectById.values()].map((entry) => entry.project),
    setups
  }
}

export function getProjectHostSetupForRepo(
  setups: readonly ProjectHostSetup[],
  repo: Repo,
  now: number
): ProjectHostSetup {
  return (
    setups.find((setup) => setup.repoId === repo.id) ??
    projectHostSetupProjectionFromRepos([repo], now).setups[0]
  )
}

export function getProjectHostSetupWorktreeMeta(
  setups: readonly ProjectHostSetup[],
  repo: Repo,
  now: number
): Pick<WorktreeMeta, 'projectId' | 'hostId' | 'projectHostSetupId'> {
  const setup = getProjectHostSetupForRepo(setups, repo, now)
  return {
    projectId: setup.projectId,
    hostId: setup.hostId,
    projectHostSetupId: setup.id
  }
}

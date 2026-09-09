import {
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId,
  normalizeExecutionHostId,
  parseExecutionHostId
} from '../host/identity.js'
import type { ProjectProviderIdentity } from './model.js'
import type { Repo } from './repository.js'

export type ProjectSourceProvider = 'github'

export type GitHubProjectSourceIdentity = ProjectProviderIdentity & {
  provider: 'github'
}

export type ProjectSourceIdentity = GitHubProjectSourceIdentity

export type ProjectSourceContext = {
  kind: 'project-source'
  provider: ProjectSourceProvider
  projectId: string
  hostId: ExecutionHostId
  projectHostSetupId?: string | null
  repoId?: string | null
  providerIdentity?: ProjectSourceIdentity | null
  accountLabel?: string | null
}

export type WorkspaceRunContext = {
  kind: 'workspace-run'
  projectId: string
  hostId: ExecutionHostId
  projectHostSetupId: string
  repoId: string
  path: string
}

export type ProjectSourceContextInput = Omit<ProjectSourceContext, 'kind' | 'hostId'> & {
  kind?: 'project-source'
  hostId?: string | null
}

export function normalizeProjectSourceContext(
  input: ProjectSourceContextInput
): ProjectSourceContext | null {
  const projectId = normalizeNonEmptyString(input.projectId)
  if (!projectId) {
    return null
  }
  const provider = normalizeProjectSourceProvider(input.provider)
  if (!provider) {
    return null
  }
  return {
    kind: 'project-source',
    provider,
    projectId,
    hostId: normalizeExecutionHostId(input.hostId) ?? LOCAL_EXECUTION_HOST_ID,
    projectHostSetupId: normalizeNonEmptyString(input.projectHostSetupId),
    repoId: normalizeNonEmptyString(input.repoId),
    providerIdentity: normalizeProjectSourceIdentity(provider, input.providerIdentity),
    accountLabel: normalizeNonEmptyString(input.accountLabel)
  }
}

export function buildProjectSourceContextFromRepo(args: {
  provider: ProjectSourceProvider
  projectId: string
  repo: Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>
  projectHostSetupId?: string | null
  providerIdentity?: ProjectSourceIdentity | null
  accountLabel?: string | null
}): ProjectSourceContext | null {
  return normalizeProjectSourceContext({
    provider: args.provider,
    projectId: args.projectId,
    hostId: getRepoHostId(args.repo),
    repoId: args.repo.id,
    projectHostSetupId: args.projectHostSetupId,
    providerIdentity: args.providerIdentity,
    accountLabel: args.accountLabel
  })
}

export function getProjectSourceRuntimeSettings(
  context: Pick<ProjectSourceContext, 'hostId'> | null | undefined
): { activeRuntimeEnvironmentId: string | null } {
  const parsed = parseExecutionHostId(context?.hostId)
  return {
    activeRuntimeEnvironmentId: parsed?.kind === 'runtime' ? parsed.environmentId : null
  }
}

export function getProjectSourceCacheScope(
  context: Pick<
    ProjectSourceContext,
    'provider' | 'hostId' | 'projectId' | 'projectHostSetupId'
  > & {
    providerIdentity?: ProjectSourceIdentity | null
    repoId?: string | null
  }
): string {
  return [
    context.provider,
    context.hostId,
    context.projectId,
    context.projectHostSetupId ?? '',
    context.repoId ?? '',
    projectSourceIdentityCachePart(context.providerIdentity)
  ]
    .map(encodeCachePart)
    .join(':')
}

export function buildWorkspaceRunContext(args: {
  projectId: string
  hostId: string | null | undefined
  projectHostSetupId: string
  repoId: string
  path: string
}): WorkspaceRunContext | null {
  const projectId = normalizeNonEmptyString(args.projectId)
  const projectHostSetupId = normalizeNonEmptyString(args.projectHostSetupId)
  const repoId = normalizeNonEmptyString(args.repoId)
  const repoPath = normalizeNonEmptyString(args.path)
  if (!projectId || !projectHostSetupId || !repoId || !repoPath) {
    return null
  }
  return {
    kind: 'workspace-run',
    projectId,
    hostId: normalizeExecutionHostId(args.hostId) ?? LOCAL_EXECUTION_HOST_ID,
    projectHostSetupId,
    repoId,
    path: repoPath
  }
}

function getRepoHostId(repo: Pick<Repo, 'connectionId' | 'executionHostId'>): ExecutionHostId {
  const explicit = normalizeExecutionHostId(repo.executionHostId)
  if (explicit) {
    return explicit
  }
  return LOCAL_EXECUTION_HOST_ID
}

function normalizeProjectSourceProvider(value: string): ProjectSourceProvider | null {
  return value === 'github' ? value : null
}

function normalizeProjectSourceIdentity(
  provider: ProjectSourceProvider,
  identity: ProjectSourceIdentity | null | undefined
): ProjectSourceIdentity | null {
  if (!identity || identity.provider !== provider) {
    return null
  }
  return identity
}

function normalizeNonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function projectSourceIdentityCachePart(
  identity: ProjectSourceIdentity | null | undefined
): string {
  if (!identity) {
    return ''
  }
  return [identity.owner, identity.repo].join('/')
}

function encodeCachePart(value: string): string {
  return encodeURIComponent(value)
}

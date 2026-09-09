import {
  LOCAL_EXECUTION_HOST_ID,
  getRepoExecutionHostId,
  getSettingsFocusedExecutionHostId,
  normalizeExecutionHostId,
  parseExecutionHostId
} from '@yiru/protocol/host/identity'
import type {
  GitHubPRRefreshAlias,
  GitHubPRRefreshCandidate,
  GitHubPRRefreshReason
} from '@yiru/protocol/hosted-review/pull-request-types'
import type { Repo } from '@yiru/protocol/project/repository'
import { enqueueShellGitHubPRRefresh } from '~renderer/runtime/github-shell-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import type { AppState } from '~renderer/store/types'

export function getRuntimeRepoTarget(
  state: AppState,
  repoPath: string,
  settings: AppState['settings'] = state.settings,
  resolvedRepo?: Repo
): { target: { kind: 'environment'; environmentId: string }; repo: Repo } | null {
  const target = getActiveRuntimeTarget(settings)
  if (target.kind !== 'environment') {
    return null
  }
  const repo = resolvedRepo ?? state.repos.find((candidate) => candidate.path === repoPath)
  return repo ? { target, repo } : null
}

export function getPRRefreshOwnerRuntimeEnvironmentId(
  candidate: Pick<GitHubPRRefreshCandidate, 'cacheKey' | 'executionHostId'>
): string | null {
  const parsed = parseExecutionHostId(candidate.executionHostId)
  if (parsed?.kind === 'runtime') {
    return parsed.environmentId
  }
  const cacheScopeHost = parseExecutionHostId(candidate.cacheKey.split('::', 1)[0])
  return cacheScopeHost?.kind === 'runtime' ? cacheScopeHost.environmentId : null
}

export function getPRRefreshRuntimeRepoTarget(
  state: AppState,
  candidate: GitHubPRRefreshCandidate
): { target: { kind: 'environment'; environmentId: string }; repo: Repo } | null {
  const environmentId = getPRRefreshOwnerRuntimeEnvironmentId(candidate)
  if (!environmentId) {
    return null
  }
  const repoMatches = state.repos.filter(
    (repo) =>
      repo.id === candidate.repoId &&
      repo.path === candidate.repoPath &&
      getRepoExecutionHostId(repo) === candidate.executionHostId
  )
  if (repoMatches.length !== 1) {
    return null
  }
  return getRuntimeRepoTarget(
    state,
    candidate.repoPath,
    state.settings
      ? { ...state.settings, activeRuntimeEnvironmentId: environmentId }
      : ({ activeRuntimeEnvironmentId: environmentId } as AppState['settings']),
    repoMatches[0]
  )
}

export function shouldEnqueueLocalPRRefresh(candidate: GitHubPRRefreshCandidate): boolean {
  return getPRRefreshOwnerRuntimeEnvironmentId(candidate) === null
}

export function enqueueLocalGitHubPRRefresh(
  args: {
    candidate: GitHubPRRefreshCandidate
    reason: GitHubPRRefreshReason
    priority: number
  },
  onNotQueued?: () => void | Promise<unknown>
): void {
  void enqueueShellGitHubPRRefresh(args)
    .then((queued) =>
      queued === false || queued?.kind === 'fallback' ? onNotQueued?.() : undefined
    )
    .catch((error) => {
      console.warn('Failed to enqueue PR refresh:', error)
    })
}

export function settingsForGitHubRepoOwner(
  settings: AppState['settings'],
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined
): AppState['settings'] {
  if (!repo) {
    return settings
  }
  const parsed = parseExecutionHostId(getRepoExecutionHostId(repo))
  if (parsed?.kind === 'runtime') {
    return settings
      ? { ...settings, activeRuntimeEnvironmentId: parsed.environmentId }
      : ({ activeRuntimeEnvironmentId: parsed.environmentId } as AppState['settings'])
  }
  return settings
    ? { ...settings, activeRuntimeEnvironmentId: null }
    : ({ activeRuntimeEnvironmentId: null } as AppState['settings'])
}

export function settingsForGitHubFocusedRepoOwner(
  settings: AppState['settings'],
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined
): AppState['settings'] {
  return repo?.executionHostId ? settingsForGitHubRepoOwner(settings, repo) : settings
}

export function getRefreshAliasExecutionHostId(alias: GitHubPRRefreshAlias): string {
  const explicitHostId = normalizeExecutionHostId(alias.executionHostId)
  if (explicitHostId) {
    return explicitHostId
  }
  return normalizeExecutionHostId(alias.cacheKey.split('::', 1)[0]) ?? LOCAL_EXECUTION_HOST_ID
}

export function findRepoForGitHubOwner(
  state: Partial<Pick<AppState, 'repos'>>,
  repoId: string | undefined,
  repoPath: string
): Repo | undefined {
  return (state.repos ?? []).find((candidate) =>
    repoId ? candidate.id === repoId || candidate.path === repoPath : candidate.path === repoPath
  )
}

export function getGitHubFocusedRepoOwnerHostId(
  settings: AppState['settings'],
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined
): string {
  return repo?.executionHostId
    ? getRepoExecutionHostId(repo)
    : getSettingsFocusedExecutionHostId(settings)
}

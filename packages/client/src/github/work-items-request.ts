import {
  normalizeExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '@yiru/protocol/host/identity'
import type { ListWorkItemsResult } from '@yiru/protocol/hosted-review/query-types'
import type { GitHubWorkItem } from '@yiru/protocol/hosted-review/review-types'
import type { Repo } from '@yiru/protocol/project/repository'
import {
  getProjectSourceCacheScope,
  getProjectSourceRuntimeSettings,
  type ProjectSourceContext
} from '@yiru/protocol/project/source-context'
import { runtimeCallDestination } from '~renderer/runtime/github-runtime-destination'
import { openGitHubTarget } from '~renderer/runtime/github-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import type { AppState } from '~renderer/store/types'

import { workItemsCacheKey } from './cache-policy'
import {
  findRepoForGitHubOwner,
  getGitHubFocusedRepoOwnerHostId,
  getRuntimeRepoTarget,
  settingsForGitHubFocusedRepoOwner,
  settingsForGitHubRepoOwner
} from './repo-owner'

export type GitHubWorkItemRequestTarget =
  | { kind: 'environment'; environmentId: string; runtimeRepoId: string }
  | { kind: 'local' }

export type GitHubWorkItemRequestContext = {
  repoId: string
  repoPath: string
  target: GitHubWorkItemRequestTarget
}

type GitHubWorkItemsListArgs = {
  limit: number
  query?: string
  page?: number
  noCache?: true
}

export function getWorkItemsCacheKeyForOwner(
  state: Partial<Pick<AppState, 'repos' | 'settings'>>,
  repoId: string,
  limit: number,
  query: string,
  repoPath?: string
): string {
  const repo = findRepoForGitHubOwner(state, repoId, repoPath ?? '')
  return workItemsCacheKey(
    repoId,
    limit,
    query,
    repo ? getGitHubFocusedRepoOwnerHostId(state.settings ?? null, repo) : undefined
  )
}

export function getGitHubWorkItemSourceHostId(
  state: AppState,
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  sourceContext?: ProjectSourceContext | null
): ExecutionHostId | undefined {
  if (sourceContext?.provider === 'github') {
    return sourceContext.hostId
  }
  return repo
    ? (normalizeExecutionHostId(getGitHubFocusedRepoOwnerHostId(state.settings, repo)) ?? undefined)
    : undefined
}

export function getGitHubWorkItemSourceCacheScope(
  state: AppState,
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  sourceContext?: ProjectSourceContext | null
): string | undefined {
  return sourceContext?.provider === 'github'
    ? getProjectSourceCacheScope(sourceContext)
    : getGitHubWorkItemSourceHostId(state, repo, sourceContext)
}

export function getGitHubWorkItemSourceSettings(
  settings: AppState['settings'],
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  sourceContext?: ProjectSourceContext | null
): AppState['settings'] {
  return sourceContext?.provider === 'github'
    ? ({ ...settings, ...getProjectSourceRuntimeSettings(sourceContext) } as AppState['settings'])
    : settingsForGitHubFocusedRepoOwner(settings, repo)
}

export function getGitHubRepoSourceSettings(
  settings: AppState['settings'],
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  sourceContext?: ProjectSourceContext | null
): AppState['settings'] {
  return sourceContext?.provider === 'github'
    ? ({ ...settings, ...getProjectSourceRuntimeSettings(sourceContext) } as AppState['settings'])
    : settingsForGitHubRepoOwner(settings, repo)
}

export function getGitHubWorkItemRequestContext(
  state: AppState,
  settings: AppState['settings'],
  repoId: string,
  repoPath: string,
  sourceContext?: ProjectSourceContext | null
): GitHubWorkItemRequestContext {
  if (sourceContext?.provider === 'github') {
    const parsedHost = parseExecutionHostId(sourceContext.hostId)
    if (parsedHost?.kind === 'runtime') {
      return {
        repoId,
        repoPath,
        target: {
          kind: 'environment',
          environmentId: parsedHost.environmentId,
          runtimeRepoId: sourceContext.repoId ?? repoId
        }
      }
    }
  }
  const runtimeRepo = getRuntimeRepoTarget(state, repoPath, settings)
  return {
    repoId,
    repoPath,
    target: runtimeRepo
      ? {
          kind: 'environment',
          environmentId: runtimeRepo.target.environmentId,
          runtimeRepoId: runtimeRepo.repo.id
        }
      : { kind: 'local' }
  }
}

export function githubRuntimeRequest(context: GitHubWorkItemRequestContext): {
  target: RuntimeClientTarget
  repo: string
} {
  return context.target.kind === 'environment'
    ? {
        target: { kind: 'environment', environmentId: context.target.environmentId },
        repo: context.target.runtimeRepoId
      }
    : { target: { kind: 'local' }, repo: context.repoId }
}

export function listGitHubWorkItemsForRepo(
  context: GitHubWorkItemRequestContext,
  args: GitHubWorkItemsListArgs
): Promise<ListWorkItemsResult<Omit<GitHubWorkItem, 'repoId'>>> {
  const { target, repo } = githubRuntimeRequest(context)
  return openGitHubTarget().then((client) => {
    if (!client) {
      throw new Error('GitHub protocol capability is unavailable')
    }
    return client.listWorkItems(
      { repo, limit: args.limit, page: args.page, query: args.query },
      { timeoutMs: 30_000, ...runtimeCallDestination(target) }
    )
  })
}

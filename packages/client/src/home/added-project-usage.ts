import type { Repo } from '@agentstart/protocol/project/repository'
import type { ProjectUsageValue, UsageProvider } from '@agentstart/protocol/stats/usage-breakdown'
import { splitWorktreeId } from '@agentstart/protocol/worktree/identity'

type ProviderAccumulator = {
  hasUnknownValue: boolean
  knownValueUsd: number
  tokens: number
}

type ProjectAccumulator = {
  hasUnknownValue: boolean
  key: string
  knownValueUsd: number
  label: string
  providers: Map<UsageProvider, ProviderAccumulator>
  sessions: number
  tokens: number
}

const WORKTREE_USAGE_KEY_PREFIX = 'worktree:'

export function buildAddedProjectUsage(
  usage: readonly ProjectUsageValue[],
  repos: readonly Pick<Repo, 'displayName' | 'id'>[]
): ProjectUsageValue[] {
  const repoById = new Map(repos.map((repo) => [repo.id, repo]))
  const projects = new Map<string, ProjectAccumulator>()

  for (const row of usage) {
    const repoId = getUsageRepoId(row.key)
    const repo = repoId ? repoById.get(repoId) : undefined
    if (!repo) {
      continue
    }
    const project = projects.get(repo.id) ?? {
      hasUnknownValue: false,
      key: `repo:${repo.id}`,
      knownValueUsd: 0,
      label: repo.displayName,
      providers: new Map(),
      sessions: 0,
      tokens: 0
    }
    project.sessions += row.sessions
    project.tokens += row.tokens
    project.hasUnknownValue ||= row.valueUsd === null
    project.knownValueUsd += row.valueUsd ?? 0

    for (const usageByProvider of row.providers) {
      const provider = project.providers.get(usageByProvider.provider) ?? {
        hasUnknownValue: false,
        knownValueUsd: 0,
        tokens: 0
      }
      provider.tokens += usageByProvider.tokens
      provider.hasUnknownValue ||= usageByProvider.valueUsd === null
      provider.knownValueUsd += usageByProvider.valueUsd ?? 0
      project.providers.set(usageByProvider.provider, provider)
    }
    projects.set(repo.id, project)
  }

  return [...projects.values()]
    .map((project) => ({
      key: project.key,
      label: project.label,
      sessions: project.sessions,
      tokens: project.tokens,
      valueUsd: project.hasUnknownValue ? null : project.knownValueUsd,
      providers: [...project.providers.entries()].map(([provider, usageByProvider]) => ({
        provider,
        tokens: usageByProvider.tokens,
        valueUsd: usageByProvider.hasUnknownValue ? null : usageByProvider.knownValueUsd
      }))
    }))
    .sort((left, right) => right.tokens - left.tokens)
}

function getUsageRepoId(key: string): string | null {
  if (!key.startsWith(WORKTREE_USAGE_KEY_PREFIX)) {
    return null
  }
  return splitWorktreeId(key.slice(WORKTREE_USAGE_KEY_PREFIX.length))?.repoId ?? null
}

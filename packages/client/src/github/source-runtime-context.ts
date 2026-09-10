import type { ProjectSourceContext } from '@agentstart/protocol/project/source-context'
import { getProjectSourceRuntimeSettings } from '@agentstart/protocol/project/source-context'
import type { RuntimeClientTarget } from '~renderer/runtime/rpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

export function getGitHubSourceRuntimeTarget(
  sourceContext: ProjectSourceContext | null | undefined
): RuntimeClientTarget {
  return getActiveRuntimeTarget(
    getProjectSourceRuntimeSettings(sourceContext?.provider === 'github' ? sourceContext : null)
  )
}

export function getGitHubRuntimeRepoId(
  sourceContext: ProjectSourceContext | null | undefined,
  fallbackRepoId: string
): string
export function getGitHubRuntimeRepoId(
  sourceContext: ProjectSourceContext | null | undefined,
  fallbackRepoId: string | null | undefined
): string | undefined
export function getGitHubRuntimeRepoId(
  sourceContext: ProjectSourceContext | null | undefined,
  fallbackRepoId: string | null | undefined
): string | undefined {
  const fallback = fallbackRepoId ?? undefined
  return sourceContext?.provider === 'github' ? (sourceContext.repoId ?? fallback) : fallback
}

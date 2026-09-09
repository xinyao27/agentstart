import type { ParsedExecutionHost } from '@yiru/protocol/host/identity'
import { parseExecutionHostId } from '@yiru/protocol/host/identity'
import type { ProjectSourceContext } from '@yiru/protocol/project/source-context'
import { getProjectSourceRuntimeSettings } from '@yiru/protocol/project/source-context'
import type { RuntimeClientTarget } from '~renderer/runtime/rpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

export type GitHubRuntimeHost = Extract<ParsedExecutionHost, { kind: 'runtime' }>

export function getGitHubSourceRuntimeHost(
  sourceContext: ProjectSourceContext | null | undefined
): GitHubRuntimeHost | null {
  if (sourceContext?.provider !== 'github') {
    return null
  }
  const parsedHost = parseExecutionHostId(sourceContext.hostId)
  return parsedHost?.kind === 'runtime' ? parsedHost : null
}

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

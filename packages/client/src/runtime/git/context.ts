import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { splitWorktreeIdForFilesystem } from '@yiru/protocol/worktree/identity'

import { getActiveRuntimeTarget } from '../rpc-client'
import type { RuntimeClientTarget } from '../runtime-target'
import { toRuntimeWorktreePathSelector, toRuntimeWorktreeSelector } from '../worktree-selector'

export type RuntimeGitSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> &
  Partial<
    Pick<
      GlobalSettings,
      'commitMessageAi' | 'sourceControlAi' | 'agentCmdOverrides' | 'enableGitHubAttribution'
    >
  >

export type RuntimeGitContext = {
  settings: RuntimeGitSettings | null | undefined
  worktreeId: string | null | undefined
  worktreePath: string
  connectionId?: string
}

function resolveWorktreePath(context: RuntimeGitContext): string {
  return context.worktreeId
    ? (splitWorktreeIdForFilesystem(context.worktreeId)?.worktreePath ?? context.worktreePath)
    : context.worktreePath
}

export function getRuntimeGitTarget(context: RuntimeGitContext): RuntimeClientTarget {
  return getActiveRuntimeTarget(context.settings)
}

export function getRuntimeGitWorktree(context: RuntimeGitContext): string {
  return context.worktreeId
    ? toRuntimeWorktreeSelector(context.worktreeId)
    : toRuntimeWorktreePathSelector(resolveWorktreePath(context))
}

export function getRuntimeGitScope(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  connectionId: string | null | undefined
): string | null | undefined {
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment' ? `runtime:${target.environmentId}` : connectionId
}

import type { GitHubPrStartPoint } from '@yiru/protocol/git/worktree-source'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { resolveRuntimeWorktreePrBase } from '~renderer/runtime/worktree-lifecycle-target'

type PrStartPointSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined

export type GitHubPrStartPointInput = {
  repoId: string
  prNumber: number
  settings: PrStartPointSettings
  headRefName?: string
  baseRefName?: string
  isCrossRepository?: boolean
}

export async function resolveGitHubPrStartPointForRepo({
  repoId,
  prNumber,
  settings,
  headRefName,
  baseRefName,
  isCrossRepository
}: GitHubPrStartPointInput): Promise<GitHubPrStartPoint> {
  const target = getActiveRuntimeTarget(settings)
  const prFields = {
    prNumber,
    ...(headRefName ? { headRefName } : {}),
    ...(baseRefName ? { baseRefName } : {}),
    ...(isCrossRepository !== undefined ? { isCrossRepository } : {})
  }
  const result = await resolveRuntimeWorktreePrBase(target, { repo: repoId, ...prFields })
  if ('error' in result) {
    throw new Error(result.error)
  }
  return result
}

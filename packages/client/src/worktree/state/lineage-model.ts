import type { WorktreeSetPatch } from '@agentstart/protocol'
import { getRepoExecutionHostId, type ExecutionHostId } from '@agentstart/protocol/host/identity'
import { readWorktreeMutationRevision } from '~renderer/project-catalog/catalog-snapshot'
import { refreshAfterWorktreeMutation } from '~renderer/project-catalog/mutation-refresh'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { setRuntimeWorktree } from '~renderer/runtime/worktree-lifecycle-target'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import type { AppState } from '../../store/types'
import { getRepoIdFromWorktreeId } from './types'

export type WorktreeLineageUpdateResult = {
  target: ReturnType<typeof getActiveRuntimeTarget>
}

export async function setWorktreeLineageForRuntime(
  settings: AppState['settings'],
  worktreeId: string,
  args: { parentWorktreeId?: string; noParent?: boolean }
): Promise<WorktreeLineageUpdateResult> {
  const target = getActiveRuntimeTarget(settings)
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const expectedRevision = readWorktreeMutationRevision(target, repoId)
  // Why: `worktree.set`'s patch whitelist has never read `parentWorktree` or
  // `noParent` (see the daemon's `parse_set`) — lineage capture happens as a
  // side effect of `create`, not `set` — so these fields are inert on every
  // transport this call has ever used. Routing local through the same call
  // as the environment path is not a behavior change, just one fewer preload
  // channel.
  const result = await setRuntimeWorktree(target, {
    worktree: toRuntimeWorktreeSelector(worktreeId),
    expectedRevision,
    patch: {
      ...(args.parentWorktreeId
        ? { parentWorktree: toRuntimeWorktreeSelector(args.parentWorktreeId) }
        : {}),
      ...(args.noParent === true ? { noParent: true } : {})
    } as WorktreeSetPatch
  })
  await refreshAfterWorktreeMutation(target, repoId, result.revision)
  return { target }
}

export function resolveWorktreeRemovalHost(
  state: Pick<AppState, 'repos' | 'settings' | 'worktreesByRepo' | 'detectedWorktreesByRepo'>,
  worktreeId: string
): { hostId: ExecutionHostId | null; ambiguous: boolean } {
  const hostIds = new Set<ExecutionHostId>()
  for (const worktrees of Object.values(state.worktreesByRepo)) {
    for (const worktree of worktrees) {
      if (worktree.id === worktreeId && worktree.hostId) {
        hostIds.add(worktree.hostId)
      }
    }
  }
  for (const result of Object.values(state.detectedWorktreesByRepo)) {
    for (const worktree of result.worktrees) {
      if (worktree.id === worktreeId && worktree.hostId) {
        hostIds.add(worktree.hostId)
      }
    }
  }
  if (hostIds.size > 1) {
    return { hostId: null, ambiguous: true }
  }
  if (hostIds.size === 1) {
    return { hostId: hostIds.values().next().value ?? null, ambiguous: false }
  }

  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const repoHostIds = new Set(
    state.repos.filter((repo) => repo.id === repoId).map(getRepoExecutionHostId)
  )
  return repoHostIds.size > 1
    ? { hostId: null, ambiguous: true }
    : { hostId: repoHostIds.values().next().value ?? null, ambiguous: false }
}

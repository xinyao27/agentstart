import { getRepoExecutionHostId } from '@agentstart/protocol/host/identity'
import type { ExecutionHostId } from '@agentstart/protocol/host/identity'
import { getRepoIdFromWorktreeId } from '@agentstart/protocol/worktree/identity'
import type { AppState } from '~renderer/store/types'
import { getExecutionHostIdForWorktree } from '~renderer/worktree/runtime-owner'

export function resolveMobileSessionSnapshotHost(
  state: AppState,
  worktreeId: string
): ExecutionHostId | null {
  const matchingWorktrees = Object.values(state.worktreesByRepo)
    .flat()
    .filter((worktree) => worktree.id === worktreeId)
  if (matchingWorktrees.length > 1) {
    return null
  }
  const repoId = matchingWorktrees[0]?.repoId ?? getRepoIdFromWorktreeId(worktreeId)
  const matchingRepoHosts = new Set(
    state.repos.filter((repo) => repo.id === repoId).map((repo) => getRepoExecutionHostId(repo))
  )
  if (!matchingWorktrees[0]?.hostId && matchingRepoHosts.size > 1) {
    return null
  }
  return getExecutionHostIdForWorktree(state, worktreeId)
}

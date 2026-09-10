import {
  LOCAL_EXECUTION_HOST_ID,
  getRepoExecutionHostId,
  normalizeExecutionHostId,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '@agentstart/protocol/host/identity'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { Worktree } from '@agentstart/protocol/worktree/model'

export type SourceControlOperationOwnerTarget = {
  worktreeId: string
  worktreePath: string
  connectionId?: string | null
  runtimeSettings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null
}

type SourceControlOperationOwnerState = {
  repos: readonly Repo[]
  worktreesByRepo: Readonly<Record<string, readonly Worktree[]>>
}

export function resolveSourceControlOperationOwner(
  state: SourceControlOperationOwnerState,
  target: SourceControlOperationOwnerTarget
): { worktree: Worktree; repo: Repo; executionHostId: ExecutionHostId } | null {
  const executionHostId = resolveSourceControlOperationExecutionHostId(target)
  const candidates = Object.values(state.worktreesByRepo)
    .flat()
    .filter(
      (worktree) => worktree.id === target.worktreeId && worktree.path === target.worktreePath
    )
  const explicitMatches = candidates.filter(
    (worktree) => normalizeExecutionHostId(worktree.hostId) === executionHostId
  )
  if (explicitMatches.length > 1) {
    return null
  }

  let worktree = explicitMatches[0]
  if (!worktree) {
    const legacyCandidate = candidates.length === 1 ? candidates[0] : undefined
    if (!legacyCandidate || legacyCandidate.hostId) {
      return null
    }
    const legacyRepoOwners = state.repos.filter((repo) => repo.id === legacyCandidate.repoId)
    // Why: pre-host worktrees cannot disambiguate duplicate repo ids; fail closed
    // instead of refreshing a review owned by another native/WSL/SSH host.
    if (
      legacyRepoOwners.length !== 1 ||
      getRepoExecutionHostId(legacyRepoOwners[0]) !== executionHostId
    ) {
      return null
    }
    worktree = legacyCandidate
  }

  const repoMatches = state.repos.filter(
    (repo) => repo.id === worktree.repoId && getRepoExecutionHostId(repo) === executionHostId
  )
  return repoMatches.length === 1 ? { worktree, repo: repoMatches[0], executionHostId } : null
}

function resolveSourceControlOperationExecutionHostId(
  target: Pick<SourceControlOperationOwnerTarget, 'connectionId' | 'runtimeSettings'>
): ExecutionHostId {
  const runtimeEnvironmentId = target.runtimeSettings?.activeRuntimeEnvironmentId?.trim()
  if (runtimeEnvironmentId) {
    return toRuntimeExecutionHostId(runtimeEnvironmentId)
  }
  return LOCAL_EXECUTION_HOST_ID
}

import type { WorktreeDetectedListResult as RuntimeDetectedWorktreeListResult } from '@yiru/protocol'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '@yiru/protocol/host/identity'
import type { Repo } from '@yiru/protocol/project/repository'
import type { DetectedWorktreeListResult, Worktree } from '@yiru/protocol/worktree/model'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

export type CatalogRepo = {
  repo: Repo
  target: RuntimeClientTarget
}

const PROJECTED_WORKTREES_BY_SOURCE = new WeakMap<
  RuntimeDetectedWorktreeListResult,
  Map<ExecutionHostId, { detected: DetectedWorktreeListResult; visible: Worktree[] }>
>()

function hostIdForTarget(target: RuntimeClientTarget): ExecutionHostId {
  return target.kind === 'local'
    ? LOCAL_EXECUTION_HOST_ID
    : toRuntimeExecutionHostId(target.environmentId)
}

function catalogRepoKey(repo: Repo): string {
  return `${getRepoExecutionHostId(repo)}:${repo.id}`
}

export function collectProjectCatalogWorktrees(
  catalogRepos: readonly CatalogRepo[],
  queries: readonly { data?: RuntimeDetectedWorktreeListResult }[]
): {
  detectedWorktreesByRepo: Record<string, DetectedWorktreeListResult>
  worktreesByRepo: Record<string, Worktree[]>
} {
  const detectedWorktreesByRepo: Record<string, DetectedWorktreeListResult> = {}
  const worktreesByRepo: Record<string, Worktree[]> = {}
  for (const [index, query] of queries.entries()) {
    const owner = catalogRepos[index]
    if (!owner || !query.data) {
      continue
    }
    const hostId = hostIdForTarget(owner.target)
    let projectedByHost = PROJECTED_WORKTREES_BY_SOURCE.get(query.data)
    if (!projectedByHost) {
      projectedByHost = new Map()
      PROJECTED_WORKTREES_BY_SOURCE.set(query.data, projectedByHost)
    }
    let projected = projectedByHost.get(hostId)
    if (!projected) {
      const visible = query.data.worktrees
        .filter((worktree) => worktree.visible)
        .map((worktree) => {
          const {
            ownership: _ownership,
            selectedCheckout: _selected,
            visible: _visible,
            ...base
          } = worktree
          return {
            ...base,
            hostId: hostId === LOCAL_EXECUTION_HOST_ID ? base.hostId : hostId
          }
        })
      projected = {
        detected: { ...query.data, worktrees: query.data.worktrees },
        visible
      }
      projectedByHost.set(hostId, projected)
    }
    const repoKey = catalogRepoKey(owner.repo)
    detectedWorktreesByRepo[repoKey] = projected.detected
    const priorWorktrees = worktreesByRepo[repoKey]
    worktreesByRepo[repoKey] = priorWorktrees
      ? [...priorWorktrees, ...projected.visible]
      : projected.visible
  }
  return { detectedWorktreesByRepo, worktreesByRepo }
}

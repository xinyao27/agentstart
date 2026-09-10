import type { RepoValue } from '@agentstart/protocol'
import { getRepoExecutionHostId } from '@agentstart/protocol/host/identity'
import { normalizeManualRepoOrder } from '@agentstart/protocol/project/manual-order'

export const UNGROUPED_PROJECT_GROUP_KEY = 'project-group:ungrouped'

export function getEffectiveProjectGroupManualRank(
  repo: Pick<RepoValue, 'id' | 'projectGroupOrder'> | undefined,
  repoOrderRankById?: ReadonlyMap<string, number>,
  siblingFallbackIndex?: number
): number {
  if (!repo) {
    return Number.POSITIVE_INFINITY
  }
  const order = repo.projectGroupOrder
  if (typeof order === 'number' && Number.isFinite(order)) {
    return order
  }
  const repoRank = repoOrderRankById?.get(repo.id)
  if (repoRank !== undefined) {
    return repoRank * 1000
  }
  if (siblingFallbackIndex !== undefined) {
    return siblingFallbackIndex * 1000
  }
  return Number.POSITIVE_INFINITY
}

export function getManualRepoOrder(repos: readonly RepoValue[]) {
  return normalizeManualRepoOrder(
    repos.map((repo) => ({ hostId: getRepoExecutionHostId(repo), repoId: repo.id }))
  )
}

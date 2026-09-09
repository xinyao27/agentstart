import type { Repo } from '@yiru/protocol/project/repository'
import type { ProjectOrderBy } from '@yiru/protocol/settings/ui-state'
import type { Worktree } from '@yiru/protocol/worktree/model'
import { getEffectiveProjectGroupManualRank } from '~renderer/project-catalog/group-order'
import { getRepoDisplayLabelKey, getRepoDisplayLabelsByPath } from '~renderer/repo/display-labels'

import type { OrderedGroupEntry, WorktreeGroupEntry } from './worktree-list/rows'

export function orderMainWorktreeFirst(worktrees: Worktree[]): Worktree[] {
  const mainWorktrees = worktrees.filter((worktree) => worktree.isMainWorktree)
  if (mainWorktrees.length === 0) {
    return worktrees
  }
  // Why: project groups are scanned by repo; keep the canonical workspace
  // anchored even when dynamic sorts rank a child workspace first.
  return [...mainWorktrees, ...worktrees.filter((worktree) => !worktree.isMainWorktree)]
}

export function withRepoSectionDisplayLabels(
  entries: readonly OrderedGroupEntry[]
): OrderedGroupEntry[] {
  const repos = entries
    .map((entry) => entry[1].repo)
    .filter((repo): repo is Repo => repo !== undefined)
  if (repos.length < 2) {
    return [...entries]
  }
  const labelsByPath = getRepoDisplayLabelsByPath(repos)
  return entries.map(([key, group]) => [
    key,
    group.repo
      ? { ...group, label: labelsByPath.get(getRepoDisplayLabelKey(group.repo)) ?? group.label }
      : group
  ])
}

export type RecentRank = { hasActivity: boolean; ts: number }

export function recentRankForEntry(entry: OrderedGroupEntry): RecentRank {
  let latestActivity = Number.NEGATIVE_INFINITY
  for (const worktree of entry[1].items) {
    if (worktree.lastActivityAt > latestActivity) {
      latestActivity = worktree.lastActivityAt
    }
  }
  if (latestActivity !== Number.NEGATIVE_INFINITY) {
    return { hasActivity: true, ts: latestActivity }
  }
  const addedAt = entry[1].repo?.addedAt
  return {
    hasActivity: false,
    ts: typeof addedAt === 'number' ? addedAt : Number.NEGATIVE_INFINITY
  }
}

export function compareRecentRank(left: RecentRank, right: RecentRank): number {
  if (left.hasActivity !== right.hasActivity) {
    return left.hasActivity ? -1 : 1
  }
  return right.ts - left.ts
}

function manualRankForEntry(
  entry: OrderedGroupEntry,
  repoOrder: Map<string, number> | undefined
): number {
  const key = entry[0]
  const repoIds =
    entry[1].repoIds.size > 0
      ? [...entry[1].repoIds]
      : [key.startsWith('repo:') ? key.slice('repo:'.length) : key]
  let rank = Number.POSITIVE_INFINITY
  for (const repoId of repoIds) {
    const repoRank = repoOrder?.get(repoId)
    if (repoRank !== undefined && repoRank < rank) {
      rank = repoRank
    }
  }
  return rank
}

export function getManualOrderAnchorRepo(
  group: WorktreeGroupEntry,
  repoMap: Map<string, Repo>,
  repoOrder: Map<string, number> | undefined
): Repo | undefined {
  let anchor = group.repo
  let anchorRank = anchor ? (repoOrder?.get(anchor.id) ?? Number.POSITIVE_INFINITY) : undefined
  for (const repoId of group.repoIds) {
    const repo = repoMap.get(repoId)
    if (!repo) {
      continue
    }
    const rank = repoOrder?.get(repoId) ?? Number.POSITIVE_INFINITY
    if (!anchor || rank < (anchorRank ?? Number.POSITIVE_INFINITY)) {
      anchor = repo
      anchorRank = rank
    }
  }
  return anchor
}

export function sortProjectEntries(
  entries: OrderedGroupEntry[],
  projectOrderBy: ProjectOrderBy,
  repoOrder: Map<string, number> | undefined
): OrderedGroupEntry[] {
  if (projectOrderBy === 'recent') {
    return [...entries].sort((left, right) => {
      const byRecent = compareRecentRank(recentRankForEntry(left), recentRankForEntry(right))
      if (byRecent !== 0) {
        return byRecent
      }
      const leftRank = manualRankForEntry(left, repoOrder)
      const rightRank = manualRankForEntry(right, repoOrder)
      return leftRank !== rightRank
        ? leftRank - rightRank
        : left[1].label.localeCompare(right[1].label)
    })
  }
  if (!repoOrder) {
    return entries
  }
  return [...entries].sort((left, right) => {
    const leftRank = manualRankForEntry(left, repoOrder)
    const rightRank = manualRankForEntry(right, repoOrder)
    return leftRank !== rightRank
      ? leftRank - rightRank
      : left[1].label.localeCompare(right[1].label)
  })
}

export function sortProjectGroupEntries(
  entries: OrderedGroupEntry[],
  projectOrderBy: ProjectOrderBy,
  repoOrder: Map<string, number> | undefined
): OrderedGroupEntry[] {
  if (projectOrderBy === 'recent') {
    return [...entries].sort((left, right) =>
      compareRecentRank(recentRankForEntry(left), recentRankForEntry(right))
    )
  }
  return [...entries].sort((left, right) => {
    const leftRank = getEffectiveProjectGroupManualRank(left[1].repo, repoOrder)
    const rightRank = getEffectiveProjectGroupManualRank(right[1].repo, repoOrder)
    return leftRank - rightRank
  })
}

import type { WorktreeDetectedListResult } from '@yiru/protocol'
import { worktreeDetectedListQuery } from '~renderer/runtime/worktree-catalog-query'

import { readProjectCatalogQueryClient, readProjectCatalogSnapshot } from './catalog-snapshot'
import { projectCatalogRepoKey, projectCatalogTargetForRepo } from './query'

type CachedWorktree = WorktreeDetectedListResult['worktrees'][number]

export function readProjectCatalogWorktree(worktreeId: string): CachedWorktree | undefined {
  const owner = findWorktreeOwner(worktreeId)
  if (!owner) {
    return undefined
  }
  return readProjectCatalogQueryClient()
    .getQueryData<WorktreeDetectedListResult>(owner.queryKey)
    ?.worktrees.find((worktree) => worktree.id === worktreeId)
}

export function updateProjectCatalogWorktree(
  worktreeId: string,
  updates: Partial<CachedWorktree>
): boolean {
  const owner = findWorktreeOwner(worktreeId)
  if (!owner) {
    return false
  }
  let changed = false
  readProjectCatalogQueryClient().setQueryData<WorktreeDetectedListResult>(
    owner.queryKey,
    (current) => {
      if (!current) {
        return current
      }
      const worktrees = current.worktrees.map((worktree) => {
        if (worktree.id !== worktreeId) {
          return worktree
        }
        changed = true
        return { ...worktree, ...updates }
      })
      return changed ? { ...current, worktrees } : current
    }
  )
  return changed
}

function findWorktreeOwner(worktreeId: string): { queryKey: readonly unknown[] } | null {
  const catalog = readProjectCatalogSnapshot()
  const repo = catalog.repos.find((candidate) =>
    catalog.detectedWorktreesByRepo[projectCatalogRepoKey(candidate)]?.worktrees.some(
      (worktree) => worktree.id === worktreeId
    )
  )
  if (!repo) {
    return null
  }
  const target = projectCatalogTargetForRepo(repo)
  return { queryKey: worktreeDetectedListQuery(target, repo.id).queryKey }
}

import type { DetectedWorktreeListResult, Worktree } from '@agentstart/protocol/worktree/model'

import { projectCatalogRepoKey, type ProjectCatalog } from './query'

export type ProjectCatalogRepoBuckets = {
  detectedWorktreesByRepo: Record<string, DetectedWorktreeListResult>
  worktreesByRepo: Record<string, Worktree[]>
}

export function projectCatalogRepoBuckets(catalog: ProjectCatalog): ProjectCatalogRepoBuckets {
  const detectedWorktreesByRepo: Record<string, DetectedWorktreeListResult> = {}
  const worktreesByRepo: Record<string, Worktree[]> = {}

  for (const repo of catalog.repos) {
    const catalogKey = projectCatalogRepoKey(repo)
    const visibleWorktrees = catalog.worktreesByRepo[catalogKey] ?? []
    worktreesByRepo[repo.id] = [...(worktreesByRepo[repo.id] ?? []), ...visibleWorktrees]

    const detected = catalog.detectedWorktreesByRepo[catalogKey]
    if (!detected) {
      continue
    }
    const previous = detectedWorktreesByRepo[repo.id]
    detectedWorktreesByRepo[repo.id] = previous
      ? { ...detected, worktrees: [...previous.worktrees, ...detected.worktrees] }
      : detected
  }

  return { detectedWorktreesByRepo, worktreesByRepo }
}

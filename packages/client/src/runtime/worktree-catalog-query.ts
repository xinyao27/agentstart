import { queryOptions } from '@tanstack/react-query'

import { targetKey } from './query-target'
import type { RuntimeClientTarget } from './runtime-target'
import {
  detectedListRuntimeWorktrees,
  listRuntimeWorktreeLineage
} from './worktree-lifecycle-target'

// Why: Reads and invalidations must use the same execution-target scope.
export function worktreeCatalogQueryKey(target: RuntimeClientTarget): readonly unknown[] {
  return ['worktree-catalog', targetKey(target)]
}

export function worktreeDetectedListQuery(target: RuntimeClientTarget, repoId: string) {
  return queryOptions({
    queryKey: [...worktreeCatalogQueryKey(target), 'detectedList', repoId] as const,
    queryFn: () => detectedListRuntimeWorktrees(target, { repo: repoId })
  })
}

export function worktreeLineageListQuery(target: RuntimeClientTarget) {
  return queryOptions({
    queryKey: [...worktreeCatalogQueryKey(target), 'lineageList'] as const,
    queryFn: () => listRuntimeWorktreeLineage(target)
  })
}

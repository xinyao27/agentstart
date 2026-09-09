import type { QueryClient } from '@tanstack/react-query'
import { targetKey } from '~renderer/runtime/query-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

import { projectCatalogWorktreeRevisionKey, type ProjectCatalog } from './query'

let committedCatalog: ProjectCatalog | null = null
let committedQueryClient: QueryClient | null = null
const pendingRepoRevisionByTarget = new Map<string, number>()
const pendingWorktreeRevisionByTargetRepo = new Map<string, number>()

export function registerProjectCatalogSnapshot(
  catalog: ProjectCatalog,
  queryClient: QueryClient
): () => void {
  committedCatalog = catalog
  committedQueryClient = queryClient
  for (const [key, pendingRevision] of pendingRepoRevisionByTarget) {
    if ((catalog.revisionByTarget[key] ?? 0) >= pendingRevision) {
      pendingRepoRevisionByTarget.delete(key)
    }
  }
  for (const [key, pendingRevision] of pendingWorktreeRevisionByTargetRepo) {
    if ((catalog.worktreeRevisionByTargetRepo[key] ?? 0) >= pendingRevision) {
      pendingWorktreeRevisionByTargetRepo.delete(key)
    }
  }
  return () => {
    if (committedCatalog === catalog) {
      committedCatalog = null
      committedQueryClient = null
    }
  }
}

export function readProjectCatalogQueryClient(): QueryClient {
  if (!committedQueryClient) {
    throw new Error('project_catalog_query_client_unavailable')
  }
  return committedQueryClient
}

export function readProjectCatalogSnapshot(): ProjectCatalog {
  if (!committedCatalog) {
    throw new Error('project_catalog_snapshot_unavailable')
  }
  return committedCatalog
}

export function readProjectCatalogMutationRevision(target: RuntimeClientTarget): number {
  const key = targetKey(target)
  return Math.max(
    readProjectCatalogSnapshot().revisionByTarget[key] ?? 0,
    pendingRepoRevisionByTarget.get(key) ?? 0
  )
}

export function recordProjectCatalogMutationRevision(
  target: RuntimeClientTarget,
  revision: number | undefined
): void {
  if (revision === undefined) {
    return
  }
  const key = targetKey(target)
  pendingRepoRevisionByTarget.set(
    key,
    Math.max(revision, pendingRepoRevisionByTarget.get(key) ?? 0)
  )
}

export function readWorktreeMutationRevision(target: RuntimeClientTarget, repoId: string): number {
  const key = projectCatalogWorktreeRevisionKey(target, repoId)
  return Math.max(
    readProjectCatalogSnapshot().worktreeRevisionByTargetRepo[key] ?? 0,
    pendingWorktreeRevisionByTargetRepo.get(key) ?? 0
  )
}

export function recordWorktreeMutationRevision(
  target: RuntimeClientTarget,
  repoId: string,
  revision: number | undefined
): void {
  if (revision === undefined) {
    return
  }
  const key = projectCatalogWorktreeRevisionKey(target, repoId)
  pendingWorktreeRevisionByTargetRepo.set(
    key,
    Math.max(revision, pendingWorktreeRevisionByTargetRepo.get(key) ?? 0)
  )
}

import {
  readProjectCatalogQueryClient,
  readProjectCatalogSnapshot
} from '../project-catalog/catalog-snapshot'
import { projectCatalogTargetForRepo } from '../project-catalog/query'
import {
  refreshProjectCatalogTargetRepos,
  refreshProjectCatalogWorktrees,
  type ProjectWorktreeCatalog
} from '../project-catalog/refresh'
import { targetKey } from '../runtime/query-target'
import { getActiveRuntimeTarget } from '../runtime/rpc-client'
import type { RuntimeClientTarget } from '../runtime/runtime-target'
import { settingsForWorktreeOwner } from './state/runtime-owner'
import { getRepoIdFromWorktreeId } from './state/types'

export async function refreshWorktreeCatalog(
  target: RuntimeClientTarget,
  repoId: string
): Promise<ProjectWorktreeCatalog | null> {
  const queryClient = readProjectCatalogQueryClient()
  const expectedTargetKey = targetKey(target)
  const matches = (repo: ReturnType<typeof readProjectCatalogSnapshot>['repos'][number]) =>
    repo.id === repoId && targetKey(projectCatalogTargetForRepo(repo)) === expectedTargetKey
  const repo =
    readProjectCatalogSnapshot().repos.find(matches) ??
    (await refreshProjectCatalogTargetRepos(queryClient, target)).find(matches)
  return repo ? refreshProjectCatalogWorktrees(queryClient, repo) : null
}

export function refreshOwnedWorktreeCatalog(
  state: Parameters<typeof settingsForWorktreeOwner>[0],
  worktreeId: string
): Promise<ProjectWorktreeCatalog | null> {
  return refreshWorktreeCatalog(
    getActiveRuntimeTarget(settingsForWorktreeOwner(state, worktreeId)),
    getRepoIdFromWorktreeId(worktreeId)
  )
}

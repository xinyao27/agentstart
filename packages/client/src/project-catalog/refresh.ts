import type { QueryClient } from '@tanstack/react-query'
import type { Repo } from '@yiru/protocol/project/repository'
import type { WorktreeLineage, WorkspaceLineage } from '@yiru/protocol/worktree/lineage'
import type { DetectedWorktreeListResult, Worktree } from '@yiru/protocol/worktree/model'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import { projectCatalogProjectsQueryKey } from '~renderer/runtime/project-target'
import { RUNTIME_ENVIRONMENTS_QUERY_KEY } from '~renderer/runtime/runtime-environments-client'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import {
  worktreeCatalogQueryKey,
  worktreeDetectedListQuery,
  worktreeLineageListQuery
} from '~renderer/runtime/worktree-catalog-query'

import { projectCatalogFolderWorkspaceQueryKey } from './folder-workspace-query'
import { projectCatalogProjectGroupQueryKey } from './project-group-query'
import { projectCatalogProjectHostSetupQueryKey } from './project-host-setup-query'
import {
  projectCatalogRepoForTarget,
  projectCatalogRepoKey,
  projectCatalogTargetForRepo
} from './query'
import { projectCatalogRepoQuery, projectCatalogRepoQueryKey } from './repo-query'
import { collectProjectCatalogWorktrees } from './worktree-assembly'

const LOCAL_TARGET = { kind: 'local' } as const satisfies RuntimeClientTarget

export type ProjectWorktreeCatalog = {
  detected: DetectedWorktreeListResult | undefined
  worktrees: Worktree[]
}

export async function refreshProjectCatalogTargetRepos(
  queryClient: QueryClient,
  target: RuntimeClientTarget
): Promise<Repo[]> {
  const result = await queryClient.fetchQuery({
    ...projectCatalogRepoQuery(target),
    staleTime: 0
  })
  return result.repos.map((repo) => projectCatalogRepoForTarget(repo, target))
}

export async function invalidateProjectCatalogTarget(
  queryClient: QueryClient,
  target: RuntimeClientTarget
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: projectCatalogRepoQueryKey(target) }),
    queryClient.invalidateQueries({ queryKey: projectCatalogProjectGroupQueryKey(target) }),
    queryClient.invalidateQueries({ queryKey: projectCatalogFolderWorkspaceQueryKey(target) }),
    queryClient.invalidateQueries({ queryKey: projectCatalogProjectsQueryKey(target) }),
    queryClient.invalidateQueries({ queryKey: projectCatalogProjectHostSetupQueryKey(target) }),
    queryClient.invalidateQueries({ queryKey: worktreeCatalogQueryKey(target) })
  ])
}

export async function invalidateAllProjectCatalogTargets(queryClient: QueryClient): Promise<void> {
  const targets: RuntimeClientTarget[] = [
    LOCAL_TARGET,
    ...readRuntimeEnvironmentsFromQuery(queryClient).map((environment) => ({
      kind: 'environment' as const,
      environmentId: environment.id
    }))
  ]
  await Promise.all(targets.map((target) => invalidateProjectCatalogTarget(queryClient, target)))
}

function readRuntimeEnvironmentsFromQuery(
  queryClient: QueryClient
): PublicKnownRuntimeEnvironment[] {
  return (
    queryClient.getQueryData<PublicKnownRuntimeEnvironment[]>(RUNTIME_ENVIRONMENTS_QUERY_KEY) ?? []
  )
}

export async function refreshProjectCatalogWorktrees(
  queryClient: QueryClient,
  repo: Repo
): Promise<ProjectWorktreeCatalog> {
  const target = projectCatalogTargetForRepo(repo)
  const result = await queryClient.fetchQuery({
    ...worktreeDetectedListQuery(target, repo.id),
    staleTime: 0
  })
  const collected = collectProjectCatalogWorktrees([{ repo, target }], [{ data: result }])
  const key = projectCatalogRepoKey(repo)
  return {
    detected: collected.detectedWorktreesByRepo[key],
    worktrees: collected.worktreesByRepo[key] ?? []
  }
}

export async function refreshProjectCatalogLineage(
  queryClient: QueryClient,
  target: RuntimeClientTarget
): Promise<{
  workspaceLineageByChildKey: Record<string, WorkspaceLineage>
  worktreeLineageById: Record<string, WorktreeLineage>
}> {
  const result = await queryClient.fetchQuery({
    ...worktreeLineageListQuery(target),
    staleTime: 0
  })
  return {
    workspaceLineageByChildKey: result.workspaceLineage,
    worktreeLineageById: result.lineage
  }
}

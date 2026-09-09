import { useQueries, useQuery } from '@tanstack/react-query'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '@yiru/protocol/host/identity'
import type { ProjectGroup } from '@yiru/protocol/project/group-model'
import type { Project, ProjectHostSetup } from '@yiru/protocol/project/model'
import type { Repo } from '@yiru/protocol/project/repository'
import type { FolderWorkspace } from '@yiru/protocol/workspace/folder'
import type { WorktreeLineage, WorkspaceLineage } from '@yiru/protocol/worktree/lineage'
import type { DetectedWorktreeListResult, Worktree } from '@yiru/protocol/worktree/model'
import type { PublicKnownRuntimeEnvironment } from '~renderer/runtime/environment-model'
import { projectCatalogProjectsQuery } from '~renderer/runtime/project-target'
import { targetKey } from '~renderer/runtime/query-target'
import {
  RUNTIME_ENVIRONMENTS_QUERY_KEY,
  runtimeEnvironmentsClient
} from '~renderer/runtime/runtime-environments-client'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import {
  worktreeDetectedListQuery,
  worktreeLineageListQuery
} from '~renderer/runtime/worktree-catalog-query'

import { useReferencedCatalogValue, useStructurallySharedCatalog } from './assembly'
import { projectCatalogFolderWorkspaceQuery } from './folder-workspace-query'
import { projectCatalogProjectGroupQuery } from './project-group-query'
import { projectCatalogProjectHostSetupQuery } from './project-host-setup-query'
import { collectProjectProjection } from './project-projection'
import { projectCatalogRepoQuery } from './repo-query'
import { collectProjectCatalogWorktrees } from './worktree-assembly'

const LOCAL_TARGET = { kind: 'local' } as const satisfies RuntimeClientTarget

const PROJECTED_REPO_BY_SOURCE = new WeakMap<Repo, Map<ExecutionHostId, Repo>>()
const PROJECTED_GROUP_BY_SOURCE = new WeakMap<ProjectGroup, Map<ExecutionHostId, ProjectGroup>>()

export type ProjectCatalog = {
  allWorktrees: Worktree[]
  detectedWorktreesByRepo: Record<string, DetectedWorktreeListResult>
  folderWorkspaces: FolderWorkspace[]
  isPending: boolean
  projectHostSetups: ProjectHostSetup[]
  projects: Project[]
  projectGroups: ProjectGroup[]
  repos: Repo[]
  revisionByTarget: Record<string, number>
  runtimeEnvironments: PublicKnownRuntimeEnvironment[]
  workspaceLineageByChildKey: Record<string, WorkspaceLineage>
  worktreeLineageById: Record<string, WorktreeLineage>
  worktreeRevisionByTargetRepo: Record<string, number>
  worktreesByRepo: Record<string, Worktree[]>
}

export function useProjectCatalogQuery(): ProjectCatalog {
  const environments = useQuery({
    queryKey: RUNTIME_ENVIRONMENTS_QUERY_KEY,
    queryFn: () => runtimeEnvironmentsClient.list(),
    staleTime: 30_000
  })
  const targets = useReferencedCatalogValue([environments.data], () => [
    LOCAL_TARGET,
    ...(environments.data ?? []).map((environment) => environmentTarget(environment))
  ])
  const repoQueries = useQueries({
    queries: targets.map((target) => ({
      ...projectCatalogRepoQuery(target),
      staleTime: 10_000
    }))
  })
  const projectGroupQueries = useQueries({
    queries: targets.map((target) => ({
      ...projectCatalogProjectGroupQuery(target),
      staleTime: 10_000
    }))
  })
  const folderWorkspaceQueries = useQueries({
    queries: targets.map((target) => ({
      ...projectCatalogFolderWorkspaceQuery(target),
      staleTime: 10_000
    }))
  })
  const projectQueries = useQueries({
    queries: targets.map((target) => ({
      ...projectCatalogProjectsQuery(target),
      staleTime: 10_000
    }))
  })
  const projectHostSetupQueries = useQueries({
    queries: targets.map((target) => ({
      ...projectCatalogProjectHostSetupQuery(target),
      staleTime: 10_000
    }))
  })
  const lineageQueries = useQueries({
    queries: targets.map((target) => ({
      ...worktreeLineageListQuery(target),
      staleTime: 2_000
    }))
  })
  const catalogRepos = useReferencedCatalogValue(
    [targets, ...repoQueries.map((query) => query.data)],
    () =>
      repoQueries.flatMap((query, index) =>
        (query.data?.repos ?? []).map((repo) => ({
          repo: projectCatalogRepoForTarget(repo, targets[index]),
          target: targets[index]
        }))
      )
  )
  const worktreeQueries = useQueries({
    queries: catalogRepos.map(({ repo, target }) => ({
      ...worktreeDetectedListQuery(target, repo.id),
      staleTime: 2_000
    }))
  })
  const worktreeCatalog = useReferencedCatalogValue(
    [catalogRepos, ...worktreeQueries.map((query) => query.data)],
    () => collectProjectCatalogWorktrees(catalogRepos, worktreeQueries)
  )
  const projection = useReferencedCatalogValue(
    [
      targets,
      catalogRepos,
      ...projectQueries.map((query) => query.data),
      ...projectHostSetupQueries.map((query) => query.data)
    ],
    () =>
      collectProjectProjection(
        targets.map((target, index) => ({
          fetchedProjects: projectQueries[index]?.data?.projects ?? [],
          fetchedSetups: projectHostSetupQueries[index]?.data?.setups ?? [],
          repos: catalogRepos
            .filter((entry) => targetKey(entry.target) === targetKey(target))
            .map((entry) => entry.repo),
          target
        }))
      )
  )
  const allWorktrees = useReferencedCatalogValue([worktreeCatalog.worktreesByRepo], () =>
    Object.values(worktreeCatalog.worktreesByRepo).flat()
  )
  const folderWorkspaces = useReferencedCatalogValue(
    folderWorkspaceQueries.map((query) => query.data),
    () => folderWorkspaceQueries.flatMap((query) => query.data?.folderWorkspaces ?? [])
  )
  const projectGroups = useReferencedCatalogValue(
    [targets, ...projectGroupQueries.map((query) => query.data)],
    () =>
      projectGroupQueries.flatMap((query, index) =>
        (query.data?.groups ?? []).map((group) => projectGroupForTarget(group, targets[index]))
      )
  )
  const repos = useReferencedCatalogValue([catalogRepos], () =>
    catalogRepos.map(({ repo }) => repo)
  )
  const revisionByTarget = useReferencedCatalogValue(
    [
      targets,
      ...repoQueries.map((query) => query.data),
      ...projectGroupQueries.map((query) => query.data),
      ...folderWorkspaceQueries.map((query) => query.data),
      ...projectQueries.map((query) => query.data),
      ...projectHostSetupQueries.map((query) => query.data)
    ],
    () =>
      Object.fromEntries(
        targets.map((target, index) => [
          targetKey(target),
          Math.max(
            repoQueries[index]?.data?.revision ?? 0,
            projectGroupQueries[index]?.data?.revision ?? 0,
            folderWorkspaceQueries[index]?.data?.revision ?? 0,
            projectQueries[index]?.data?.revision ?? 0,
            projectHostSetupQueries[index]?.data?.revision ?? 0
          )
        ])
      )
  )
  const workspaceLineageByChildKey = useReferencedCatalogValue(
    lineageQueries.map((query) => query.data),
    () => Object.assign({}, ...lineageQueries.map((query) => query.data?.workspaceLineage ?? {}))
  )
  const worktreeLineageById = useReferencedCatalogValue(
    lineageQueries.map((query) => query.data),
    () => Object.assign({}, ...lineageQueries.map((query) => query.data?.lineage ?? {}))
  )
  const worktreeRevisionByTargetRepo = useReferencedCatalogValue(
    [catalogRepos, ...worktreeQueries.map((query) => query.data)],
    () =>
      Object.fromEntries(
        catalogRepos.map(({ repo, target }, index) => [
          projectCatalogWorktreeRevisionKey(target, repo.id),
          worktreeQueries[index]?.data?.revision ?? 0
        ])
      )
  )
  return useStructurallySharedCatalog({
    allWorktrees,
    detectedWorktreesByRepo: worktreeCatalog.detectedWorktreesByRepo,
    folderWorkspaces,
    isPending:
      environments.isPending ||
      repoQueries.some((query) => query.isPending) ||
      projectGroupQueries.some((query) => query.isPending) ||
      folderWorkspaceQueries.some((query) => query.isPending) ||
      projectQueries.some((query) => query.isPending) ||
      projectHostSetupQueries.some((query) => query.isPending) ||
      lineageQueries.some((query) => query.isPending) ||
      worktreeQueries.some((query) => query.isPending),
    projectHostSetups: projection.setups,
    projects: projection.projects,
    projectGroups,
    repos,
    revisionByTarget,
    runtimeEnvironments: environments.data ?? [],
    workspaceLineageByChildKey,
    worktreeLineageById,
    worktreeRevisionByTargetRepo,
    worktreesByRepo: worktreeCatalog.worktreesByRepo
  })
}

function environmentTarget(environment: PublicKnownRuntimeEnvironment): RuntimeClientTarget {
  return { kind: 'environment', environmentId: environment.id }
}

function hostIdForTarget(target: RuntimeClientTarget): ExecutionHostId {
  return target.kind === 'local'
    ? LOCAL_EXECUTION_HOST_ID
    : toRuntimeExecutionHostId(target.environmentId)
}

export function projectCatalogRepoForTarget(repo: Repo, target: RuntimeClientTarget): Repo {
  const executionHostId = hostIdForTarget(target)
  if (repo.executionHostId === executionHostId) {
    return repo
  }
  let projectedByHost = PROJECTED_REPO_BY_SOURCE.get(repo)
  if (!projectedByHost) {
    projectedByHost = new Map()
    PROJECTED_REPO_BY_SOURCE.set(repo, projectedByHost)
  }
  const existing = projectedByHost.get(executionHostId)
  if (existing) {
    return existing
  }
  const projected = { ...repo, executionHostId }
  projectedByHost.set(executionHostId, projected)
  return projected
}

function projectGroupForTarget(
  projectGroup: ProjectGroup,
  target: RuntimeClientTarget
): ProjectGroup {
  const executionHostId = hostIdForTarget(target)
  if (projectGroup.executionHostId === executionHostId) {
    return projectGroup
  }
  let projectedByHost = PROJECTED_GROUP_BY_SOURCE.get(projectGroup)
  if (!projectedByHost) {
    projectedByHost = new Map()
    PROJECTED_GROUP_BY_SOURCE.set(projectGroup, projectedByHost)
  }
  const existing = projectedByHost.get(executionHostId)
  if (existing) {
    return existing
  }
  const projected = { ...projectGroup, executionHostId }
  projectedByHost.set(executionHostId, projected)
  return projected
}

export function projectCatalogTargetKey(target: RuntimeClientTarget): string {
  return targetKey(target)
}

export function projectCatalogWorktreeRevisionKey(
  target: RuntimeClientTarget,
  repoId: string
): string {
  return `${targetKey(target)}:${repoId}`
}

export function projectCatalogRepoKey(repo: Repo): string {
  return `${getRepoExecutionHostId(repo)}:${repo.id}`
}

export function projectCatalogTargetForRepo(repo: Repo): RuntimeClientTarget {
  const parsed = parseExecutionHostId(getRepoExecutionHostId(repo))
  return parsed?.kind === 'runtime'
    ? { kind: 'environment', environmentId: parsed.environmentId }
    : LOCAL_TARGET
}

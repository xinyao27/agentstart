import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'

import { readProjectCatalogSnapshot } from './catalog-snapshot'
import { useProjectCatalog } from './provider'
import type { ProjectCatalog } from './query'
import { projectCatalogRepoBuckets } from './repo-buckets'

export type ProjectCatalogRuntimeState = Pick<
  AppState,
  'activeRepoId' | 'activeWorktreeId' | 'restoredRuntimeHostIdByWorkspaceSessionKey' | 'settings'
> &
  Pick<
    ProjectCatalog,
    | 'detectedWorktreesByRepo'
    | 'folderWorkspaces'
    | 'projectGroups'
    | 'projectHostSetups'
    | 'projects'
    | 'repos'
    | 'runtimeEnvironments'
    | 'worktreesByRepo'
  >

type ProjectCatalogUiState = Pick<
  AppState,
  'activeRepoId' | 'activeWorktreeId' | 'restoredRuntimeHostIdByWorkspaceSessionKey' | 'settings'
>

function projectCatalogRuntimeState(
  catalog: ProjectCatalog,
  uiState: ProjectCatalogUiState
): ProjectCatalogRuntimeState {
  const buckets = projectCatalogRepoBuckets(catalog)
  return {
    ...uiState,
    detectedWorktreesByRepo: buckets.detectedWorktreesByRepo,
    folderWorkspaces: catalog.folderWorkspaces,
    projectGroups: catalog.projectGroups,
    projectHostSetups: catalog.projectHostSetups,
    projects: catalog.projects,
    repos: catalog.repos,
    runtimeEnvironments: catalog.runtimeEnvironments,
    worktreesByRepo: buckets.worktreesByRepo
  }
}

export function readProjectCatalogRuntimeState(): ProjectCatalogRuntimeState {
  return projectCatalogRuntimeState(readProjectCatalogSnapshot(), useAppStore.getState())
}

export function useProjectCatalogRuntimeState(): ProjectCatalogRuntimeState {
  const catalog = useProjectCatalog()
  const activeRepoId = useAppStore((state) => state.activeRepoId)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const restoredRuntimeHostIdByWorkspaceSessionKey = useAppStore(
    (state) => state.restoredRuntimeHostIdByWorkspaceSessionKey
  )
  const settings = useAppStore((state) => state.settings)
  return projectCatalogRuntimeState(catalog, {
    activeRepoId,
    activeWorktreeId,
    restoredRuntimeHostIdByWorkspaceSessionKey,
    settings
  })
}

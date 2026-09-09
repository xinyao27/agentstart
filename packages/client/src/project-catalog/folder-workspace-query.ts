import { queryOptions } from '@tanstack/react-query'
import { listRuntimeFolderWorkspaces } from '~renderer/runtime/folder-workspace-target'
import { targetKey } from '~renderer/runtime/query-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

// Why: Reads and invalidations must use the same execution-target scope.
export function projectCatalogFolderWorkspaceQuery(target: RuntimeClientTarget) {
  return queryOptions({
    queryKey: ['project-catalog', 'folder-workspaces', targetKey(target)] as const,
    queryFn: () => listRuntimeFolderWorkspaces(target)
  })
}

export function projectCatalogFolderWorkspaceQueryKey(target: RuntimeClientTarget) {
  return projectCatalogFolderWorkspaceQuery(target).queryKey
}

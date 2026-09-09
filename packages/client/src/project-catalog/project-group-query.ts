import { queryOptions } from '@tanstack/react-query'
import { listRuntimeProjectGroups } from '~renderer/runtime/project-group-target'
import { targetKey } from '~renderer/runtime/query-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

export function projectCatalogProjectGroupQuery(target: RuntimeClientTarget) {
  return queryOptions({
    queryKey: ['project-catalog', 'project-groups', targetKey(target)] as const,
    queryFn: () => listRuntimeProjectGroups(target)
  })
}

export function projectCatalogProjectGroupQueryKey(target: RuntimeClientTarget) {
  return projectCatalogProjectGroupQuery(target).queryKey
}

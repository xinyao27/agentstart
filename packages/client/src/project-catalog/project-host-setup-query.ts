import { queryOptions } from '@tanstack/react-query'
import { listRuntimeProjectHostSetups } from '~renderer/runtime/project-host-setup-target'
import { targetKey } from '~renderer/runtime/query-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

export function projectCatalogProjectHostSetupQuery(target: RuntimeClientTarget) {
  return queryOptions({
    queryKey: ['project-catalog', 'project-host-setups', targetKey(target)] as const,
    queryFn: () => listRuntimeProjectHostSetups(target)
  })
}

export function projectCatalogProjectHostSetupQueryKey(target: RuntimeClientTarget) {
  return projectCatalogProjectHostSetupQuery(target).queryKey
}

import { queryOptions } from '@tanstack/react-query'
import { targetKey } from '~renderer/runtime/query-target'
import { listRuntimeRepos } from '~renderer/runtime/repo-catalog-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'

export function projectCatalogRepoQuery(target: RuntimeClientTarget) {
  return queryOptions({
    queryKey: ['project-catalog', 'repos', targetKey(target)] as const,
    queryFn: () => listRuntimeRepos(target)
  })
}

export function projectCatalogRepoQueryKey(target: RuntimeClientTarget) {
  return projectCatalogRepoQuery(target).queryKey
}
